"""SSE progress stream: replay persisted state on connect, then tail live events."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth.deps import require_active
from app.db.database import get_db
from app.db.models import GenerationJob, User
from app.jobs.manager import manager

router = APIRouter(prefix="/projects", tags=["streaming"])


def _sse(event: dict) -> str:
    etype = event.get("type", "message")
    return f"event: {etype}\ndata: {json.dumps(event)}\n\n"


@router.get("/{project_id}/jobs/{job_id}/stream")
async def stream_job(project_id: str, job_id: str, user: User = Depends(require_active),
                     db: Session = Depends(get_db)):
    job = db.get(GenerationJob, job_id)
    if not job or job.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")

    terminal = job.status in ("completed", "failed", "cancelled")
    snapshot = {
        "type": "progress", "phase": job.phase, "percent": job.percent,
        "current_activity": job.current_activity, "status": job.status,
    }
    done_snapshot = None
    if terminal:
        done_snapshot = {
            "type": "done", "status": job.status,
            "error": job.error_message,
        }

    async def event_gen():
        # 1) replay current state immediately
        yield _sse(snapshot)
        if done_snapshot is not None:
            yield _sse(done_snapshot)
            return
        # 2) tail live events
        q = manager.subscribe(job_id)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                yield _sse(event)
                if event.get("type") == "done":
                    break
        finally:
            manager.unsubscribe(job_id, q)

    return StreamingResponse(event_gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
