# 10 — API Reference

Base URL: `http://localhost:8000`. All non-public endpoints require `Authorization: Bearer <JWT>`.
Auth levels: **public**, **active** (any active user), **admin**. FastAPI serves live OpenAPI docs at
`/docs`.

## Auth

| Method | Path | Auth | Body / notes |
|--------|------|------|--------------|
| POST | `/auth/register` | public | `{full_name, email}` → neutral success (no enumeration) |
| POST | `/auth/set-password` | public | `{token, password}` |
| POST | `/auth/request-reset` | public | `{email}` → neutral success |
| POST | `/auth/login` | public | `{email, password}` → `{access_token, token_type, user}` |
| GET | `/auth/me` | active | current user profile |

## Users (admin)

| Method | Path | Body / notes |
|--------|------|--------------|
| GET | `/users` | `?status=` filter; list users |
| GET | `/users/pending` | pending queue |
| POST | `/users/{id}/approve` | approve + email set-password link |
| POST | `/users/{id}/reject` | reject |
| POST | `/users/{id}/disable` | set `disabled` |
| POST | `/users/{id}/enable` | set `active` |
| POST | `/users/{id}/reset-password` | re-issue set-password link |
| POST | `/users/{id}/role` | `{role}` change role (guard: keep ≥1 active admin) |
| PUT | `/users/{id}/models` | `{model_ids: []}` per-user model grants |

## Projects

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/projects` | active | all projects + status + host-sync badges |
| POST | `/projects` | active | `{name}` → creates project + slug |
| GET | `/projects/{id}` | active | detail incl. documents, versions, status |
| DELETE | `/projects/{id}` | **admin** | delete project + files |

## Documents

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/projects/{id}/documents` | active | multipart upload (multiple files); extracts + hashes |
| GET | `/projects/{id}/documents` | active | list |
| DELETE | `/projects/{id}/documents/{docId}` | active | soft-delete; recompute stale status |

## Models

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/models` | active | models the **caller** may use (respects `user_models`) |
| GET | `/admin/models` | admin | all models |
| POST | `/admin/models` | admin | add model |
| PUT | `/admin/models/{id}` | admin | edit / enable / default |
| DELETE | `/admin/models/{id}` | admin | remove |

## Generation

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/projects/{id}/generate` | active | `{model_id}` — allowed only if `srs_status='none'` for users; 409 if a job is active |
| POST | `/projects/{id}/regenerate` | **admin** | `{model_id}` — creates a new version |
| GET | `/projects/{id}/jobs/{jobId}` | active | job status snapshot |
| GET | `/projects/{id}/jobs/{jobId}/stream` | active | **SSE** progress (replay + live) |
| POST | `/projects/{id}/jobs/{jobId}/cancel` | active (owner/admin) | cancel a running job |

## SRS outputs

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/projects/{id}/versions` | active | version history |
| GET | `/projects/{id}/versions/{n}/download/{fmt}` | active | `fmt` ∈ `md,json,docx,pdf` |
| GET | `/projects/{id}/versions/{n}` | active | version metadata (from srs.json) |

## Host storage

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/projects/{id}/srs/{version}/send-host` | active | push version to host |
| POST | `/projects/{id}/sync-host` | active | re-push current version |
| GET | `/projects/{id}/host-status` | active | badge state |

## Agent config (admin)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/admin/master-prompt` | active version + history |
| POST | `/admin/master-prompt` | save new version `{content}` |
| POST | `/admin/master-prompt/{versionId}/restore` | roll back |
| GET | `/admin/template` | active SRS template + history |
| POST | `/admin/template` | save new version `{content}` |
| POST | `/admin/template/{versionId}/restore` | roll back |
| GET | `/admin/tools` | list tools |
| POST | `/admin/tools` | add tool `{tool_key, display_name, description}` |
| PUT | `/admin/tools/{id}` | edit / enable / disable |
| DELETE | `/admin/tools/{id}` | remove |

## Settings (admin)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/admin/settings` | current settings (secrets masked) |
| PUT | `/admin/settings/anthropic` | `{key}` set/replace API key (encrypted) |
| DELETE | `/admin/settings/anthropic` | remove API key (blocks generation) |
| POST | `/admin/settings/anthropic/test` | live connection test → status badge |
| PUT | `/admin/settings/smtp` | `{host,port,user,password?,from_addr}` (password omitted = keep) |
| DELETE | `/admin/settings/smtp` | remove mail config |
| POST | `/admin/settings/smtp/test` | live SMTP test → status badge |

Generation returns **400** ("…no AI API key is configured. Please contact your administrator.")
when no effective key exists (neither DB setting nor `.env`).

## Conventions

- Errors return `{detail: "..."}` with appropriate HTTP status (400/401/403/404/409/422).
- `409` = a generation is already running for the project.
- `403` = role or model-access violation.
- All list endpoints return the fields the frontend needs to render badges without extra round-trips.
