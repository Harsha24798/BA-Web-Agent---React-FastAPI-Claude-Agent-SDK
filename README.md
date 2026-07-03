# BA Agent WebApp — SRS Generator

An internal tool for an Odoo development company: upload client documents, and an AI agent (built on
the **Claude Agent SDK**) reads them and produces a high-quality **SRS**. Download it as Word/PDF, get
machine-readable JSON/MD for a downstream agent, and push it to host storage.

> **Full documentation is in [`docs/`](docs/README.md)** — architecture, data model, API, and a
> phase-by-phase build guide.

## Stack
- **Backend:** Python + FastAPI + SQLite (SQLAlchemy), Claude Agent SDK.
- **Frontend:** React + Vite + TypeScript + Tailwind, `sonner` toasts, `@uiw/react-md-editor`.
- Local, self-hosted, no paid services. You provide an Anthropic API key (and optionally SMTP).

## Prerequisites
1. Python 3.11+
2. Node.js 18+
3. Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
4. An Anthropic API key.

## Run the backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows (use source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
copy .env.example .env            # then edit values (see docs/12-setup-and-run.md)
uvicorn app.main:app --reload --workers 1 --port 8000
```
First start creates the SQLite DB and seeds the admin, default models, tools, master prompt, and
template. The app refuses to start if Node, the Claude Code CLI, or `ANTHROPIC_API_KEY` are missing.

## Run the frontend
```bash
cd frontend
npm install
copy .env.example .env            # set VITE_API_URL=http://localhost:8000
npm run dev                        # http://localhost:5173
```

## First use
1. Log in as the seeded admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`).
2. Teammates **Register** → admin **approves** in Admin → Users → they get a set-password email
   (or copy the link shown in the admin response if SMTP is off).
3. Create a project → upload documents → pick a model → **Generate** → watch progress → download.
4. **Send to Host Storage** to make outputs available to the downstream agent.

See [`docs/12-setup-and-run.md`](docs/12-setup-and-run.md) for the full guide and troubleshooting.
