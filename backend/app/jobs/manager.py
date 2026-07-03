"""In-process job registry + per-job pub/sub for SSE fan-out."""
from __future__ import annotations

import asyncio
import logging

from app.db.database import SessionLocal
from app.db.models import GenerationJob

logger = logging.getLogger("ba-agent.jobs")


class JobManager:
    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task] = {}
        self._subscribers: dict[str, list[asyncio.Queue]] = {}

    # ----- pub/sub -----
    def subscribe(self, job_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers.setdefault(job_id, []).append(q)
        return q

    def unsubscribe(self, job_id: str, q: asyncio.Queue) -> None:
        subs = self._subscribers.get(job_id)
        if subs and q in subs:
            subs.remove(q)

    async def publish(self, job_id: str, event: dict, *, persist: bool = True) -> None:
        if persist:
            self._persist(job_id, event)
        for q in list(self._subscribers.get(job_id, [])):
            await q.put(event)

    def _persist(self, job_id: str, event: dict) -> None:
        if event.get("type") != "progress":
            return
        with SessionLocal() as db:
            job = db.get(GenerationJob, job_id)
            if not job:
                return
            if "phase" in event:
                job.phase = event["phase"]
            if "percent" in event:
                job.percent = int(event["percent"])
            if "current_activity" in event:
                job.current_activity = event["current_activity"]
            db.commit()

    # ----- task lifecycle -----
    def register(self, job_id: str, task: asyncio.Task) -> None:
        self._tasks[job_id] = task
        task.add_done_callback(lambda _: self._tasks.pop(job_id, None))

    def cancel(self, job_id: str) -> bool:
        task = self._tasks.get(job_id)
        if task and not task.done():
            task.cancel()
            return True
        return False


manager = JobManager()
