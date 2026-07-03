# 06 — Generation Jobs, Progress & Alerts

## Why a job model at all

Generation takes minutes. We never block the HTTP request. The **job table is the source of truth**;
the request only enqueues. This makes progress survive refreshes and lets us recover from crashes.

## Job lifecycle

```
POST /generate ──► insert generation_jobs (status=queued) ──► asyncio.create_task(run_job)
                                                              │
run_job:  queued → running → (phases) → completed | failed
                                                              │
GET .../stream (SSE): replay persisted state, then tail live events, close on terminal
```

- **One active job per project** — partial unique index + 409 response if busy.
- **Crash recovery** — on startup, any job left `running` is marked `failed` so the UI isn't stuck.
- **Cancellation** — cancelling the job cancels the asyncio task and closes the SDK transport so the
  Node child process is reaped.

## Job manager (`app/jobs/manager.py`)

- In-process registry: `dict[job_id → JobHandle]`.
- Per-job pub/sub: `dict[job_id → list[asyncio.Queue]]` for SSE subscriber fan-out.
- `publish(job_id, event)` → persists latest `{phase, percent, current_activity}` to the row **and**
  pushes the event to every subscriber queue.
- `subscribe(job_id)` / `unsubscribe(...)` used by the SSE endpoint.

## The run (`app/jobs/generation.py`)

Maps Agent SDK message types → phases and percentages:

| Phase | % range | Trigger |
|-------|---------|---------|
| `queued` | 0–5 | row created |
| `preparing` | 5–15 | build workspace + `INDEX.md`, validate docs exist |
| `reading_docs` | 15–40 | each `Read`/`Glob` tool-use event → sub-% = docs_read / docs_total |
| `analyzing` | 40–65 | streaming assistant text/thinking (partial messages) |
| `drafting_srs` | 65–85 | agent producing the SRS content |
| `rendering_outputs` | 85–97 | server builds json/md/docx/pdf |
| `finalizing` | 97–100 | versioning + DB commit + email |

Notes:
- A **true %** is impossible from an LLM. We use weighted phases; within `reading_docs` we derive a
  real sub-% from documents read; during `analyzing`/`drafting` we show live activity text (from
  `include_partial_messages`) so the bar never looks frozen.
- **Watchdog**: if no event for N seconds, keep the bar and show "still working"; if the subprocess
  dies, flip to `failed` with the error.
- Persist on **every meaningful event** so an SSE reconnect restores the exact state.

## SSE endpoint (`app/api/streaming.py`)

`GET /projects/{id}/jobs/{job_id}/stream`
1. Authn/authz (JWT via fetch-based SSE header).
2. **Replay**: emit the current persisted job state first.
3. **Tail**: subscribe to the job's queue; forward events as `text/event-stream`.
4. Close on `completed`/`failed`. Uses `Last-Event-ID` friendliness for reconnects.

Event shape:
```
event: progress
data: {"phase":"reading_docs","percent":28,"current_activity":"Reading brief.pdf"}

event: done
data: {"status":"completed","srs_version":2}
```

## Frontend progress (`components/GenerationProgress.tsx`)

- Opens the SSE stream with `@microsoft/fetch-event-source` (sends JWT).
- Renders an **animated phase stepper** + percent bar + a scrolling **activity feed** ("Reading
  brief.pdf…", "Writing SRS…").
- On refresh, re-opens the stream → replay restores the bar seamlessly.
- Terminal state shows a prominent **Done ✓** (green) or **Failed ✗** (red, with reason).

## Alerts / toasts (the "better alerts")

Global **Toaster** (`sonner`), mounted once in `App.tsx`. A small helper `lib/toast.ts` exposes
`toast.success/error/info`. Fire clear alerts for every meaningful action:

| Action | Toast |
|--------|-------|
| Registration submitted | "Request sent — an admin will approve your account." |
| Admin approves user | "Approval email sent." |
| Password set | "Password set. You can log in now." |
| Generation started | "Generation started…" |
| **Generation completed** | "SRS generated successfully (v2)." ✓ |
| Generation failed | "Generation failed: <reason>." ✗ |
| Sent to host | "Sent to host storage." |
| Sync done | "Host storage is up to date." |
| Busy (409) | "A generation is already running for this project." |
| Model not allowed (403) | "You don't have access to that model." |

Toasts complement — not replace — the persistent status badges and the progress panel's Done/Failed
state, so the user can always tell, at a glance, whether a process finished.
