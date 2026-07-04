"""Fernet encryption for secrets stored in the DB (Anthropic key, SMTP password).

The key is derived from JWT_SECRET so no extra env var is needed. If JWT_SECRET changes,
previously stored secrets can't be decrypted and must be re-entered in the admin UI.
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _fernet() -> Fernet:
    digest = hashlib.sha256((settings.jwt_secret or "change-me").encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str | None) -> str:
    if not ciphertext:
        return ""
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        return ""


def mask(plaintext: str) -> str:
    """Masked preview, e.g. 'sk-a…wxyz'. Never reveals more than a hint."""
    if not plaintext:
        return ""
    if len(plaintext) <= 8:
        return "••••"
    return f"{plaintext[:4]}…{plaintext[-4:]}"
