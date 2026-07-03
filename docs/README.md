# BA Agent WebApp — Documentation

An internal web app for an **Odoo development company**. A Business Analyst uploads raw client
material (transcripts, invoices, requirement docs, etc.), an AI agent built on the **Claude Agent
SDK** reads everything and produces a high-quality **SRS (Software Requirements Specification)**. The
SRS can be downloaded (Word/PDF), is saved in a structured machine format (JSON/MD) for a future
downstream agent, and can be pushed to host storage.

This is a **local, self-hosted, dev build** — no paid third-party services, no cloud deployment. You
run it manually and set the API key + SMTP creds yourself.

## How to read these docs

Read them in order the first time. Each file is self-contained enough to return to later.

| # | Doc | What it covers |
|---|-----|----------------|
| — | [00-overview.md](00-overview.md) | Product goal, roles, end-to-end user journey |
| 1 | [01-tech-stack.md](01-tech-stack.md) | Full tech stack: every language, framework, library + why |
| 2 | [02-architecture.md](02-architecture.md) | Components, data flow, job/SSE model, storage adapter |
| 3 | [03-data-model.md](03-data-model.md) | SQLite schema, relationships, indexes |
| 4 | [04-auth-and-users.md](04-auth-and-users.md) | Register → approve → set-password, roles, tokens |
| 5 | [05-agent-and-srs.md](05-agent-and-srs.md) | Agent SDK usage, model selection, srs.json contract |
| 6 | [06-generation-progress.md](06-generation-progress.md) | Job lifecycle, phases, SSE, alerts |
| 7 | [07-host-storage-sync.md](07-host-storage-sync.md) | Send/sync design, adapter, dev local folder |
| 8 | [08-email-templates.md](08-email-templates.md) | The 3 email templates + when each is sent |
| 9 | [09-agent-config.md](09-agent-config.md) | Master prompt (verbatim) + tools access + MD editor |
| 10 | [10-api-reference.md](10-api-reference.md) | Every endpoint, method, auth, request/response |
| 11 | [11-frontend-ui.md](11-frontend-ui.md) | Pages, components, UX, toast alerts, MD editor |
| 12 | [12-setup-and-run.md](12-setup-and-run.md) | Full manual setup, .env reference, run commands |

## Build phases

The app is built in ordered phases. Each has its own doc with goal, files, steps, and a done-check.

- [phase-0-scaffold.md](phases/phase-0-scaffold.md) — repo, config, DB init, health checks
- [phase-1-auth-users.md](phases/phase-1-auth-users.md) — auth, register/approve/set-password, emails
- [phase-2-projects-docs.md](phases/phase-2-projects-docs.md) — projects, uploads, ingestion, status
- [phase-3-models.md](phases/phase-3-models.md) — LLM models, access grants, selector
- [phase-4-agent-generation.md](phases/phase-4-agent-generation.md) — agent runner, srs output
- [phase-5-progress-alerts.md](phases/phase-5-progress-alerts.md) — jobs, SSE, progress UI, toasts
- [phase-6-host-sync.md](phases/phase-6-host-sync.md) — storage adapter, send/sync, badges
- [phase-7-admin-config.md](phases/phase-7-admin-config.md) — template + master prompt + tools
- [phase-8-polish-verify.md](phases/phase-8-polish-verify.md) — verification, hardening

## Quick start

See [12-setup-and-run.md](12-setup-and-run.md). In short: install Python 3.11+, Node 18+, and the
Claude Code CLI; set `ANTHROPIC_API_KEY`; run the FastAPI backend (single worker) and the Vite
frontend; log in as the seeded admin; approve users; create a project; upload docs; generate.
