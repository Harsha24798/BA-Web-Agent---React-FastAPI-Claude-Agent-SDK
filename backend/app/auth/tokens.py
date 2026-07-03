"""One-time auth tokens (set-password / reset-password)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import generate_raw_token, hash_token
from app.db.models import AuthToken

SET_PASSWORD_TTL_HOURS = 48


def issue_token(db: Session, user_id: str, purpose: str = "set_password") -> str:
    """Create a token row; return the RAW token (only stored hashed)."""
    raw = generate_raw_token()
    db.add(AuthToken(
        user_id=user_id,
        token_hash=hash_token(raw),
        purpose=purpose,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=SET_PASSWORD_TTL_HOURS),
    ))
    return raw


def consume_token(db: Session, raw: str, purpose: str = "set_password") -> str | None:
    """Validate a raw token; if valid mark used and return the user_id, else None."""
    row = db.scalar(
        select(AuthToken).where(
            AuthToken.token_hash == hash_token(raw),
            AuthToken.purpose == purpose,
        )
    )
    if not row or row.used_at is not None:
        return None
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        return None
    row.used_at = datetime.now(timezone.utc)
    return row.user_id
