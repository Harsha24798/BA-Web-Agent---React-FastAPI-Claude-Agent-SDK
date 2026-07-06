"""SRS version listing + downloads."""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_active
from app.db.database import get_db
from app.db.models import JobEvent, SrsVersion, User
from app.schemas import VersionOut

router = APIRouter(prefix="/projects", tags=["srs"])

_FMT = {
    "md": ("md_path", "text/markdown"),
    "json": ("json_path", "application/json"),
    "docx": ("docx_path", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "pdf": ("pdf_path", "application/pdf"),
}


def _get_version(db: Session, project_id: str, n: int) -> SrsVersion:
    v = db.scalar(select(SrsVersion).where(SrsVersion.project_id == project_id,
                                           SrsVersion.version_no == n))
    if not v:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")
    return v


@router.get("/{project_id}/versions", response_model=list[VersionOut])
def list_versions(project_id: str, user: User = Depends(require_active),
                  db: Session = Depends(get_db)):
    rows = db.scalars(select(SrsVersion).where(SrsVersion.project_id == project_id)
                      .order_by(SrsVersion.version_no.desc()))
    return [VersionOut.model_validate(v) for v in rows]


@router.get("/{project_id}/versions/{n}")
def version_meta(project_id: str, n: int, user: User = Depends(require_active),
                 db: Session = Depends(get_db)):
    v = _get_version(db, project_id, n)
    data = {}
    if v.json_path and Path(v.json_path).exists():
        data = json.loads(Path(v.json_path).read_text(encoding="utf-8"))
    return {"version_no": v.version_no, "model_id": v.model_id,
            "host_sync_status": v.host_sync_status, "srs": data}


@router.get("/{project_id}/versions/{n}/report")
def version_report(project_id: str, n: int, user: User = Depends(require_active),
                   db: Session = Depends(get_db)):
    """The generation run report (cost/time summary + terminal log) for a version's job."""
    v = _get_version(db, project_id, n)
    if not v.job_id:
        return {"summary": None, "events": []}
    stored = [json.loads(e.payload_json) for e in db.scalars(
        select(JobEvent).where(JobEvent.job_id == v.job_id).order_by(JobEvent.seq)
    )]
    summary = next((e for e in reversed(stored) if e.get("type") == "summary"), None)
    if summary:
        summary = {k: val for k, val in summary.items() if k not in ("type", "seq")}
    events = [e for e in stored if e.get("type") == "log"]
    return {"summary": summary, "events": events}


@router.get("/{project_id}/versions/{n}/download/{fmt}")
def download(project_id: str, n: int, fmt: str, user: User = Depends(require_active),
             db: Session = Depends(get_db)):
    if fmt not in _FMT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid format")
    v = _get_version(db, project_id, n)
    attr, media = _FMT[fmt]
    path = getattr(v, attr)
    if not path or not Path(path).exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    return FileResponse(path, media_type=media, filename=f"srs-v{n}.{fmt}")
