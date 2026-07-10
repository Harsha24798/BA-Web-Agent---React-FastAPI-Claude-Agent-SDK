"""Project CRUD."""
from __future__ import annotations

import shutil

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import require_active, require_admin
from app.config import settings
from app.db.database import get_db
from app.db.models import Document, Project, RegenRequest, SrsVersion, User
from app.api.srs import version_out
from app.schemas import (
    DocumentOut,
    ProjectCreateIn,
    ProjectDetailOut,
    ProjectOut,
)
from app.services import status as status_svc
from app.services.ingestion import safe_slug

router = APIRouter(prefix="/projects", tags=["projects"])


def serialize_project(db: Session, p: Project) -> ProjectOut:
    job = status_svc.active_job(db, p.id)
    srs_status = "generating" if job else p.srs_status
    version = status_svc.current_version(db, p)
    doc_count = db.scalar(
        select(func.count(Document.id)).where(
            Document.project_id == p.id, Document.is_deleted == False  # noqa: E712
        )
    ) or 0
    return ProjectOut(
        id=p.id, name=p.name, slug=p.slug, created_by=p.created_by, created_at=p.created_at,
        srs_status=srs_status,
        host_sync_status=status_svc.host_sync_badge(db, p),
        current_version_no=version.version_no if version else None,
        active_job_id=job.id if job else None,
        document_count=int(doc_count),
    )


def _unique_slug(db: Session, name: str) -> str:
    base = safe_slug(name).lower() or "project"
    slug = base
    n = 1
    while db.scalar(select(Project).where(Project.slug == slug)):
        n += 1
        slug = f"{base}-{n}"
    return slug


@router.get("", response_model=list[ProjectOut])
def list_projects(user: User = Depends(require_active), db: Session = Depends(get_db)):
    rows = db.scalars(select(Project).order_by(Project.created_at.desc()))
    return [serialize_project(db, p) for p in rows]


@router.post("", response_model=ProjectOut)
def create_project(body: ProjectCreateIn, user: User = Depends(require_active),
                   db: Session = Depends(get_db)):
    project = Project(name=body.name.strip(), slug=_unique_slug(db, body.name),
                      created_by=user.id, srs_status="none")
    db.add(project)
    db.commit()
    return serialize_project(db, project)


@router.get("/{project_id}", response_model=ProjectDetailOut)
def get_project(project_id: str, user: User = Depends(require_active),
                db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    base = serialize_project(db, project)
    docs = db.scalars(
        select(Document).where(Document.project_id == project_id, Document.is_deleted == False)  # noqa: E712
        .order_by(Document.uploaded_at)
    )
    versions = db.scalars(
        select(SrsVersion).where(SrsVersion.project_id == project_id)
        .order_by(SrsVersion.version_no.desc())
    )
    # Current user's regenerate-access state for this project (used→none: they can request again).
    req = db.scalar(
        select(RegenRequest).where(
            RegenRequest.user_id == user.id, RegenRequest.project_id == project_id)
        .order_by(RegenRequest.created_at.desc())
    )
    my_regen = req.status if req and req.status in ("pending", "approved", "rejected") else "none"
    return ProjectDetailOut(
        **base.model_dump(),
        documents=[DocumentOut.model_validate(d) for d in docs],
        versions=[version_out(db, v) for v in versions],
        my_regen_status=my_regen,
    )


@router.delete("/{project_id}")
def delete_project(project_id: str, admin: User = Depends(require_admin),
                   db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    slug = project.slug
    db.delete(project)
    db.commit()
    # best-effort file cleanup
    for path in (settings.uploads_dir / project_id, settings.workspaces_dir / project_id,
                 settings.ba_output_dir / slug):
        shutil.rmtree(path, ignore_errors=True)
    return {"detail": "Project deleted."}
