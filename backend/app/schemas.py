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
