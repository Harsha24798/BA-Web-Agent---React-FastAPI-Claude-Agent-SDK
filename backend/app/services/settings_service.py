"""Admin-managed runtime settings: effective values (DB over .env), env application, tests."""
from __future__ import annotations

import logging
import os
import smtplib
import urllib.error
import urllib.request
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import settings as env_settings
from app.db.database import SessionLocal
from app.db.models import AppSettings
from app.security.crypto import decrypt_secret

logger = logging.getLogger("ba-agent.settings")

SINGLETON_ID = "singleton"


def get_or_create(db: Session) -> AppSettings:
    row = db.get(AppSettings, SINGLETON_ID)
    if row is None:
        row = AppSettings(id=SINGLETON_ID)
        db.add(row)
        db.commit()
    return row


@dataclass
class SmtpConfig:
    host: str
    port: int
    user: str
    password: str
    from_addr: str

    @property
    def configured(self) -> bool:
        return bool(self.host and self.from_addr)


def effective_anthropic_key() -> str:
    """DB key if set, else the .env value (backwards compatible)."""
    with SessionLocal() as db:
        row = db.get(AppSettings, SINGLETON_ID)
        if row and row.anthropic_key_ct:
            key = decrypt_secret(row.anthropic_key_ct)
            if key:
                return key
    return env_settings.anthropic_api_key or ""


def effective_smtp() -> SmtpConfig:
    with SessionLocal() as db:
        row = db.get(AppSettings, SINGLETON_ID)
        if row and row.smtp_host:
            return SmtpConfig(
                host=row.smtp_host,
                port=row.smtp_port or 587,
                user=row.smtp_user or "",
                password=decrypt_secret(row.smtp_pass_ct),
                from_addr=row.smtp_from or env_settings.smtp_from,
            )
    return SmtpConfig(
        host=env_settings.smtp_host, port=env_settings.smtp_port,
        user=env_settings.smtp_user, password=env_settings.smtp_pass,
        from_addr=env_settings.smtp_from,
    )


def apply_key_to_env() -> None:
    """Make the effective Anthropic key available to the Claude Agent SDK subprocess."""
    key = effective_anthropic_key()
    if key:
        os.environ["ANTHROPIC_API_KEY"] = key


# ---------------- connection tests ----------------
def test_anthropic(key: str) -> tuple[str, str | None]:
    """Return (status, error). status in {connected, failed}."""
    if not key:
        return "failed", "No API key set."
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/models",
        headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                return "connected", None
            return "failed", f"Unexpected status {resp.status}"
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            return "failed", "The API key was rejected (invalid or unauthorized)."
        return "failed", f"HTTP {e.code}"
    except Exception as e:
        return "failed", f"Could not reach Anthropic: {e}"


def test_smtp(cfg: SmtpConfig) -> tuple[str, str | None]:
    if not cfg.host:
        return "failed", "No SMTP host set."
    try:
        with smtplib.SMTP(cfg.host, cfg.port, timeout=15) as smtp:
            smtp.ehlo()
            try:
                smtp.starttls()
                smtp.ehlo()
            except smtplib.SMTPException:
                pass  # server may not support STARTTLS; continue
            if cfg.user:
                smtp.login(cfg.user, cfg.password)
        return "connected", None
    except Exception as e:
        return "failed", f"{e}"
