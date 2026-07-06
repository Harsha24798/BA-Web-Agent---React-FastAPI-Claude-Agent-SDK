"""ORM models. See docs/03-data-model.md."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String)
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(String, default="user")  # user | admin
    status: Mapped[str] = mapped_column(String, default="pending")  # pending|active|rejected|disabled
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    models: Mapped[list["UserModel"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    mcp_tools: Mapped[list["UserMcpTool"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(String, index=True)
    purpose: Mapped[str] = mapped_column(String)  # set_password | reset_password
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    current_srs_version_id: Mapped[str | None] = mapped_column(String, nullable=True)
    srs_status: Mapped[str] = mapped_column(String, default="none")  # none|generated|stale
    last_generated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    documents: Mapped[list["Document"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    versions: Mapped[list["SrsVersion"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    # So deleting a project also removes its generation jobs (FK would otherwise block the delete).
    jobs: Mapped[list["GenerationJob"]] = relationship(
        cascade="all, delete-orphan"
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    original_filename: Mapped[str] = mapped_column(String)
    stored_path: Mapped[str] = mapped_column(String)
    extracted_path: Mapped[str | None] = mapped_column(String, nullable=True)
    mime_type: Mapped[str] = mapped_column(String, default="")
    category: Mapped[str] = mapped_column(String, default="other")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    content_hash: Mapped[str] = mapped_column(String, default="")
    uploaded_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    project: Mapped[Project] = relationship(back_populates="documents")


class SrsVersion(Base):
    __tablename__ = "srs_versions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    version_no: Mapped[int] = mapped_column(Integer)
    md_path: Mapped[str | None] = mapped_column(String, nullable=True)
    json_path: Mapped[str | None] = mapped_column(String, nullable=True)
    docx_path: Mapped[str | None] = mapped_column(String, nullable=True)
    pdf_path: Mapped[str | None] = mapped_column(String, nullable=True)
    template_id: Mapped[str | None] = mapped_column(String, nullable=True)
    model_id: Mapped[str] = mapped_column(String, default="")
    source_docs_hash: Mapped[str] = mapped_column(String, default="")
    generated_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    job_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    host_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    host_sync_status: Mapped[str] = mapped_column(String, default="not_sent")  # not_sent|synced

    project: Mapped[Project] = relationship(back_populates="versions")

    __table_args__ = (
        Index("ux_project_version", "project_id", "version_no", unique=True),
    )


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, default="SRS Template")
    content: Mapped[str] = mapped_column(Text)
    version_no: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class AgentPrompt(Base):
    __tablename__ = "agent_prompts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, default="Master Prompt")
    content: Mapped[str] = mapped_column(Text)
    version_no: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class AgentTool(Base):
    __tablename__ = "agent_tools"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    tool_key: Mapped[str] = mapped_column(String, unique=True)
    display_name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text, default="")
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class GenerationJob(Base):
    __tablename__ = "generation_jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    status: Mapped[str] = mapped_column(String, default="queued")
    phase: Mapped[str] = mapped_column(String, default="queued")
    percent: Mapped[int] = mapped_column(Integer, default=0)
    current_activity: Mapped[str] = mapped_column(String, default="")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    sdk_session_id: Mapped[str | None] = mapped_column(String, nullable=True)
    model_id: Mapped[str] = mapped_column(String, default="")
    triggered_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    is_regeneration: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        # one active job per project (partial unique index)
        Index(
            "ux_active_job",
            "project_id",
            unique=True,
            sqlite_where=text("status IN ('queued','running')"),
        ),
    )


class JobEvent(Base):
    """A single terminal-log line or the final summary for a generation job (for live replay)."""

    __tablename__ = "job_events"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    job_id: Mapped[str] = mapped_column(ForeignKey("generation_jobs.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    ts: Mapped[datetime] = mapped_column(DateTime, default=_now)
    etype: Mapped[str] = mapped_column(String, default="log")  # log | summary
    payload_json: Mapped[str] = mapped_column(Text, default="{}")


class LlmModel(Base):
    __tablename__ = "llm_models"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    model_id: Mapped[str] = mapped_column(String, unique=True)
    display_name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text, default="")
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class AppSettings(Base):
    """Single-row table (id='singleton') holding admin-managed runtime settings."""

    __tablename__ = "app_settings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default="singleton")

    # Anthropic
    anthropic_key_ct: Mapped[str | None] = mapped_column(Text, nullable=True)  # encrypted
    anthropic_status: Mapped[str] = mapped_column(String, default="unknown")  # unknown|connected|failed
    anthropic_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    anthropic_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Mail server (SMTP)
    smtp_host: Mapped[str] = mapped_column(String, default="")
    smtp_port: Mapped[int] = mapped_column(Integer, default=587)
    smtp_user: Mapped[str] = mapped_column(String, default="")
    smtp_pass_ct: Mapped[str | None] = mapped_column(Text, nullable=True)  # encrypted
    smtp_from: Mapped[str] = mapped_column(String, default="")
    smtp_status: Mapped[str] = mapped_column(String, default="unknown")
    smtp_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    smtp_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class UserModel(Base):
    __tablename__ = "user_models"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    model_id: Mapped[str] = mapped_column(String)

    user: Mapped[User] = relationship(back_populates="models")

    __table_args__ = (
        Index("ux_user_model", "user_id", "model_id", unique=True),
    )


class McpServer(Base):
    """An admin-configured MCP server (SSE/HTTP). Managed on the Settings page."""

    __tablename__ = "mcp_servers"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, unique=True)  # display name
    slug: Mapped[str] = mapped_column(String, unique=True)  # SDK server key; immutable after create
    transport: Mapped[str] = mapped_column(String, default="http")  # sse | http (no stdio)
    url: Mapped[str] = mapped_column(String, default="")
    headers_json: Mapped[str] = mapped_column(Text, default="[]")  # [{name, is_secret}]
    secrets_ciphertext: Mapped[str] = mapped_column(Text, default="{}")  # enc {header_name: cipher}
    status: Mapped[str] = mapped_column(String, default="unknown")  # unknown|connected|failed
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)  # redacted before storage
    discovered_tools_json: Mapped[str] = mapped_column(Text, default="[]")  # [{name, description}]
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class UserMcpTool(Base):
    """Per-user grant of a single MCP tool (opt-in). tool_ref = mcp__{slug}__{tool_name}."""

    __tablename__ = "user_mcp_tools"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    tool_ref: Mapped[str] = mapped_column(String)

    user: Mapped[User] = relationship(back_populates="mcp_tools")

    __table_args__ = (
        Index("ux_user_mcp_tool", "user_id", "tool_ref", unique=True),
    )
