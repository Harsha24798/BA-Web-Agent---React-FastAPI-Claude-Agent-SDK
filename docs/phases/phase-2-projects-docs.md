# Phase 2 — Projects & Documents

**Goal:** Create projects, upload documents, extract each to Markdown + hash on upload, and track
status (incl. stale detection). Reference: [02](../02-architecture.md), [03](../03-data-model.md).

## Files
- `backend/app/api/projects.py`, `backend/app/api/documents.py`
- `backend/app/services/ingestion.py` — extract pdf/docx/xlsx/csv/txt → normalized Markdown + sha256
- `backend/app/services/status.py` — combined `source_docs_hash`, stale detection, host-sync state
- `frontend/src/pages/Projects.tsx`, `frontend/src/pages/ProjectDetail.tsx`
- `frontend/src/components/{FileUpload,StatusBadge}.tsx`

## Steps
1. **Projects API** — `GET /projects` (all, with status + host-sync badges), `POST /projects`
   (name → sanitized unique `slug`), `GET /projects/{id}` (detail), `DELETE /projects/{id}` (admin).
2. **Upload** — `POST /projects/{id}/documents` (multipart, multiple files). Save raw to
   `uploads/<project_id>/`; run ingestion; write normalized `.md` to `workspaces/<project_id>/context/`;
   store `content_hash`; update `context/INDEX.md`.
3. **Ingestion** (all free libs):
   - PDF → `pdfplumber` (tables) / `pypdf`; docx → `python-docx`; xlsx → `openpyxl` (sheets →
     Markdown tables); csv → stdlib; txt/md → passthrough.
   - Normalize to Markdown with a small header (filename, type) so the agent has context.
4. **Status/stale** — `status.py` computes project `source_docs_hash` = hash of sorted per-doc
   hashes. On any upload/delete, recompute; if it differs from `current_srs_version.source_docs_hash`
   → set `srs_status='stale'`. If no version yet → `none`.
5. **Delete doc** — soft-delete (`is_deleted`), remove from workspace, recompute status.
6. **Frontend** — Projects grid with badges + New Project dialog; ProjectDetail with FileUpload
   (drag/drop, category labels: Transcript / Invoices / Customer requirement / Other), document list,
   delete; StatusBadge component (None/Generating/Generated/Stale + host-sync). Toasts on actions.

## Done-check
- Create a project → folder + slug created; visible to all users.
- Upload one of each supported type → a normalized `.md` appears in `context/`, `documents` rows have
  hashes, `INDEX.md` lists them.
- Users cannot delete a project (button hidden + server 403); admin can.
- Deleting/uploading a doc after a (future) generation flips status to Stale (verify in phase 8).
