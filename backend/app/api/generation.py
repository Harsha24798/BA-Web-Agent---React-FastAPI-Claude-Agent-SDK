"""Generate / regenerate endpoints + job status + cancel."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.models import allowed_model_ids
from app.auth.deps import require_active, require_admin
from app.db.database import get_db
from app.db.models import AppSettings, GenerationJob, Project, RegenRequest, User
from app.jobs.generation import run_job
from app.jobs.manager import manager
from app.schemas import GenerateIn, GenerationActiveOut, JobOut, MessageOut
from app.services import settings_service as settings_svc
from app.services import status as status_svc
from app.services.settings_service import effective_anthropic_key

router = APIRouter(prefix="/projects", tags=["generation"])


def _get_project(db: Session, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


async def _ensure_anthropic_ready(db: Session) -> None:
    """Block generation unless the Anthropic key is actually connected.

    - No key at all -> clear 'not configured' error.
    - Key present but status not yet 'connected' -> validate live now (and cache the result),
      so a missing/invalid key fails immediately instead of starting a doomed job.
    """
    key = effective_anthropic_key()
    if not key:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "SRS generation isn't set up yet — the AI API key is not configured. "
            "Please contact your administrator.",
        )
    row = db.get(AppSettings, settings_svc.SINGLETON_ID)
    if row and row.anthropic_status == "connected":
        return
    # Not confirmed yet — test the key live (runs off the event loop).
    conn_status, error = await asyncio.to_thread(settings_svc.test_anthropic, key)
    row = settings_svc.get_or_create(db)
    row.anthropic_status = conn_status
    row.anthropic_error = error
    row.anthropic_checked_at = datetime.now(timezone.utc)
    db.commit()
    if conn_status != "connected":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "The AI API key is not connected (it may be missing or invalid). "
            "Please contact your administrator.",
        )


def _lock_message(db: Session, active: GenerationJob) -> str:
    """A friendly 'someone else is generating' message naming the user + project."""
    other = db.get(User, active.triggered_by)
    proj = db.get(Project, active.project_id)
    who = other.full_name if other else "Another user"
    pname = proj.name if proj else "a project"
    return f"{who} is currently generating an SRS for '{pname}'. Please wait until it completes."


def _start_job(db: Session, project: Project, user: User, model_id: str, regen: bool) -> GenerationJob:
    if model_id not in allowed_model_ids(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have access to that model")
    # System-wide single-generation lock: only one SRS run at a time across ALL projects/users.
    active = status_svc.global_active_job(db)
    if active:
        raise HTTPException(status.HTTP_409_CONFLICT, _lock_message(db, active))
    has_docs = any(not d.is_deleted for d in project.documents)
    if not has_docs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Upload at least one document first")

    job = GenerationJob(project_id=project.id, status="queued", phase="queued", percent=0,
                        model_id=model_id, triggered_by=user.id, is_regeneration=regen)
    db.add(job)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "A generation is already running for this project")
    task = asyncio.create_task(run_job(job.id))
    manager.register(job.id, task)
    return job


def _approved_regen_request(db: Session, user_id: str, project_id: str) -> RegenRequest | None:
    return db.scalar(select(RegenRequest).where(
        RegenRequest.user_id == user_id, RegenRequest.project_id == project_id,
        RegenRequest.status == "approved"))


@router.post("/{project_id}/generate", response_model=JobOut)
async def generate(project_id: str, body: GenerateIn, user: User = Depends(require_active),
                   db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    regen = bool(project.current_srs_version_id)
    consumed: RegenRequest | None = None
    if user.role != "admin" and regen:
        # Non-admin regenerate needs an admin-approved, single-use access grant.
        consumed = _approved_regen_request(db, user.id, project.id)
        if not consumed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "This project already has an SRS. Request regenerate access from an admin.")
    await _ensure_anthropic_ready(db)
    job = _start_job(db, project, user, body.model_id, regen=regen)
    if consumed is not None:  # grant is single-use — consume it now that the run has started
        consumed.status = "used"
        db.commit()
    return JobOut.model_validate(job)


@router.post("/{project_id}/regenerate", response_model=JobOut)
async def regenerate(project_id: str, body: GenerateIn, admin: User = Depends(require_admin),
                     db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    await _ensure_anthropic_ready(db)
    job = _start_job(db, project, admin, body.model_id, regen=True)
    return JobOut.model_validate(job)


@router.get("/{project_id}/jobs/{job_id}", response_model=JobOut)
def job_status(project_id: str, job_id: str, user: User = Depends(require_active),
               db: Session = Depends(get_db)):
    job = db.get(GenerationJob, job_id)
    if not job or job.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return JobOut.model_validate(job)


@router.post("/{project_id}/jobs/{job_id}/cancel", response_model=MessageOut)
def cancel_job(project_id: str, job_id: str, user: User = Depends(require_active),
               db: Session = Depends(get_db)):
    job = db.get(GenerationJob, job_id)
    if not job or job.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    if user.role != "admin" and job.triggered_by != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
    manager.cancel(job_id)
    return MessageOut(detail="Cancellation requested.")


@router.post("/{project_id}/regen-request", response_model=MessageOut)
def request_regen(project_id: str, user: User = Depends(require_active),
                  db: Session = Depends(get_db)):
    """A non-admin asks an admin for single-use permission to regenerate this project's SRS."""
    project = _get_project(db, project_id)
    if not project.current_srs_version_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "This project has no SRS yet — you can generate it directly.")
    existing = db.scalar(select(RegenRequest).where(
        RegenRequest.user_id == user.id, RegenRequest.project_id == project.id,
        RegenRequest.status.in_(["pending", "approved"])))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "You already have a pending or approved regenerate request for this project.")
    db.add(RegenRequest(user_id=user.id, project_id=project.id, status="pending"))
    db.commit()
    return MessageOut(detail="Regenerate access requested. An admin will review it.")


# Global generation status (any active user) — powers the system-wide "one at a time" lock UI.
gen_status_router = APIRouter(prefix="/generation", tags=["generation"])


@gen_status_router.get("/active", response_model=GenerationActiveOut)
def generation_active(user: User = Depends(require_active), db: Session = Depends(get_db)):
    job = status_svc.global_active_job(db)
    if not job:
        return GenerationActiveOut(busy=False)
    u = db.get(User, job.triggered_by)
    p = db.get(Project, job.project_id)
    return GenerationActiveOut(
        busy=True, job_id=job.id, project_id=job.project_id,
        project_name=p.name if p else None, user_name=u.full_name if u else None)
