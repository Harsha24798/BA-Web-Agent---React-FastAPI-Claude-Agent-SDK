# Phase 4 — Agent Generation & Outputs

**Goal:** The core. Run the Claude Agent SDK to produce a schema-valid `srs.json`, render md/docx/pdf,
version the outputs. Reference: [05-agent-and-srs.md](../05-agent-and-srs.md).

## Files
- `backend/app/agent/runner.py` — SDK `query()` wrapper (options, model, tools, cwd, session)
- `backend/app/agent/prompt.py` — assemble master prompt (verbatim) + template + output contract
- `backend/app/agent/srs_schema.json` — the `srs.json` JSON Schema
- `backend/app/services/srs_output.py` — validate + render md/docx/pdf + atomic versioned write
- `backend/app/jobs/generation.py` — orchestrates a run end-to-end (phase mapping added in phase 5)
- `backend/app/api/generation.py` — `POST /generate` / `/regenerate` (sync path first; async in ph.5)
- `backend/app/api/srs.py` — versions list + downloads

## Steps
1. **Schema** — write `srs_schema.json` matching the contract in
   [05-agent-and-srs.md](../05-agent-and-srs.md) (requirements with stable IDs, source_refs, MoSCoW,
   Odoo fields, open_questions, etc.).
2. **Prompt assembly** — `prompt.py` concatenates: active master prompt **verbatim**, then a
   separator + injected active SRS template, then a separator + the output contract (schema). Nothing
   overrides the master prompt.
3. **Runner** — build `ClaudeAgentOptions(system_prompt=..., allowed_tools=<enabled tools>,
   cwd=<workspace>, model=<chosen>, include_partial_messages=True)`; prefer structured output for the
   JSON. Iterate `query()`; capture the final structured result and the `sdk_session_id`.
4. **Validate** — parse the agent's JSON; validate against the schema with `jsonschema`. On failure,
   **fail the job** with a clear error (do not save partial output). Fallback: extract a fenced
   ```json block if structured output is unavailable.
5. **Render** — from `srs.json`: build `srs.md` (Markdown), `srs.docx` (`python-docx`), `srs.pdf`
   (WeasyPrint; fall back to `reportlab` if WeasyPrint won't install). Keep the PDF engine isolated.
6. **Version + persist** — write all four to a temp dir; **atomic move** into
   `BA_OUTPUT_DIR/<slug>/v<N>/`; insert `srs_versions` (model_id, template_id, source_docs_hash,
   paths); update project pointer + `srs_status='generated'` + `last_generated_at`.
7. **Endpoints** — `POST /generate` (users only if status `none`; validate model allowed; 409 if a
   job active), `POST /regenerate` (admin; new version). `GET /projects/{id}/versions`,
   `.../versions/{n}/download/{fmt}`.
8. **Email** — after success, send `srs_generated.html` to the triggering user (added fully once jobs
   exist in phase 5; wire the hook here).

> In this phase you may run generation synchronously to validate the agent path end-to-end. Phase 5
> moves it into the async job manager with live progress. Keep `srs_output.py` and `runner.py`
> transport-agnostic so the move is clean.

## Done-check
- Generate on a small sample project produces `BA_OUTPUT_DIR/<slug>/v1/` with md/json/docx/pdf.
- `srs.json` **validates** against `srs_schema.json`; invalid output fails the job cleanly.
- `srs.md` content matches `srs.json` (rendered from it).
- Downloads work for all four formats.
- A user cannot regenerate (403); admin regenerate creates `v2` and keeps `v1`.
- Requesting a disallowed model → 403.
