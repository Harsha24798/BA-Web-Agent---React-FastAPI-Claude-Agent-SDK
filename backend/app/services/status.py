"""Project status helpers: combined docs hash, stale detection, host-sync badge."""
from __future__ import annotations

import hashlib

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Document, GenerationJob, Project, SrsVersion


def combined_docs_hash(db: Session, project_id: str) -> str:
    rows = db.scalars(
        select(Document.content_hash)
        .where(Document.project_id == project_id, Document.is_deleted == False)  # noqa: E712
        .order_by(Document.content_hash)
    )
    joined = "|".join(h for h in rows if h)
    return hashlib.sha256(joined.encode()).hexdigest() if joined else ""


def current_version(db: Session, project: Project) -> SrsVersion | None:
    if not project.current_srs_version_id:
        return None
    return db.get(SrsVersion, project.current_srs_version_id)


def recompute_status(db: Session, project: Project) -> None:
    """Set srs_status to none/generated/stale based on current docs vs the active version."""
    version = current_version(db, project)
    if version is None:
        project.srs_status = "none"
        return
    if combined_docs_hash(db, project.id) != version.source_docs_hash:
        project.srs_status = "stale"
    else:
        project.srs_status = "generated"


def active_job(db: Session, project_id: str) -> GenerationJob | None:
    return db.scalar(
        select(GenerationJob).where(
            GenerationJob.project_id == project_id,
            GenerationJob.status.in_(["queued", "running"]),
        )
    )


def host_sync_badge(db: Session, project: Project) -> str:
    """not_sent | synced | out_of_date (project-level)."""
    version = current_version(db, project)
    if version is None:
        return "not_sent"
    if version.host_sync_status == "synced":
        return "synced"
    # current version not synced; if any older version was synced → out_of_date, else not_sent
    any_synced = db.scalar(
        select(SrsVersion).where(
            SrsVersion.project_id == project.id,
            SrsVersion.host_sync_status == "synced",
        )
    )
    return "out_of_date" if any_synced else "not_sent"
