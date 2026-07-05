"""Admin user management + per-user model access."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.auth.security import hash_password
from app.auth.tokens import issue_token
from app.config import settings
from app.db.database import get_db
from app.services.settings_service import effective_smtp
from app.db.models import (
    AgentPrompt,
    AgentTool,
    AppSettings,
    AuthToken,
    Document,
    GenerationJob,
    Project,
    SrsVersion,
    Template,
    User,
    UserModel,
)
from app.schemas import MessageOut, RoleIn, UserEditIn, UserModelsIn, UserOut
from app.services import email as email_service

router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(require_admin)])


def _get_user(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


def _active_admin_count(db: Session) -> int:
    return len(list(db.scalars(select(User).where(User.role == "admin", User.status == "active"))))


@router.get("", response_model=list[UserOut])
def list_users(status_filter: str | None = None, db: Session = Depends(get_db)) -> list[UserOut]:
    stmt = select(User).order_by(User.created_at.desc())
    if status_filter:
        stmt = stmt.where(User.status == status_filter)
    return [UserOut.model_validate(u) for u in db.scalars(stmt)]


@router.get("/pending", response_model=list[UserOut])
def pending(db: Session = Depends(get_db)) -> list[UserOut]:
    rows = db.scalars(select(User).where(User.status == "pending").order_by(User.created_at))
    return [UserOut.model_validate(u) for u in rows]


@router.post("/{user_id}/approve", response_model=MessageOut)
def approve(user_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = _get_user(db, user_id)
    user.status = "active"
    user.approved_by = admin.id
    user.approved_at = datetime.now(timezone.utc)
    raw = issue_token(db, user.id, purpose="set_password")
    db.commit()
    email_service.send_approved(user.email, user.full_name, raw)
    # When SMTP is off the email isn't actually sent — surface the link so the admin can share it.
    link = None if effective_smtp().configured else email_service.pending_links.get(user.email.lower())
    return MessageOut(detail="User approved.", link=link)


@router.post("/{user_id}/reject", response_model=MessageOut)
def reject(user_id: str, db: Session = Depends(get_db)):
    user = _get_user(db, user_id)
    user.status = "rejected"
    db.commit()
    return MessageOut(detail="User rejected.")


@router.post("/{user_id}/disable", response_model=MessageOut)
def disable(user_id: str, db: Session = Depends(get_db)):
    user = _get_user(db, user_id)
    if user.role == "admin" and user.status == "active" and _active_admin_count(db) <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot disable the last active admin")
    user.status = "disabled"
    db.commit()
    return MessageOut(detail="User disabled.")


@router.post("/{user_id}/enable", response_model=MessageOut)
def enable(user_id: str, db: Session = Depends(get_db)):
    user = _get_user(db, user_id)
    user.status = "active"
    db.commit()
    return MessageOut(detail="User enabled.")


@router.post("/{user_id}/reset-password", response_model=MessageOut)
def reset_password(user_id: str, db: Session = Depends(get_db)):
    user = _get_user(db, user_id)
    raw = issue_token(db, user.id, purpose="set_password")
    db.commit()
    email_service.send_reset(user.email, user.full_name, raw)
    link = None if effective_smtp().configured else email_service.pending_links.get(user.email.lower())
    return MessageOut(detail="Reset link sent.", link=link)


@router.patch("/{user_id}", response_model=UserOut)
def edit_user(user_id: str, body: UserEditIn, db: Session = Depends(get_db)):
    user = _get_user(db, user_id)
    if body.full_name is not None and body.full_name.strip():
        user.full_name = body.full_name.strip()
    if body.email is not None:
        new_email = body.email.lower()
        clash = db.scalar(select(User).where(User.email == new_email, User.id != user.id))
        if clash:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already in use")
        user.email = new_email
    if body.password:
        user.password_hash = hash_password(body.password)
        if user.status == "pending":
            user.status = "active"
    db.commit()
    return UserOut.model_validate(user)


@router.delete("/{user_id}", response_model=MessageOut)
def delete_user(user_id: str, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = _get_user(db, user_id)
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't delete your own account.")
    if user.role == "admin" and user.status == "active" and _active_admin_count(db) <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete the last active admin.")

    # Reassign owned content to the acting admin so shared projects/docs/SRS aren't lost
    # (these foreign keys are non-nullable).
    db.query(Project).filter(Project.created_by == user.id).update({Project.created_by: admin.id})
    db.query(Document).filter(Document.uploaded_by == user.id).update({Document.uploaded_by: admin.id})
    db.query(SrsVersion).filter(SrsVersion.generated_by == user.id).update({SrsVersion.generated_by: admin.id})
    db.query(GenerationJob).filter(GenerationJob.triggered_by == user.id).update({GenerationJob.triggered_by: admin.id})

    # Null out nullable audit references pointing at this user.
    db.query(User).filter(User.approved_by == user.id).update({User.approved_by: None})
    db.query(Template).filter(Template.updated_by == user.id).update({Template.updated_by: None})
    db.query(AgentPrompt).filter(AgentPrompt.updated_by == user.id).update({AgentPrompt.updated_by: None})
    db.query(AgentTool).filter(AgentTool.created_by == user.id).update({AgentTool.created_by: None})
    db.query(AppSettings).filter(AppSettings.updated_by == user.id).update({AppSettings.updated_by: None})

    # Tokens have no relationship cascade — remove them explicitly. user_models/user_tools
    # cascade via the User relationships.
    db.query(AuthToken).filter(AuthToken.user_id == user.id).delete()

    db.delete(user)
    db.commit()
    return MessageOut(detail="User deleted.")


@router.post("/{user_id}/role", response_model=MessageOut)
def change_role(user_id: str, body: RoleIn, db: Session = Depends(get_db)):
    user = _get_user(db, user_id)
    if user.role == "admin" and body.role == "user" and _active_admin_count(db) <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot demote the last active admin")
    user.role = body.role
    db.commit()
    return MessageOut(detail=f"Role changed to {body.role}.")


@router.put("/{user_id}/models", response_model=MessageOut)
def set_user_models(user_id: str, body: UserModelsIn, db: Session = Depends(get_db)):
    user = _get_user(db, user_id)
    db.query(UserModel).filter(UserModel.user_id == user.id).delete()
    for mid in set(body.model_ids):
        db.add(UserModel(user_id=user.id, model_id=mid))
    db.commit()
    return MessageOut(detail="Model access updated.")


@router.get("/{user_id}/models", response_model=list[str])
def get_user_models(user_id: str, db: Session = Depends(get_db)) -> list[str]:
    _get_user(db, user_id)
    rows = db.scalars(select(UserModel.model_id).where(UserModel.user_id == user_id))
    return list(rows)
