"""Admin-only extras: regenerate-access requests."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.db.database import get_db
from app.db.models import Project, RegenRequest, User
from app.schemas import MessageOut, RegenRequestOut

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _name_maps(db: Session) -> tuple[dict[str, str], dict[str, str]]:
    users = {u.id: u.full_name for u in db.scalars(select(User))}
    projects = {p.id: p.name for p in db.scalars(select(Project))}
    return users, projects


# ---------------- regenerate access requests ----------------
@router.get("/regen-requests", response_model=list[RegenRequestOut])
def list_regen_requests(project_id: str | None = None, status_filter: str | None = None,
                        db: Session = Depends(get_db)):
    stmt = select(RegenRequest)
    if project_id:
        stmt = stmt.where(RegenRequest.project_id == project_id)
    if status_filter:
        stmt = stmt.where(RegenRequest.status == status_filter)
    stmt = stmt.order_by(RegenRequest.created_at.desc())
    users, projects = _name_maps(db)
    return [
        RegenRequestOut(
            id=r.id, user_id=r.user_id, user_name=users.get(r.user_id, "(deleted user)"),
            project_id=r.project_id, project_name=projects.get(r.project_id, "(deleted project)"),
            status=r.status, created_at=r.created_at, decided_at=r.decided_at)
        for r in db.scalars(stmt)
    ]


def _decide(db: Session, req_id: str, admin: User, new_status: str) -> None:
    r = db.get(RegenRequest, req_id)
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if r.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Request already {r.status}.")
    r.status = new_status
    r.decided_by = admin.id
    r.decided_at = datetime.now(timezone.utc)
    db.commit()


@router.post("/regen-requests/{req_id}/approve", response_model=MessageOut)
def approve_regen(req_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    _decide(db, req_id, admin, "approved")
    return MessageOut(detail="Approved — the user can now regenerate this project once.")


@router.post("/regen-requests/{req_id}/reject", response_model=MessageOut)
def reject_regen(req_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    _decide(db, req_id, admin, "rejected")
    return MessageOut(detail="Request rejected.")
