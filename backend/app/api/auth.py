"""Auth endpoints: register, set-password, login, request-reset, me."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_active
from app.auth.security import create_access_token, hash_password, verify_password
from app.auth.tokens import consume_token, issue_token
from app.config import settings
from app.db.database import get_db
from app.db.models import User
from app.schemas import (
    LoginIn,
    MessageOut,
    RegisterIn,
    RequestResetIn,
    SetPasswordIn,
    TokenOut,
    UserOut,
)
from app.services import email as email_service

router = APIRouter(prefix="/auth", tags=["auth"])

_NEUTRAL = "If the details are valid, the next step has been triggered."


@router.post("/register", response_model=MessageOut)
def register(body: RegisterIn, db: Session = Depends(get_db)) -> MessageOut:
    existing = db.scalar(select(User).where(User.email == body.email.lower()))
    if existing is None:
        user = User(
            email=body.email.lower(),
            full_name=body.full_name.strip(),
            role="user",
            status="pending",
        )
        db.add(user)
        db.commit()
        admin = db.scalar(select(User).where(User.role == "admin", User.status == "active"))
        if admin:
            email_service.send_signup_admin(admin.email, user.full_name, user.email)
    return MessageOut(detail="Request received. An admin will review your account shortly.")


@router.post("/set-password", response_model=MessageOut)
def set_password(body: SetPasswordIn, db: Session = Depends(get_db)) -> MessageOut:
    user_id = consume_token(db, body.token, purpose="set_password")
    if not user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired link")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid link")
    user.password_hash = hash_password(body.password)
    if user.status == "pending":
        user.status = "active"
    db.commit()
    return MessageOut(detail="Password set. You can log in now.")


@router.post("/request-reset", response_model=MessageOut)
def request_reset(body: RequestResetIn, db: Session = Depends(get_db)) -> MessageOut:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user and user.status == "active":
        raw = issue_token(db, user.id, purpose="set_password")
        db.commit()
        email_service.send_reset(user.email, user.full_name, raw)
    return MessageOut(detail=_NEUTRAL)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if user.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is not active")
    token = create_access_token(user.id, user.role)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(require_active)) -> UserOut:
    return UserOut.model_validate(user)
