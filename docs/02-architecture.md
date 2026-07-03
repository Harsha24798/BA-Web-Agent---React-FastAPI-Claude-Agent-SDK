# 02 — Architecture

## Big picture

```
┌────────────────────────┐         HTTPS/JSON + SSE          ┌──────────────────────────────┐
│  Frontend (React/Vite) │  ◄──────────────────────────────► │  Backend (FastAPI, 1 worker) │
│  - pages + components  │        JWT in Authorization       │  - REST API                  │
│  - toast alerts        │        fetch-based SSE stream      │  - asyncio job manager       │
│  - MD editor           │                                    │  - SQLite (SQLAlchemy)       │
└────────────────────────┘                                    │  - filesystem (uploads/out)  │
                                                              │        │                       │
                                                              │        ▼                       │
                                                              │  Claude Agent SDK query()      │
                                                              │  (spawns Claude Code CLI /     │
                                                              │   Node child process)          │
                                                              └──────────────┬────────────────┘
                                                                             │ reads
                                                                             ▼
                                                        workspaces/<project>/context/*.md
                                                                             │ writes
                                                                             ▼
                                                        BA Output/<slug>/v<N>/{md,json,docx,pdf}
                                                                             │ Send to Host
                                                                             ▼
                                                        HOST_STORAGE_DIR/<slug>/v<N>/...
```

## Components

- **API layer** (`app/api/*`) — thin routers: auth, users, projects, documents, generation,
  streaming, templates, agent_config, models, storage, srs. Each depends on auth/role guards.
- **Services** (`app/services/*`) — business logic independent of HTTP: `ingestion`, `srs_output`,
  `storage`, `status`, `email`.
- **Jobs** (`app/jobs/*`) — `manager.py` (in-process asyncio job registry + per-job pub/sub) and
  `generation.py` (the actual agent run + phase mapping).
- **Agent** (`app/agent/*`) — `runner.py` (SDK `query()` wrapper), `prompt.py` (assembles the
  verbatim master prompt + appended output contract + injected template), `srs_schema.json`.
- **DB** (`app/db/*`) — SQLAlchemy engine (WAL, single writer) + models.

Each unit has one purpose and a clear interface, so it can be understood and changed in isolation.

## The three most important design decisions

### 1. The generation job is decoupled from the HTTP request
Generation takes minutes. If it were tied to the request, a page refresh or timeout would lose it.
Instead:
- `POST /generate` inserts a `generation_jobs` row (`queued`), starts an `asyncio` task, and returns
  `202 {job_id}` immediately.
- The **job table is the source of truth** for progress. The task updates it through phases.
- On startup, any job stuck in `running` is marked `failed` (crash recovery), so the UI never hangs.

### 2. Progress streams over SSE with replay-on-connect
- The job writes progress to an in-memory pub/sub channel (`asyncio.Queue` per job) **and** persists
  the latest `{phase, percent, current_activity}` to the row.
- `GET /projects/{id}/jobs/{job_id}/stream` (SSE): **on connect it first replays the persisted state,
  then tails live events.** This is what makes the progress bar survive a refresh.
- SSE ends on a terminal event (`completed`/`failed`). We use fetch-based SSE so the JWT can be sent.
- **Single Uvicorn worker** — in-memory pub/sub + SQLite require one writer. This is a local app; one
  worker is correct.

### 3. Documents are extracted to Markdown at upload time
- On upload, each file is converted to normalized Markdown and hashed. The agent later reads those
  `.md` files from a per-project workspace (`cwd`) using its `Read`/`Glob`/`Grep` tools.
- This is reliable across mixed formats (xlsx/docx are unreliable if read raw), keeps generation
  fast, and makes "docs changed since last generation" a cheap hash comparison.

## Data flow: a generation run

1. Client `POST /projects/{id}/generate` with a chosen `model_id`.
2. Server validates: role/one-time rule, model allowed, no active job (else 409). Inserts job row.
3. `jobs/generation.py` builds the workspace `INDEX.md`, transitions phases, calls `agent/runner.py`.
4. `runner.py` calls the SDK `query()` with: **system_prompt = active master prompt (verbatim)** +
   appended JSON output contract, `allowed_tools` = enabled tools, `cwd` = workspace, `model` =
   chosen model, `include_partial_messages=True`.
5. Messages stream back → mapped to phases/percent → pushed to SSE + persisted.
6. Agent returns structured JSON → `srs_output.py` validates against `srs_schema.json`, renders
   md/docx/pdf, writes atomically to `BA Output/<slug>/v<N>/`, updates DB.
7. Server sends the **srs_generated** email to the triggering user; job → `completed`.

## Storage adapter (host sync)

`services/storage.py` defines `StorageAdapter` with `push()` / `status()`. The dev implementation
`LocalFolderStorage` copies a version folder into `HOST_STORAGE_DIR`. Production can add
`S3Storage`/`FtpStorage`/`HttpStorage` implementing the same interface — no changes to API or UI.
See [07-host-storage-sync.md](07-host-storage-sync.md).

## Concurrency & safety

- One active job per project — enforced by a **partial unique index** on `generation_jobs` plus a
  409 response.
- SQLite: **WAL mode**, single worker, short transactions. Long agent work never happens inside a DB
  transaction — only small status commits.
- Outputs are written to a temp dir then **atomically moved** into the immutable version folder, so a
  crash never leaves half-written files in `BA Output/`.
- Windows/OneDrive: use `pathlib` everywhere; sanitize folder slugs; keep data/output off OneDrive.
