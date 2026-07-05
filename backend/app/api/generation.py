"""Generate / regenerate endpoints + job status + cancel."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.models import allowed_model_ids
from app.auth.deps import require_active, require_admin
from app.db.database import get_db
from app.db.models import AppSettings, GenerationJob, Project, User
from app.jobs.generation import run_job
from app.jobs.manager import manager
from app.schemas import GenerateIn, JobOut, MessageOut
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


def _start_job(db: Session, project: Project, user: User, model_id: str, regen: bool) -> GenerationJob:
    if model_id not in allowed_model_ids(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have access to that model")
    if status_svc.active_job(db, project.id):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "A generation is already running for this project")
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


@router.post("/{project_id}/generate", response_model=JobOut)
async def generate(project_id: str, body: GenerateIn, user: User = Depends(require_active),
                   db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    if user.role != "admin" and project.current_srs_version_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "This project already has an SRS. Ask an admin to regenerate.")
    await _ensure_anthropic_ready(db)
    job = _start_job(db, project, user, body.model_id, regen=bool(project.current_srs_version_id))
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
