"""Seed the admin, default models, tools, master prompt, and SRS template on first run."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.defaults import DEFAULT_MASTER_PROMPT, DEFAULT_SRS_TEMPLATE
from app.auth.security import hash_password
from app.config import settings
from app.db.models import AgentPrompt, AgentTool, LlmModel, Template, User

# Built-in Claude Code tools the agent may use during generation.
# Read/Glob/Grep are read-only; Bash/Write/Edit can modify the workspace; WebSearch/WebFetch reach
# the internet. All are enabled by default — admins can disable any on the Tools page.
DEFAULT_TOOLS = [
    ("Read", "Read file", "Read a file from the project workspace.", True, 1),
    ("Glob", "Glob search", "Find files by pattern in the workspace.", True, 2),
    ("Grep", "Grep search", "Search file contents in the workspace.", True, 3),
    ("WebSearch", "Web search", "Search the web for information.", True, 4),
    ("WebFetch", "Web fetch", "Fetch the contents of a URL.", True, 5),
    ("Bash", "Bash", "Run shell commands in the workspace (can modify files).", True, 6),
    ("Write", "Write file", "Create or overwrite a file in the workspace.", True, 7),
    ("Edit", "Edit file", "Edit a file in the workspace.", True, 8),
]

# All current Claude models, all enabled. Haiku 4.5 is the cheap default.
# (model_id, display_name, description, is_default, sort_order)
DEFAULT_MODELS = [
    ("claude-haiku-4-5-20251001", "Claude Haiku 4.5", "Fastest & cheapest — great default for SRS runs.", True, 1),
    ("claude-sonnet-5", "Claude Sonnet 5", "Balanced speed and quality.", False, 2),
    ("claude-opus-4-8", "Claude Opus 4.8", "Highest quality for complex SRSs.", False, 3),
    ("claude-fable-5", "Claude Fable 5", "Most capable; most expensive.", False, 4),
]


def seed(db: Session) -> None:
    _seed_admin(db)
    _seed_models(db)
    _seed_tools(db)
    _seed_master_prompt(db)
    _seed_template(db)
    db.commit()


def _seed_models(db: Session) -> None:
    if db.scalar(select(LlmModel)):
        return
    for model_id, name, desc, is_default, order in DEFAULT_MODELS:
        db.add(LlmModel(model_id=model_id, display_name=name, description=desc,
                        is_enabled=True, is_default=is_default, sort_order=order))


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
