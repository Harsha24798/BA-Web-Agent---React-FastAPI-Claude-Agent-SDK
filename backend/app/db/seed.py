"""Seed the admin, default models, tools, master prompt, and SRS template on first run."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.defaults import DEFAULT_MASTER_PROMPT, DEFAULT_SRS_TEMPLATE
from app.auth.security import hash_password
from app.config import settings
from app.db.models import AgentPrompt, AgentTool, Template, User

DEFAULT_TOOLS = [
    ("Read", "Read file", "Read a file from the project workspace.", True, 1),
    ("Glob", "Glob search", "Find files by pattern in the workspace.", True, 2),
    ("Grep", "Grep search", "Search file contents in the workspace.", True, 3),
]


def seed(db: Session) -> None:
    _seed_admin(db)
    # NOTE: LLM models are intentionally NOT seeded — the admin adds them via the Models page.
    _seed_tools(db)
    _seed_master_prompt(db)
    _seed_template(db)
    db.commit()


def _seed_admin(db: Session) -> None:
    exists = db.scalar(select(User).where(User.role == "admin"))
    if exists:
        return
    admin = User(
        email=settings.admin_email.lower(),
        full_name="Administrator",
        password_hash=hash_password(settings.admin_password),
        role="admin",
        status="active",
        approved_at=datetime.now(timezone.utc),
    )
    db.add(admin)


def _seed_tools(db: Session) -> None:
    if db.scalar(select(AgentTool)):
        return
    for key, name, desc, enabled, order in DEFAULT_TOOLS:
        db.add(AgentTool(
            tool_key=key, display_name=name, description=desc,
            is_enabled=enabled, sort_order=order,
        ))


def _seed_master_prompt(db: Session) -> None:
    if db.scalar(select(AgentPrompt)):
        return
    db.add(AgentPrompt(name="Default Master Prompt", content=DEFAULT_MASTER_PROMPT,
                       version_no=1, is_active=True))


def _seed_template(db: Session) -> None:
    if db.scalar(select(Template)):
        return
    db.add(Template(name="Default SRS Template", content=DEFAULT_SRS_TEMPLATE,
                    version_no=1, is_active=True))
