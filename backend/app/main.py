"""FastAPI application entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import update

from app.config import settings
from app.db.database import SessionLocal, init_db
from app.db.models import GenerationJob
from app.db.seed import seed
from app.health import HealthError, check_environment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ba-agent")


def _startup() -> None:
    settings.ensure_dirs()

    # Locate the Claude Code CLI and put its directory on PATH, so subprocesses can launch it
    # regardless of which terminal started uvicorn. Logs the resolved path (or a warning).
    from app.health import ensure_cli_on_path
    cli = ensure_cli_on_path()
    logger.info("Claude Code CLI: %s", cli or "NOT FOUND (set CLAUDE_CLI_PATH in .env)")

    # Health checks — fail loudly if Node / the Claude Code CLI are missing. The Anthropic API
    # key is NOT required at boot: an admin can set it later in Settings; generation is gated on it.
    try:
        check_environment(strict=True)
    except HealthError as e:
        logger.error(str(e))
        raise

    # Warn loudly about insecure defaults left unchanged.
    if settings.jwt_secret in ("", "change-me", "change-me-to-a-long-random-string"):
        logger.warning("SECURITY: JWT_SECRET is the default value — set a long random JWT_SECRET "
                       "in backend/.env before real use (tokens are otherwise forgeable).")
    if settings.admin_password in ("", "ChangeMe123!"):
        logger.warning("SECURITY: ADMIN_PASSWORD is the default — change the seeded admin's "
                       "password after first login.")

    init_db()

    with SessionLocal() as db:
        seed(db)
        # Crash recovery: any job left running is marked failed.
        db.execute(
            update(GenerationJob)
            .where(GenerationJob.status.in_(["queued", "running"]))
            .values(status="failed", error_message="Interrupted by server restart")
        )
        db.commit()

    # Make the effective Anthropic key (DB setting, else .env) available to the agent subprocess.
    from app.services.settings_service import apply_key_to_env
    apply_key_to_env()

    logger.info("BA Agent backend started.")


def _check_event_loop() -> None:
    """On Windows, the SelectorEventLoop cannot spawn subprocesses, so the Claude Code CLI
    (used for generation and MCP) fails with 'Failed to start Claude Code'. uvicorn selects it
    whenever --reload or --workers>1 is used. Warn loudly with the fix."""
    import asyncio
    import sys
    if sys.platform != "win32":
        return
    loop = asyncio.get_running_loop()
    if type(loop).__name__ == "SelectorEventLoop":
        logger.warning(
            "EVENT LOOP: running on SelectorEventLoop — the Claude Code CLI subprocess CANNOT "
            "launch (generation & MCP tests will fail with 'Failed to start Claude Code'). "
            "This happens on Windows with --reload or --workers>1. Restart WITHOUT --reload: "
            "`uvicorn app.main:app --port 8000`. For hot-reload, use: "
            "`watchfiles \"uvicorn app.main:app --port 8000\" app`."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _startup()
    _check_event_loop()
    yield


app = FastAPI(title="BA Agent WebApp", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        *settings.cors_list,
        "https://ba-web-agent-react-fast-api-claude.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.ngrok(?:-free)?\.(?:app|dev|io)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    problems = check_environment(strict=False)
    return {"status": "ok" if not problems else "degraded", "problems": problems}


# ----- routers -----
from app.api import (  # noqa: E402
    admin_extra,
    agent_config,
    auth,
    documents,
    generation,
    models,
    projects,
    settings as settings_api,
    srs,
    storage,
    streaming,
    users,
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(documents.router)
app.include_router(models.router)
app.include_router(generation.router)
app.include_router(generation.gen_status_router)
app.include_router(streaming.router)
app.include_router(srs.router)
app.include_router(storage.router)
app.include_router(agent_config.router)
app.include_router(settings_api.router)
app.include_router(admin_extra.router)
