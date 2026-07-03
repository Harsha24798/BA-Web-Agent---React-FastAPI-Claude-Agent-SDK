"""FastAPI application entrypoint."""
from __future__ import annotations

import logging
import os

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

app = FastAPI(title="BA Agent WebApp", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    settings.ensure_dirs()

    # Make the API key available to the Claude Agent SDK / CLI subprocess.
    if settings.anthropic_api_key:
        os.environ["ANTHROPIC_API_KEY"] = settings.anthropic_api_key

    # Health checks — fail loudly if the environment is not ready.
    try:
        check_environment(strict=True)
    except HealthError as e:
        logger.error(str(e))
        raise

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

    logger.info("BA Agent backend started.")


@app.get("/health")
def health() -> dict:
    problems = check_environment(strict=False)
    return {"status": "ok" if not problems else "degraded", "problems": problems}


# ----- routers -----
from app.api import (  # noqa: E402
    agent_config,
    auth,
    documents,
    generation,
    models,
    projects,
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
app.include_router(streaming.router)
app.include_router(srs.router)
app.include_router(storage.router)
app.include_router(agent_config.router)
