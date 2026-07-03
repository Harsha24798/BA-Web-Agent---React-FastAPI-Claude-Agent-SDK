# Phase 5 — Jobs, Progress & Alerts

**Goal:** Move generation into a decoupled async job with **live, refresh-proof progress** over SSE,
and add clear toast alerts. Reference: [06-generation-progress.md](../06-generation-progress.md).

## Files
- `backend/app/jobs/manager.py` — asyncio job registry + per-job pub/sub (`asyncio.Queue` fan-out)
- extend `backend/app/jobs/generation.py` — map SDK messages → phases/percent; publish events
- `backend/app/api/streaming.py` — SSE endpoint (replay-on-connect + live tail)
- extend `backend/app/api/generation.py` — enqueue + return `202 {job_id}`; job status + cancel
- `frontend/src/components/GenerationProgress.tsx`, `frontend/src/lib/toast.ts`

## Steps
1. **Job manager** — registry + subscribe/unsubscribe + `publish(job_id, event)` that (a) persists
   `{phase,percent,current_activity}` to the row and (b) fans out to subscriber queues.
2. **Enqueue** — `POST /generate` inserts `queued` row, `asyncio.create_task(run_job)`, returns
   `202 {job_id}`. Enforce one active job per project (partial unique index + 409).
3. **Phase mapping** — in `generation.py`, translate SDK message types → phases (see doc table);
   within `reading_docs` derive sub-% from docs read; use partial messages for live activity during
   `analyzing`/`drafting`. Add a watchdog for stalls.
4. **SSE** — `GET .../jobs/{jobId}/stream`: auth, **replay persisted state**, then tail the queue,
   close on terminal event. `GET .../jobs/{jobId}` returns a snapshot. `POST .../cancel` cancels the
   task + closes the SDK transport (reap the child process).
5. **Crash recovery** — startup marks stale `running` jobs `failed` (already stubbed in phase 0).
6. **Email hook** — on `completed`, send `srs_generated` to `triggered_by`.
7. **Frontend** — `GenerationProgress` opens SSE via `@microsoft/fetch-event-source` (JWT header),
   renders phase stepper + % + activity feed, shows **Done ✓ / Failed ✗**; reconnect on refresh.
   `lib/toast.ts` wraps `sonner`; fire toasts for start/success/failure/409/403.

## Done-check
- Clicking Generate returns immediately; the bar advances through phases.
- **Refresh mid-run** → the bar restores and continues (SSE replay).
- Completion shows Done ✓ + toast "SRS generated successfully (vN)"; failure shows the reason.
- The `srs_generated` email goes **only** to the user who clicked Generate.
- A second concurrent generate on the same project → 409 + toast.
