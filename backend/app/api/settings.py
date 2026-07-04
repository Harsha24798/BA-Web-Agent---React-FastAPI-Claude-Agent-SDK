"""Admin settings: Anthropic API key + mail server, with connection tests."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.db.database import get_db
from app.db.models import AppSettings, User
from app.schemas import AnthropicKeyIn, SettingsOut, SmtpIn
from app.security.crypto import decrypt_secret, encrypt_secret, mask
from app.services import settings_service as svc

router = APIRouter(prefix="/admin/settings", tags=["settings"],
                   dependencies=[Depends(require_admin)])


def _out(row: AppSettings) -> SettingsOut:
    key = decrypt_secret(row.anthropic_key_ct)
    return SettingsOut(
        anthropic_key_set=bool(row.anthropic_key_ct),
        anthropic_key_hint=mask(key) if key else None,
        anthropic_status=row.anthropic_status,
        anthropic_checked_at=row.anthropic_checked_at,
        anthropic_error=row.anthropic_error,
        smtp_host=row.smtp_host,
        smtp_port=row.smtp_port,
        smtp_user=row.smtp_user,
        smtp_pass_set=bool(row.smtp_pass_ct),
        smtp_from=row.smtp_from,
        smtp_status=row.smtp_status,
        smtp_checked_at=row.smtp_checked_at,
        smtp_error=row.smtp_error,
    )


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return _out(svc.get_or_create(db))


# ---------------- Anthropic ----------------
@router.put("/anthropic", response_model=SettingsOut)
def set_anthropic(body: AnthropicKeyIn, admin: User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    row = svc.get_or_create(db)
    row.anthropic_key_ct = encrypt_secret(body.key.strip())
    row.anthropic_status = "unknown"
    row.anthropic_error = None
    row.anthropic_checked_at = None
    row.updated_by = admin.id
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    svc.apply_key_to_env()  # make it available to the agent SDK immediately
    return _out(row)


@router.delete("/anthropic", response_model=SettingsOut)
def delete_anthropic(db: Session = Depends(get_db)):
    row = svc.get_or_create(db)
    row.anthropic_key_ct = None
    row.anthropic_status = "unknown"
    row.anthropic_error = None
    row.anthropic_checked_at = None
    db.commit()
    return _out(row)


@router.post("/anthropic/test", response_model=SettingsOut)
async def test_anthropic(db: Session = Depends(get_db)):
    row = svc.get_or_create(db)
    key = decrypt_secret(row.anthropic_key_ct)
    status, error = await asyncio.to_thread(svc.test_anthropic, key)
    row.anthropic_status = status
    row.anthropic_error = error
    row.anthropic_checked_at = datetime.now(timezone.utc)
    db.commit()
    return _out(row)


# ---------------- Mail server ----------------
@router.put("/smtp", response_model=SettingsOut)
def set_smtp(body: SmtpIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = svc.get_or_create(db)
    row.smtp_host = body.host.strip()
    row.smtp_port = body.port
    row.smtp_user = body.user.strip()
    row.smtp_from = body.from_addr.strip()
    if body.password:  # omitted/empty = keep the stored password
        row.smtp_pass_ct = encrypt_secret(body.password)
    row.smtp_status = "unknown"
    row.smtp_error = None
    row.smtp_checked_at = None
    row.updated_by = admin.id
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _out(row)


@router.delete("/smtp", response_model=SettingsOut)
def delete_smtp(db: Session = Depends(get_db)):
    row = svc.get_or_create(db)
    row.smtp_host = ""
    row.smtp_user = ""
    row.smtp_pass_ct = None
    row.smtp_from = ""
    row.smtp_status = "unknown"
    row.smtp_error = None
    row.smtp_checked_at = None
    db.commit()
    return _out(row)


@router.post("/smtp/test", response_model=SettingsOut)
async def test_smtp(db: Session = Depends(get_db)):
    row = svc.get_or_create(db)
    cfg = svc.effective_smtp()
    status, error = await asyncio.to_thread(svc.test_smtp, cfg)
    row.smtp_status = status
    row.smtp_error = error
    row.smtp_checked_at = datetime.now(timezone.utc)
    db.commit()
    return _out(row)
