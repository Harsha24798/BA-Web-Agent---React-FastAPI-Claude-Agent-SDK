# 00 — Overview

## The problem

An Odoo development company receives messy, mixed client inputs: meeting transcripts, invoice
templates, spreadsheets, requirement notes, PDFs. Turning these into a clean, complete SRS is slow
and inconsistent. This app automates that first-draft SRS with an AI agent, while keeping a human in
control and producing outputs a *downstream* development agent can consume.

## Goals

1. Let a Business Analyst upload all client material for a project.
2. Have an agent (Claude Agent SDK) read everything and produce a **high-quality SRS**.
3. Produce outputs in **two shapes**:
   - **Human**: `srs.docx` + `srs.pdf` for download.
   - **Machine**: `srs.md` + `srs.json` for reliable handoff to a future downstream "BA Agent".
4. Track status clearly (generated / not, docs changed since generation, host-sync state).
5. Keep the agent **fully admin-configurable** (master prompt, tools, SRS template, model list).
6. Be simple to run locally — no paid tools, no deployment.

## Roles

| Role | Capabilities |
|------|--------------|
| **user** | Self-register, create projects, upload docs, generate SRS **once** per project, select an allowed model, download, send-to-host, sync. Cannot delete projects or regenerate. |
| **admin** | Everything users can do **plus**: approve/reject/manage users, delete projects, **regenerate** SRS (keeps versions), manage LLM models + per-user access, edit the **agent master prompt**, manage **tools access**, edit the **SRS template**. |

All users can **see all projects** (shared workspace). Only admins delete them.

## End-to-end journey

```
Self-register (name + email)  ──►  Admin approves  ──►  Email "set your password"  ──►  Login
        │
        ▼
Create project  ──►  Upload documents (transcript, invoices, requirements, other)
        │                     │ (each file extracted to Markdown + hashed on upload)
        ▼                     ▼
Pick an LLM model  ──►  Generate SRS  ──►  live progress bar (phases + activity)
        │
        ▼
Agent reads all docs  ──►  produces srs.json (validated)  ──►  renders srs.md / .docx / .pdf
        │
        ▼
Download (docx/pdf/md/json)   +   "SRS generated" email to the triggering user
        │
        ▼
Send to Host Storage  ──►  downstream BA Agent can access srs.json/.md
        │
        ▼
(docs change → status "Stale")   (admin regenerates → v2 kept alongside v1)
```

## Key rules (business logic)

- **One-time generation for users.** After a project has an SRS version, a plain user cannot
  regenerate; only an admin can (`Regenerate`), and old versions are kept (`v1`, `v2`, …).
- **Users cannot delete projects.** Admin only.
- **Status is always visible**: `none` / `generating` / `generated` / `stale`, plus host-sync badge
  `not sent` / `synced` / `out-of-date`.
- **Three separate admin configs** drive the agent and never overwrite each other: **SRS Template**,
  **Agent Master Prompt** (used verbatim), **Tools Access**.

## What this app is *not* (scope guard)

- No OCR or audio transcription (text-based files only: PDF/docx/txt/md/xlsx/csv).
- No cloud deployment, containers, or CI in this build — it runs locally.
- The downstream "BA Agent" itself is **not** built here; this app only produces the handoff files
  and pushes them to host storage so that agent can consume them later.
