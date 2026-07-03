# Phase 0 — Scaffold

**Goal:** A running skeleton. Backend boots (with health checks), frontend loads, DB initializes and
seeds the admin + defaults. No features yet.

## Files to create
- `backend/requirements.txt`, `backend/.env.example`
- `backend/app/main.py` — FastAPI app, CORS, startup: health check + DB init + seeds
- `backend/app/config.py` — `pydantic-settings` reading `.env` (paths, key, SMTP, secret, model)
- `backend/app/db/database.py` — SQLAlchemy engine (WAL, foreign_keys), session dependency
- `backend/app/db/models.py` — all ORM models from [03-data-model.md](../03-data-model.md)
- `backend/app/db/seed.py` — seed admin, default llm_models, agent_tools, master prompt, template
- `backend/app/health.py` — check Node, Claude Code CLI, `ANTHROPIC_API_KEY`
- `frontend/` — Vite React+TS app, Tailwind, shadcn/ui init, router, `<Toaster/>`, `.env.example`

## Steps
1. **Backend venv + deps.** Create `requirements.txt`; `pip install`.
2. **Config.** `config.py` exposes typed settings; create data dirs on startup (`pathlib`, off
   OneDrive by default via `.env`).
3. **DB.** `database.py` sets `PRAGMA journal_mode=WAL; foreign_keys=ON`. `models.py` defines every
   table incl. the **partial unique index** on active jobs. Use `Base.metadata.create_all` for a
   fresh build (Alembic optional later).
4. **Seeds.** On startup, if empty: insert admin (from `.env`, `active`), default models (e.g.
   `claude-sonnet-5` default + `claude-opus-4-8`), default tools (`Read`,`Glob`,`Grep` enabled),
   a default active master prompt (senior Odoo BA persona) and a default active SRS template.
5. **Health check.** `main.py` startup event verifies Node + CLI + API key; on failure, log a clear
   message and exit (don't serve a broken app). Also: mark any `running` jobs `failed` (crash
   recovery — no-op on first run).
6. **Frontend.** Scaffold Vite + Tailwind + shadcn; add router with a placeholder Login page and a
   global Toaster; `lib/api.ts` stub with JWT header + `fetchEventSource` helper.

## Done-check
- `uvicorn app.main:app --workers 1` boots; `GET /health` returns OK; `/docs` loads.
- `DATA_DIR/app.db` created; admin + defaults seeded (verify via a quick `/auth/me` after a manual
  login in phase 1, or inspect the DB).
- `npm run dev` serves the frontend; the placeholder page renders with no console errors.
- Removing `ANTHROPIC_API_KEY` makes the backend refuse to start with a clear message.
