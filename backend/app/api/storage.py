"""Host storage: send a version + sync current version + status badge."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_active
from app.db.database import get_db
from app.db.models import Project, SrsVersion, User
from app.schemas import MessageOut
from app.services import status as status_svc
from app.services.storage import get_storage

router = APIRouter(prefix="/projects", tags=["storage"])


def _get_project(db: Session, project_id: str) -> Project:
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return p


def _push_version(db: Session, project: Project, version: SrsVersion) -> str:
    if not version.json_path:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Version has no output files")
    source_dir = Path(version.json_path).parent
    if not source_dir.exists():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Output files are missing on disk")
    dest = get_storage().push(project.slug, version.version_no, source_dir)
    version.host_sync_status = "synced"
    version.host_synced_at = datetime.now(timezone.utc)
    db.commit()
    return dest


@router.post("/{project_id}/srs/{version}/send-host", response_model=MessageOut)
def send_host(project_id: str, version: int, user: User = Depends(require_active),
              db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    v = db.scalar(select(SrsVersion).where(SrsVersion.project_id == project_id,
                                           SrsVersion.version_no == version))
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")
    dest = _push_version(db, project, v)
    return MessageOut(detail=f"Sent to host storage: {dest}")


@router.post("/{project_id}/sync-host", response_model=MessageOut)
def sync_host(project_id: str, user: User = Depends(require_active),
              db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    v = status_svc.current_version(db, project)
    if not v:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No SRS to sync yet")
    dest = _push_version(db, project, v)
    return MessageOut(detail=f"Host storage is up to date: {dest}")


@router.get("/{project_id}/host-status")
def host_status(project_id: str, user: User = Depends(require_active),
                db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    v = status_svc.current_version(db, project)
    return {
        "host_sync_status": status_svc.host_sync_badge(db, project),
        "current_version_no": v.version_no if v else None,
        "host_synced_at": v.host_synced_at if v else None,
    }
