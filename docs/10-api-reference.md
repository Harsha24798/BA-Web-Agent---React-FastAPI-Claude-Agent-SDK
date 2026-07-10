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
| GET | `/projects/{id}/jobs/{jobId}/stream` | active | **SSE** — replays persisted progress + terminal log (`log`/`summary` events) then tails live; `done` carries the cost summary |
| POST | `/projects/{id}/jobs/{jobId}/cancel` | active (owner/admin) | cancel a running job |
| GET | `/generation/active` | active | system-wide lock status `{busy, job_id, project_id, project_name, user_name}` — only ONE generation runs at a time across all projects/users |
| POST | `/projects/{id}/regen-request` | active | non-admin asks an admin for single-use permission to regenerate |

Generation is **globally serialized**: `_start_job` rejects with 409 ("<name> is currently generating
an SRS for '<project>'…") if any job is queued/running anywhere. Non-admins may regenerate only with
an admin-approved, **single-use** `RegenRequest` (consumed on the next regenerate).

The stream emits typed SSE events: `progress` (phase/percent), `log` (a terminal line: `kind` ∈
info/tool/mcp/text/done/error), `summary` (cost/time), and `done`. Lines persist to `job_events` so a
refresh mid-run replays the whole terminal.

## SRS outputs

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/projects/{id}/versions` | active | version history |
| GET | `/projects/{id}/versions/{n}/download/{fmt}` | active | `fmt` ∈ `md,json,docx,pdf` |
| GET | `/projects/{id}/versions/{n}` | active | version metadata (from srs.json) |
| GET | `/projects/{id}/versions/{n}/report` | active | run report: `{summary, events}` (cost/time + terminal log) for that version's job |
| GET | `/projects/{id}/versions/{n}/diagrams` | active | list `[{id,title,type,description}]` of the version's Mermaid diagrams |
| GET | `/projects/{id}/versions/{n}/diagrams/{diagramId}` | active | the Mermaid `.mmd` source for one diagram (download) |
| GET | `/projects/{id}/versions/{n}/bundle.zip` | active | all resources for a version (md/json/docx/pdf + diagrams) as one ZIP |

Diagrams are produced by the agent (validated via the Mermaid MCP), stored as
`BA Output/<slug>/v<N>/diagrams/<id>.mmd` and in `srs.json` under `diagrams[]`. The frontend renders
previews with a lazy-loaded mermaid.js and downloads each as `.mmd/.svg/.png` (SVG/PNG rendered
in-browser), with select / download-all. Diagram ids are sanitized to be URL/filename-safe.

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

## Admin extras

| Method | Path | Notes |
|--------|------|-------|
| GET | `/admin/regen-requests` | `?project_id=&status_filter=` list regenerate requests (user + project names) |
| POST | `/admin/regen-requests/{id}/approve` | grant single-use regenerate access |
| POST | `/admin/regen-requests/{id}/reject` | decline the request |
| GET | `/admin/downloads` | `?project_id=&user_id=` download audit log (latest 500) `{user_name, project_name, version_no, fmt, created_at}` |

Every download (`download/{fmt}`, `bundle.zip`, `diagrams/{id}`) writes a `DownloadAudit` row
(best-effort). `VersionOut` now carries `generated_by` + `generated_by_name` (the author). `bundle.zip`
returns a plain bytes `Response` with `Content-Length` (a streamed response caused a false
"Failed to fetch" in the browser).

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

### MCP servers (admin, registry-only)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/admin/settings/mcp` | list servers (secrets masked; incl. status + discovered tools) |
| POST | `/admin/settings/mcp` | add `{name, transport(sse/http), url, headers[], is_enabled}` |
| PUT | `/admin/settings/mcp/{id}` | edit (slug immutable; omitted secret kept; resets status) |
| POST | `/admin/settings/mcp/{id}/toggle` | `{is_enabled}` |
| POST | `/admin/settings/mcp/{id}/test` | live probe → status + discovered tools |
| POST | `/admin/settings/mcp/{id}/tools/toggle` | `{tool_name, is_enabled}` enable/disable a single discovered tool (persists across re-tests) |
| DELETE | `/admin/settings/mcp/{id}` | remove server + its per-user grants |
| POST | `/admin/settings/check-all` | re-test API key + mail + all MCPs; returns `{settings, mcp}` |
| GET/PUT | `/users/{id}/mcp-tools` | `{tool_refs: []}` per-user MCP tool grants (opt-in; `mcp__slug__tool`) |

MCP tools **are now passed to the SRS-generation agent**: at generation, enabled + `connected`
servers whose tools are both **enabled** (per-tool toggle) and **granted to the triggering user** are
assembled into `ClaudeAgentOptions(mcp_servers=…)` and their `mcp__slug__tool` refs added to
`allowed_tools` (`services/mcp_service.py::build_generation_mcp`). The live terminal shows a `🔌` line
per MCP call. A user with no grants gets no MCP tools (opt-in).

## Conventions

- Errors return `{detail: "..."}` with appropriate HTTP status (400/401/403/404/409/422).
- `409` = a generation is already running for the project.
- `403` = role or model-access violation.
- All list endpoints return the fields the frontend needs to render badges without extra round-trips.
