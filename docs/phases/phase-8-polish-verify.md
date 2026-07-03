# Phase 8 — Polish & Verify

**Goal:** Run the full end-to-end verification, harden edges, finalize the README. Reference: the
Verification section in the master plan and each phase's done-check.

## End-to-end checklist
1. **Startup** — refuses to boot without Node/CLI/API key; seeded admin logs in.
2. **Register → approve → set-password** — pending can't log in; approve → link (email or in-app) →
   set password → login; expired/used token rejected.
3. **Auth/roles** — admin-only endpoints 403 for users; regenerate/delete hidden for users.
4. **Ingestion** — each file type → normalized `.md` + content hash; `INDEX.md` updated.
5. **Model selection** — admin enables/grants; user sees only allowed models; choice recorded on job
   + `srs.json.source.model`.
6. **Generation + progress** — phases advance; **refresh mid-run** restores the bar; Done/Failed
   toast; `srs_generated` email only to the triggering user.
7. **Outputs** — `BA Output/<slug>/v1/` has md/json(valid)/docx/pdf; all download.
8. **One-time rule / versioning** — user can't regenerate; admin regenerates → v2 alongside v1.
9. **Stale** — upload a new doc after generation → status flips to **Stale**.
10. **Host sync** — Send-to-Host copies files; badge **Synced**; regenerate → **Out-of-date**; Sync →
    **Synced**; toasts fire.
11. **Handoff shape** — `srs.json` has stable FR IDs, source_refs, open_questions, model, Odoo fields.
12. **Concurrency** — second generation on same project → 409 + toast.
13. **Master prompt** — edit (MD editor)/save/version/rollback; behavior follows it.
14. **Tools access** — disable a tool → absent from `allowed_tools`; add/edit/delete persists.

## Hardening
- Windows/OneDrive path safety (`pathlib`, sanitized slugs, data off OneDrive).
- Subprocess lifecycle: cancel reaps the Node child; startup marks stale `running` jobs failed.
- Atomic writes for outputs and host pushes; immutable version folders.
- SQLite: WAL, single worker, short transactions; agent work outside transactions.
- Rate-limit/API-error handling surfaces a clear job error; regeneration is idempotent.
- Email failures never fail the underlying action.

## Finalize
- Update root `README.md` with the quick-start (mirrors [12-setup-and-run.md](../12-setup-and-run.md)).
- Confirm `.env.example` (backend) and `.env.example` (frontend) list every variable.
- Optional niceties (backlog): version diff/compare, audit log, custom MCP handoff tool, "ask before
  regenerate" guard when status is `generated`.
