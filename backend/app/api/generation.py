"""Generate / regenerate endpoints + job status + cancel."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.models import allowed_model_ids
from app.auth.deps import require_active, require_admin
from app.db.database import get_db
from app.db.models import GenerationJob, Project, User
from app.jobs.generation import run_job
from app.jobs.manager import manager
from app.schemas import GenerateIn, JobOut, MessageOut
from app.services import status as status_svc

router = APIRouter(prefix="/projects", tags=["generation"])


def _get_project(db: Session, project_id: str) -> Project:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


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
def generate(project_id: str, body: GenerateIn, user: User = Depends(require_active),
             db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    if user.role != "admin" and project.current_srs_version_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "This project already has an SRS. Ask an admin to regenerate.")
    job = _start_job(db, project, user, body.model_id, regen=bool(project.current_srs_version_id))
    return JobOut.model_validate(job)


@router.post("/{project_id}/regenerate", response_model=JobOut)
def regenerate(project_id: str, body: GenerateIn, admin: User = Depends(require_admin),
               db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
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
