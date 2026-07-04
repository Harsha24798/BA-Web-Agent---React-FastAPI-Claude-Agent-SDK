# 03 — Data Model (SQLite)

**PRAGMAs:** `journal_mode=WAL`, `foreign_keys=ON`. All timestamps stored UTC ISO-8601. Single writer
(one Uvicorn worker) avoids `database is locked`. IDs are UUID strings unless noted.

## Entity relationship (summary)

```
users ─┬─< projects (created_by)
       ├─< documents (uploaded_by)
       ├─< srs_versions (generated_by)
       ├─< generation_jobs (triggered_by)
       ├─< user_models (user_id)
       └─< auth_tokens (user_id)

projects ─┬─< documents
          ├─< srs_versions ──> templates, llm_models, generation_jobs
          └─< generation_jobs ──> llm_models

templates (versioned)   agent_prompts (versioned)   agent_tools   llm_models
```

## Tables

### users
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| email | text unique | login identifier |
| full_name | text | set at registration |
| password_hash | text **nullable** | null until user sets password via token |
| role | text | `user` \| `admin` |
| status | text | `pending` \| `active` \| `rejected` \| `disabled` |
| approved_by | uuid FK users, nullable | |
| approved_at | text, nullable | |
| created_at | text | |

Only `active` users can log in. The seeded admin is inserted `active` on first startup.

### auth_tokens
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK users | |
| token | text | store a **hash** of the token, not the raw value |
| purpose | text | `set_password` \| `reset_password` |
| expires_at | text | e.g. 48h |
| used_at | text, nullable | single-use |
| created_at | text | |

### projects
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | display name |
| slug | text unique | sanitized folder-safe name |
| created_by | uuid FK users | |
| created_at | text | |
| current_srs_version_id | uuid FK srs_versions, nullable | latest active version |
| srs_status | text | `none` \| `generated` \| `stale` (`generating` is derived from active job) |
| last_generated_at | text, nullable | |

### documents
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| project_id | uuid FK projects | |
| original_filename | text | |
| stored_path | text | raw upload path |
| extracted_path | text | normalized `.md` path in workspace |
| mime_type | text | |
| size_bytes | int | |
| content_hash | text | sha256 of **extracted text** |
| uploaded_by | uuid FK users | |
| uploaded_at | text | |
| is_deleted | bool | soft delete |

### srs_versions
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| project_id | uuid FK projects | |
| version_no | int | unique per project |
| md_path / json_path / docx_path / pdf_path | text | output artifacts |
| template_id | uuid FK templates | template used |
| model_id | text | LLM used (e.g. `claude-opus-4-8`) |
| source_docs_hash | text | combined hash of all docs at generation time (drives "stale") |
| generated_by | uuid FK users | |
| job_id | uuid FK generation_jobs | |
| created_at | text | |
| host_synced_at | text, nullable | last push to host |
| host_sync_status | text | `not_sent` \| `synced` |

**Unique index** `(project_id, version_no)`. Version folders are immutable once written.

### templates  *(SRS document structure — versioned)*
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | |
| content | text | Markdown describing SRS sections/structure |
| version_no | int | |
| is_active | bool | exactly one active |
| updated_by | uuid FK users | |
| updated_at | text | |

### agent_prompts  *(master/system prompt — named library, used verbatim)*
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | display name (named library; create/edit/delete/activate) |
| content | text | Markdown master prompt |
| version_no | int | |
| is_active | bool | exactly one active |
| updated_by | uuid FK users | |
| updated_at | text | |

### agent_tools  *(tools access registry)*
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| tool_key | text unique | e.g. `Read`, `Glob`, `Grep`, or an MCP tool name |
| display_name | text | |
| description | text | |
| is_enabled | bool | enabled → passed to `allowed_tools` |
| sort_order | int | |
| created_by | uuid FK users | |
| updated_at | text | |

Seed defaults: `Read`, `Glob`, `Grep` (enabled).

### generation_jobs
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| project_id | uuid FK projects | |
| status | text | `queued` \| `running` \| `completed` \| `failed` \| `cancelled` |
| phase | text | current phase name |
| percent | int | 0–100 |
| current_activity | text | e.g. "reading brief.pdf" |
| error_message | text, nullable | |
| sdk_session_id | text, nullable | SDK session for debugging |
| model_id | text | chosen model |
| triggered_by | uuid FK users | recipient of the "generated" email |
| is_regeneration | bool | |
| created_at / started_at / finished_at | text | |

**Partial unique index:** `CREATE UNIQUE INDEX ux_active_job ON generation_jobs(project_id) WHERE
status IN ('queued','running');` → one active job per project.

Optional **job_events** (append-only: id, job_id, ts, type, payload_json) for full SSE replay/debug.

### llm_models  *(not seeded — admin adds every model via the Models page)*
| column | type | notes |
|--------|------|-------|
| id | uuid PK | |
| model_id | text unique | e.g. `claude-sonnet-5`, `claude-opus-4-8` |
| display_name | text | |
| description | text | |
| is_enabled | bool | available to users |
| is_default | bool | pre-selected in the picker |
| sort_order | int | |

### user_models  *(optional per-user grants)*
| column | type | notes |
|--------|------|-------|
| user_id | uuid FK users | |
| model_id | text FK llm_models.model_id | |

Rule: if a user has **no** rows → they may use all `is_enabled` models. If they have rows → they are
restricted to exactly those.

## Derived status

- **Project SRS status**: `generating` if an active job exists; else `srs_status` column.
- **Stale detection**: recompute the project's combined `source_docs_hash` on any doc upload/delete;
  if it differs from `current_srs_version.source_docs_hash`, set `srs_status='stale'`.
- **Host-sync badge**: `not_sent` if current version never pushed; `synced` if current version's
  `host_sync_status='synced'`; `out-of-date` if a newer version exists than the last-synced one.
