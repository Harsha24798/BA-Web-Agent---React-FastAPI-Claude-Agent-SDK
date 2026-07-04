# 12 — Setup & Run (manual)

No deployment; you run everything locally. Steps are for **Windows** (your machine) but work anywhere.

## 0. Install prerequisites (once)

1. **Python 3.11+** — https://python.org (check "Add to PATH").
2. **Node.js 18+** — https://nodejs.org
3. **Claude Code CLI**: `npm install -g @anthropic-ai/claude-code`
4. Get an **Anthropic API key** from the Anthropic console.
5. (Optional) An SMTP account for real emails (company mail or a Gmail app-password).

Verify:
```
python --version
node --version
claude --version        # Claude Code CLI
```

## 1. Backend

```powershell
cd "C:\Users\harsh\OneDrive\Desktop\Agent BA WebApp\backend"
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# edit .env (see reference below)
uvicorn app.main:app --reload --workers 1 --port 8000
```

First run: creates the SQLite DB, seeds the admin, tools, a default master prompt, and a default SRS
template. **No LLM models are seeded** — an admin adds them on the Models page before generation.
The app performs a **startup health check** — it refuses to boot with a clear message if Node, the
Claude Code CLI, or `ANTHROPIC_API_KEY` are missing.

### `backend/.env` reference

| Var | Example | Notes |
|-----|---------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | required |
| `JWT_SECRET` | (random string) | required; keep secret |
| `ADMIN_EMAIL` | `harsham@centrics.cloud` | seeded admin login |
| `ADMIN_PASSWORD` | (strong) | change after first login |
| `DEFAULT_MODEL` | `claude-sonnet-5` | default picker selection |
| `DATA_DIR` | `C:\ba-agent-data` | db + uploads + workspaces (keep **off** OneDrive) |
| `BA_OUTPUT_DIR` | `C:\ba-agent-data\BA Output` | generated SRS |
| `HOST_STORAGE_DIR` | `C:\ba-agent-host` | dev host storage folder |
| `APP_BASE_URL` | `http://localhost:5173` | used to build email links |
| `DEV_EMAIL` | `harsham@centrics.cloud` | redirect all mail here in dev |
| `SMTP_HOST` | `smtp.gmail.com` | optional; if unset, links are logged/shown in-app |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` / `SMTP_PASS` | | app-password recommended |
| `SMTP_FROM` | `BA Agent <no-reply@...>` | |
| `CORS_ORIGINS` | `http://localhost:5173` | frontend origin |

> Tip: point `DATA_DIR`, `BA_OUTPUT_DIR`, `HOST_STORAGE_DIR` **outside OneDrive** (e.g. `C:\ba-agent-data`)
> to avoid OneDrive sync file-locking errors.

## 2. Frontend

```powershell
cd "C:\Users\harsh\OneDrive\Desktop\Agent BA WebApp\frontend"
npm install
copy .env.example .env
# set VITE_API_URL=http://localhost:8000
npm run dev        # http://localhost:5173
```

## 3. First use

1. Open http://localhost:5173 and **log in as the seeded admin** (`ADMIN_EMAIL`/`ADMIN_PASSWORD`).
2. Admin → **Models**: **add at least one model** (e.g. `claude-sonnet-5`) — none are seeded.
   Optionally tune **Master Prompt** / **Template** (named library: create/edit/activate, import .md)
   and **Tools**.
3. Have a teammate **Register** (name + email). Approve them in **Admin → Users**. They get an email
   (or copy the link from the admin UI if SMTP is off) → set password → log in.
4. Any user: **New Project** → upload docs → pick a model → **Generate** → watch the progress bar.
5. **Download** srs.docx / .pdf; the machine files (srs.json / .md) are in `BA_OUTPUT_DIR/<slug>/v1/`.
6. **Send to Host Storage** → files appear in `HOST_STORAGE_DIR/<slug>/v1/` for the downstream agent.

## 4. Troubleshooting

| Symptom | Fix |
|---------|-----|
| App won't start: "Claude Code CLI not found" | `npm install -g @anthropic-ai/claude-code`; reopen shell |
| "ANTHROPIC_API_KEY missing" | set it in `backend/.env` |
| `database is locked` | ensure you run `--workers 1`; don't open the db elsewhere |
| No emails arrive | SMTP not set → copy the approval/set-password link from the admin UI/logs |
| `PermissionError` on write | move `DATA_DIR`/`BA_OUTPUT_DIR` off OneDrive |
| WeasyPrint install fails on Windows | switch PDF engine to `reportlab` in `services/srs_output.py` |
| Generation 409 | a job is already running for that project; wait or cancel it |

## 5. Stopping

`Ctrl+C` in each terminal. Data persists in `DATA_DIR`. Delete `DATA_DIR/app.db` to reset the app
(you'll be prompted to re-seed the admin on next start).
