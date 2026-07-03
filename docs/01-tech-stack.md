# 01 — Tech Stack

Everything here is free / open-source. The only external paid dependency is your **Anthropic API
key** (pay-as-you-go usage) and, optionally, an SMTP account (free tiers exist).

## Runtime prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Python | 3.11+ | Backend language (matches your Odoo/Python team). |
| Node.js | 18+ | The Claude Agent SDK wraps the Claude Code engine, which runs on Node. |
| Claude Code CLI | latest | `npm install -g @anthropic-ai/claude-code`. The SDK spawns it. |

## Backend (Python + FastAPI)

| Package | Purpose |
|---------|---------|
| `fastapi` | Web framework + automatic OpenAPI docs. |
| `uvicorn[standard]` | ASGI server. **Run with `--workers 1`** (see architecture). |
| `claude-agent-sdk` | The agent engine. `query()`, `ClaudeAgentOptions`, `tool`, `create_sdk_mcp_server`. |
| `sqlalchemy` (2.x) | ORM over SQLite. Keeps a future PostgreSQL move to a connection-string change. |
| `alembic` *(optional)* | DB migrations. For a fresh local build we can `create_all`; Alembic is optional. |
| `pydantic` / `pydantic-settings` | Request/response schemas + typed env config. |
| `python-jose[cryptography]` | JWT encode/decode. |
| `argon2-cffi` | Password hashing (argon2). |
| `python-multipart` | File upload parsing in FastAPI. |
| `jsonschema` | Validate `srs.json` against `srs_schema.json` before saving. |
| `jinja2` | Render HTML email templates. |
| `pdfplumber` + `pypdf` | PDF text/table extraction. |
| `python-docx` | Read `.docx` uploads **and** write `srs.docx`. |
| `openpyxl` | Read `.xlsx` → Markdown tables. |
| `weasyprint` *(preferred)* or `reportlab` | Render `srs.pdf` (pure-Python, no Office binary). |
| `markdown` | Markdown → HTML (for the PDF renderer). |
| `aiosmtplib` or stdlib `smtplib` | Send emails. |

> **PDF note:** WeasyPrint gives the nicest output but pulls native libs (GTK/Pango) that can be
> fiddly on Windows. If WeasyPrint install is painful on your machine, fall back to `reportlab`
> (pure-Python, always installs). The renderer is isolated in `services/srs_output.py` so swapping is
> a one-file change. This is documented in [phase-4](phases/phase-4-agent-generation.md).

## Frontend (React + Vite + TypeScript)

| Package | Purpose |
|---------|---------|
| `react` + `react-dom` | UI. |
| `vite` | Dev server + build (fast, minimal). |
| `typescript` | Type safety. |
| `react-router-dom` | Routing. |
| `tailwindcss` + `postcss` + `autoprefixer` | Styling. |
| `shadcn/ui` primitives + `lucide-react` | Accessible components + icons. |
| `sonner` | Toast notifications (the "better alerts"). |
| `@uiw/react-md-editor` | Markdown editor with **edit + live preview** (master prompt / SRS template). |
| `@microsoft/fetch-event-source` | SSE that can send the JWT `Authorization` header (native `EventSource` can't). |
| `@tanstack/react-query` *(optional)* | Data fetching/caching; can also use plain fetch. |

## Storage & data

| What | Where |
|------|-------|
| Relational data | **SQLite** file at `DATA_DIR/app.db` (WAL mode). |
| Uploaded files | `DATA_DIR/uploads/<project_id>/` |
| Extracted Markdown (agent workspace) | `DATA_DIR/workspaces/<project_id>/context/` |
| Generated SRS outputs | `BA_OUTPUT_DIR/<project_slug>/v<N>/` (md/json/docx/pdf) |
| Host storage (dev) | `HOST_STORAGE_DIR/<project_slug>/v<N>/` (copied by "Send to Host") |

## Why these choices

- **FastAPI + async** — the Agent SDK's `query()` is async; it lives naturally in FastAPI's event
  loop, and SSE streaming is trivial.
- **SQLite** — zero-config single file; ideal for a locally run internal tool. ORM keeps Postgres open.
- **React + Vite** — lightest way to ship a clean SPA locally; no SSR overhead needed.
- **Storage adapter** — dev uses a local folder; production can swap in S3/FTP/HTTP with no app change.

## Versions

Pin minimums in `requirements.txt` / `package.json` at implementation time. Prefer the latest stable
of each. For Claude models, default to a current model (e.g. Sonnet) and expose others (e.g. Opus)
via the admin model list — see [05-agent-and-srs.md](05-agent-and-srs.md).
