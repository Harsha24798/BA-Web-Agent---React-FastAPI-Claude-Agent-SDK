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
from app.db.models import Document, GenerationJob, LlmModel, Project, User
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
        self.think_ticks = 0
        self.draft_ticks = 0
        self.tool_calls = 0
        self.last_pct = 0  # progress only ever climbs

    def bump(self, phase: str, frac: float = 0.0) -> int:
        lo, hi = PHASE_BOUNDS.get(phase, (0, 100))
        pct = int(lo + (hi - lo) * min(max(frac, 0.0), 1.0))
        self.last_pct = max(self.last_pct, pct)
        return self.last_pct


def _finalize(job_id: str, *, data: dict, model_id: str, template_id: str | None,
              source_hash: str, session_id: str | None) -> tuple[int, str]:
    """Blocking: validate, render md/docx/pdf, write the version, mark the job complete.

    Runs in a worker thread (via asyncio.to_thread) so PDF/DOCX rendering never blocks the
    event loop / other requests. Uses its own DB session (thread-confined).
    """
    with SessionLocal() as db:
        job = db.get(GenerationJob, job_id)
        project = db.get(Project, job.project_id)
        if session_id:
            job.sdk_session_id = session_id
            db.commit()
        version = srs_output.write_version(
            db, project=project, data=data, model_id=model_id, template_id=template_id,
            source_docs_hash=source_hash, generated_by=job.triggered_by, job_id=job.id,
        )
        summary = srs_output.summarize(data)
        version_no = version.version_no
        job.status = "completed"
        job.phase = "finalizing"
        job.percent = 100
        job.current_activity = "Done"
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        return version_no, summary


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
        model_row = db.scalar(select(LlmModel).where(LlmModel.model_id == model_id))
        model_display = model_row.display_name if model_row else model_id
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
            "percent": prog.bump(phase, frac), "current_activity": activity,
        })

    async def log(text: str, kind: str = "info") -> None:
        await manager.publish(job_id, {
            "type": "log", "seq": manager.next_seq(job_id),
            "ts": datetime.now(timezone.utc).isoformat(), "kind": kind, "text": text,
        }, persist=False, persist_event=True)

    async def on_event(kind: str, payload: dict) -> None:
        if kind == "tool_use":
            name = payload.get("name", "")
            prog.tool_calls += 1
            inp = payload.get("input", {}) or {}
            target = inp.get("file_path") or inp.get("pattern") or inp.get("path") or ""
            if name.startswith("mcp__"):
                parts = name.split("__")
                srv = parts[1] if len(parts) > 1 else "?"
                tool = parts[2] if len(parts) > 2 else name
                await log(f"{srv} · {tool}{(' ' + str(target)) if target else ''}", kind="mcp")
            else:
                await log(f"{name}{(' · ' + str(target)) if target else ''}", kind="tool")
            if name in ("Read", "Glob", "Grep"):
                prog.docs_read += 1
                frac = min(1.0, prog.docs_read / prog.total_docs)
                await emit("reading_docs", frac, f"Reading documents ({target or name})")
        elif kind == "text":
            prog.draft_ticks += 1
            frac = prog.draft_ticks / (prog.draft_ticks + 8)  # climbs toward the phase top
            snippet = " ".join((payload.get("text") or "").split())[:200]
            if snippet:
                await log(snippet, kind="text")
            await emit("drafting_srs", frac, "Drafting the SRS…")
        elif kind == "partial":
            prog.think_ticks += 1
            frac = prog.think_ticks / (prog.think_ticks + 40)
            await emit("analyzing", frac, "Analyzing the documents…")

    try:
        await emit("preparing", 0.5, "Preparing workspace…")
        await log(f"model: {model_display}", kind="info")
        await log(f"tools: {', '.join(tools) or 'Read, Glob, Grep'}", kind="info")
        await log(f"reading {len(docs)} document(s)…", kind="info")
        data, session_id, metrics = await run_agent(
            system_prompt=system_prompt,
            allowed_tools=tools,
            cwd=workspace,
            model=model_id,
            run_prompt=run_prompt,
            on_event=on_event,
        )

        await emit("rendering_outputs", 0.2, "Rendering SRS documents…")
        # Heavy work (schema validation, DOCX/PDF rendering, file writes, DB commit) runs in a
        # worker thread so it never blocks the single event loop.
        version_no, summary = await asyncio.to_thread(
            _finalize, job_id, data=data, model_id=model_id, template_id=template_id,
            source_hash=source_hash, session_id=session_id,
        )
        await emit("finalizing", 1.0, "Finalizing…")

        # Build the run cost/time summary from the SDK metrics.
        cost_summary = {
            "model": model_display,
            "duration_ms": metrics.duration_ms,
            "input_tokens": metrics.input_tokens,
            "output_tokens": metrics.output_tokens,
            "total_cost_usd": metrics.total_cost_usd,
            "num_turns": metrics.num_turns,
            "tool_calls": prog.tool_calls,
            "version_no": version_no,
        }
        await manager.publish(job_id, {
            "type": "summary", "seq": manager.next_seq(job_id), **cost_summary,
        }, persist=False, persist_event=True)
        secs = (metrics.duration_ms / 1000) if metrics.duration_ms else None
        cost = f"${metrics.total_cost_usd:.4f}" if metrics.total_cost_usd is not None else "n/a"
        toks = (f"{metrics.input_tokens or 0} in / {metrics.output_tokens or 0} out")
        await log(f"completed in {secs:.1f}s · {toks} tokens · {cost}"
                  if secs is not None else f"completed · {toks} tokens · {cost}", kind="done")

        if trigger_email:
            # smtplib is blocking (and can stall for its full timeout) — keep it off the loop.
            await asyncio.to_thread(
                email_service.send_srs_generated,
                trigger_email, trigger_name, project_name, version_no, model_id, summary, project_url,
            )
        await manager.publish(job_id, {
            "type": "done", "status": "completed", "srs_version": version_no,
            "summary": cost_summary,
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
        try:
            await manager.publish(job_id, {
                "type": "log", "seq": manager.next_seq(job_id),
                "ts": datetime.now(timezone.utc).isoformat(),
                "kind": "error", "text": msg,
            }, persist=False, persist_event=True)
        except Exception:  # noqa: BLE001
            pass
        await manager.publish(job_id, {
            "type": "done", "status": "cancelled" if cancelled else "failed", "error": msg,
        }, persist=False)
        if cancelled:
            raise
