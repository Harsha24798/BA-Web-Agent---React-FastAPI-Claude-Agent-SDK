"""Orchestrate a single generation run: agent → validate → render → version → email."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.agent import prompt as prompt_mod
from app.agent.runner import run_agent
from app.config import settings
from app.db.database import SessionLocal
from app.db.models import Document, GenerationJob, Project, User
from app.jobs.manager import manager
from app.services import srs_output, status as status_svc
from app.services import email as email_service
from app.services.ingestion import workspace_context_dir

logger = logging.getLogger("ba-agent.generation")

PHASE_BOUNDS = {
    "preparing": (5, 15),
    "reading_docs": (15, 40),
    "analyzing": (40, 65),
    "drafting_srs": (65, 85),
    "rendering_outputs": (85, 97),
    "finalizing": (97, 100),
}


class _Progress:
    def __init__(self, total_docs: int) -> None:
        self.total_docs = max(total_docs, 1)
        self.docs_read = 0
        self.phase = "preparing"

    def pct_for(self, phase: str, frac: float = 0.0) -> int:
        lo, hi = PHASE_BOUNDS.get(phase, (0, 100))
        return int(lo + (hi - lo) * min(max(frac, 0.0), 1.0))


async def run_job(job_id: str) -> None:
    with SessionLocal() as db:
        job = db.get(GenerationJob, job_id)
        if not job:
            return
        project = db.get(Project, job.project_id)
        trigger = db.get(User, job.triggered_by)
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        db.commit()

        docs = list(db.scalars(
            select(Document).where(Document.project_id == project.id,
                                   Document.is_deleted == False)  # noqa: E712
        ))
        prog = _Progress(len(docs))
        model_id = job.model_id
        template = prompt_mod.active_template(db)
        template_id = template.id if template else None
        system_prompt = prompt_mod.build_system_prompt(db)
        tools = prompt_mod.enabled_tool_keys(db)
        source_hash = status_svc.combined_docs_hash(db, project.id)
        workspace = workspace_context_dir(project.id).parent  # cwd = workspaces/<id>
        run_prompt = prompt_mod.build_run_prompt()
        project_url = f"{settings.app_base_url}/projects/{project.id}"
        trigger_email = trigger.email if trigger else ""
        trigger_name = trigger.full_name if trigger else ""
        project_name = project.name

    async def emit(phase: str, frac: float, activity: str) -> None:
        await manager.publish(job_id, {
            "type": "progress", "phase": phase,
            "percent": prog.pct_for(phase, frac), "current_activity": activity,
        })

    async def on_event(kind: str, payload: dict) -> None:
        if kind == "tool_use":
            name = payload.get("name", "")
            if name in ("Read", "Glob", "Grep"):
                prog.docs_read += 1
                frac = prog.docs_read / prog.total_docs
                target = payload.get("input", {}).get("file_path") or name
                await emit("reading_docs", frac, f"Reading documents ({target})")
        elif kind == "text":
            await emit("drafting_srs", 0.5, "Analyzing and drafting the SRS…")
        elif kind == "partial":
            await emit("analyzing", 0.4, "Thinking…")

    try:
        await emit("preparing", 0.5, "Preparing workspace…")
        data, session_id = await run_agent(
            system_prompt=system_prompt,
            allowed_tools=tools,
            cwd=workspace,
            model=model_id,
            run_prompt=run_prompt,
            on_event=on_event,
        )

        await emit("rendering_outputs", 0.2, "Rendering SRS documents…")
        with SessionLocal() as db:
            job = db.get(GenerationJob, job_id)
            project = db.get(Project, job.project_id)
            if session_id:
                job.sdk_session_id = session_id
                db.commit()
            version = srs_output.write_version(
                db,
                project=project,
                data=data,
                model_id=model_id,
                template_id=template_id,
                source_docs_hash=source_hash,
                generated_by=job.triggered_by,
                job_id=job.id,
            )
            summary = srs_output.summarize(data)
            version_no = version.version_no

            await emit("finalizing", 0.5, "Finalizing…")
            job.status = "completed"
            job.phase = "finalizing"
            job.percent = 100
            job.current_activity = "Done"
            job.finished_at = datetime.now(timezone.utc)
            db.commit()

        if trigger_email:
            email_service.send_srs_generated(
                trigger_email, trigger_name, project_name, version_no, model_id, summary, project_url
            )
        await manager.publish(job_id, {
            "type": "done", "status": "completed", "srs_version": version_no,
        }, persist=False)

    except (Exception, asyncio.CancelledError) as e:
        cancelled = isinstance(e, asyncio.CancelledError)
        msg = "Cancelled" if cancelled else str(e)
        logger.error("generation job %s failed: %s", job_id, msg)
        with SessionLocal() as db:
            job = db.get(GenerationJob, job_id)
            if job:
                job.status = "cancelled" if cancelled else "failed"
                job.error_message = msg
                job.finished_at = datetime.now(timezone.utc)
                db.commit()
        await manager.publish(job_id, {
            "type": "done", "status": "cancelled" if cancelled else "failed", "error": msg,
        }, persist=False)
        if cancelled:
            raise
