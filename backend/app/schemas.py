"""Pydantic request/response models."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ---------- auth ----------
class RegisterIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr


class SetPasswordIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RequestResetIn(BaseModel):
    email: EmailStr


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class MessageOut(BaseModel):
    detail: str
    link: str | None = None  # e.g. a set-password link to show when SMTP is off


# ---------- users (admin) ----------
class RoleIn(BaseModel):
    role: str = Field(pattern="^(user|admin)$")


class UserModelsIn(BaseModel):
    model_ids: list[str]


class UserEditIn(BaseModel):
    full_name: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8, max_length=200)


# ---------- projects ----------
class ProjectCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class DocumentOut(BaseModel):
    id: str
    original_filename: str
    category: str
    mime_type: str
    size_bytes: int
    uploaded_at: datetime

    class Config:
        from_attributes = True


class VersionOut(BaseModel):
    id: str
    version_no: int
    model_id: str
    created_at: datetime
    host_sync_status: str
    host_synced_at: datetime | None = None
    generated_by: str | None = None
    generated_by_name: str | None = None

    class Config:
        from_attributes = True


class ProjectOut(BaseModel):
    id: str
    name: str
    slug: str
    created_by: str
    created_at: datetime
    srs_status: str            # none | generating | generated | stale
    host_sync_status: str      # not_sent | synced | out_of_date
    current_version_no: int | None = None
    active_job_id: str | None = None
    document_count: int = 0


class ProjectDetailOut(ProjectOut):
    documents: list[DocumentOut] = []
    versions: list[VersionOut] = []
    my_regen_status: str = "none"  # none | pending | approved | rejected (current user, this project)


# ---------- generation lock / regen requests / download audit ----------
class GenerationActiveOut(BaseModel):
    busy: bool = False
    job_id: str | None = None
    project_id: str | None = None
    project_name: str | None = None
    user_name: str | None = None


class RegenRequestOut(BaseModel):
    id: str
    user_id: str
    user_name: str
    project_id: str
    project_name: str
    status: str
    created_at: datetime
    decided_at: datetime | None = None


# ---------- models ----------
class LlmModelOut(BaseModel):
    id: str
    model_id: str
    display_name: str
    description: str
    is_enabled: bool
    is_default: bool
    sort_order: int

    class Config:
        from_attributes = True


class LlmModelIn(BaseModel):
    model_id: str
    display_name: str
    description: str = ""
    is_enabled: bool = True
    is_default: bool = False
    sort_order: int = 0


# ---------- generation ----------
class GenerateIn(BaseModel):
    model_id: str


class JobOut(BaseModel):
    id: str
    project_id: str
    status: str
    phase: str
    percent: int
    current_activity: str
    error_message: str | None = None
    model_id: str
    is_regeneration: bool

    class Config:
        from_attributes = True


# ---------- agent config (named library: master prompt / SRS template) ----------
class NamedConfigIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    content: str


class NamedConfigOut(BaseModel):
    id: str
    name: str
    content: str
    is_active: bool
    updated_at: datetime

    class Config:
        from_attributes = True


class ToolIn(BaseModel):
    tool_key: str
    display_name: str
    description: str = ""
    is_enabled: bool = True
    sort_order: int = 0


class ToolUpdateIn(BaseModel):
    display_name: str | None = None
    description: str | None = None
    is_enabled: bool | None = None
    sort_order: int | None = None


class ToolOut(BaseModel):
    id: str
    tool_key: str
    display_name: str
    description: str
    is_enabled: bool
    sort_order: int

    class Config:
        from_attributes = True


# ---------- app settings (admin) ----------
class AnthropicKeyIn(BaseModel):
    key: str = Field(min_length=1, max_length=400)


class SmtpIn(BaseModel):
    host: str = Field(default="", max_length=300)
    port: int = 587
    user: str = Field(default="", max_length=300)
    password: str | None = None  # omit/null = keep the stored password unchanged
    from_addr: str = Field(default="", max_length=300)


class SettingsOut(BaseModel):
    anthropic_key_set: bool
    anthropic_key_hint: str | None = None
    anthropic_status: str
    anthropic_checked_at: datetime | None = None
    anthropic_error: str | None = None

    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_pass_set: bool
    smtp_from: str
    smtp_status: str
    smtp_checked_at: datetime | None = None
    smtp_error: str | None = None


# ---------- MCP servers (admin) ----------
class McpHeaderIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    is_secret: bool = False
    value: str | None = None  # for secret headers, omit/null on edit = keep stored value


class McpServerIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    transport: str = Field(default="http", pattern="^(sse|http)$")
    url: str = Field(min_length=1, max_length=2000)
    headers: list[McpHeaderIn] = []
    is_enabled: bool = True


class McpToggleIn(BaseModel):
    is_enabled: bool


class McpToolToggleIn(BaseModel):
    tool_name: str = Field(min_length=1, max_length=300)
    is_enabled: bool


class McpHeaderOut(BaseModel):
    name: str
    is_secret: bool
    value: str | None = None       # non-secret headers echo the value
    value_hint: str | None = None  # secret headers only a masked hint


class McpToolOut(BaseModel):
    name: str
    description: str = ""
    is_enabled: bool = True


class McpServerOut(BaseModel):
    id: str
    name: str
    slug: str
    transport: str
    url: str
    headers: list[McpHeaderOut]
    status: str
    last_checked_at: datetime | None = None
    last_error: str | None = None
    tools: list[McpToolOut]
    is_enabled: bool


class UserMcpToolsIn(BaseModel):
    tool_refs: list[str]
