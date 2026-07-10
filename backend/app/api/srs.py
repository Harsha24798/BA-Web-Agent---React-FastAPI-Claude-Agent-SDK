"""SRS version listing + downloads."""
from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_active
from app.db.database import get_db
from app.db.models import JobEvent, Project, SrsVersion, User
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


def _load_srs(v: SrsVersion) -> dict:
    if v.json_path and Path(v.json_path).exists():
        return json.loads(Path(v.json_path).read_text(encoding="utf-8"))
    return {}


@router.get("/{project_id}/versions/{n}/diagrams")
def list_diagrams(project_id: str, n: int, user: User = Depends(require_active),
                  db: Session = Depends(get_db)):
    """Diagram metadata for a version (Mermaid source fetched separately per diagram)."""
    v = _get_version(db, project_id, n)
    diagrams = _load_srs(v).get("diagrams", []) or []
    return [{"id": d.get("id"), "title": d.get("title"), "type": d.get("type", ""),
             "description": d.get("description", "")}
            for d in diagrams if d.get("id")]


@router.get("/{project_id}/versions/{n}/diagrams/{diagram_id}")
def download_diagram(project_id: str, n: int, diagram_id: str,
                     user: User = Depends(require_active), db: Session = Depends(get_db)):
    """The Mermaid (.mmd) source for one diagram, looked up by its id in srs.json."""
    v = _get_version(db, project_id, n)
    diagrams = _load_srs(v).get("diagrams", []) or []
    d = next((x for x in diagrams if x.get("id") == diagram_id), None)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Diagram not found")
    base_dir = Path(v.json_path).parent if v.json_path else None
    rel = d.get("file")
    if base_dir and rel and (base_dir / rel).exists():
        return FileResponse(str(base_dir / rel), media_type="text/plain",
                            filename=f"{diagram_id}.mmd")
    # Fallback: serve the source straight from srs.json if the file is missing.
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(d.get("mermaid", ""), media_type="text/plain",
                             headers={"Content-Disposition": f'attachment; filename="{diagram_id}.mmd"'})


@router.get("/{project_id}/versions/{n}/bundle.zip")
def download_bundle(project_id: str, n: int, user: User = Depends(require_active),
                    db: Session = Depends(get_db)):
    """All resources for a version (srs.md/json/docx/pdf + diagrams) as a single ZIP."""
    v = _get_version(db, project_id, n)
    base = Path(v.json_path).parent if v.json_path else None
    if not base or not base.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version files not found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        added: set[str] = set()
        for p in sorted(base.rglob("*")):
            if p.is_file():
                arc = p.relative_to(base).as_posix()
                z.write(p, arc)
                added.add(arc)
        # Backfill diagrams that only exist in srs.json (versions made before the .mmd files landed).
        for d in _load_srs(v).get("diagrams", []) or []:
            arc = f"diagrams/{d.get('id')}.mmd"
            if d.get("id") and d.get("mermaid") and arc not in added:
                z.writestr(arc, d["mermaid"])
    buf.seek(0)

    proj = db.get(Project, project_id)
    fname = f"{(proj.slug if proj else 'srs')}-v{n}.zip"
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})


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
