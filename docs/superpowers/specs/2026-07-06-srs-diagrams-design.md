# SRS Diagrams (Mermaid) — Design

**Date:** 2026-07-06
**Status:** Approved (design), pending implementation plan

## Context & problem

The SRS generator currently outputs `srs.md / srs.json / srs.docx / srs.pdf` per version under
`BA Output/<slug>/v<N>/`. Business Analysts want the SRS to include **diagrams** (context/flow, data
model/ER, key workflows) and to **download them** — a single SRS may have 10+ diagrams. Today there is
no diagram concept anywhere in the pipeline. The Mermaid MCP server (`mcp.mermaid.ai`) is already
connected, which lets the agent validate/render Mermaid, and MCP tools are now wired into generation.

## Goals

- The agent produces **Mermaid** diagrams as part of a generation run, **validated** via the Mermaid
  MCP so we know they're syntactically correct.
- Diagrams are written to a **separate folder**: `BA Output/<slug>/v<N>/diagrams/<id>.mmd`.
- The project page shows a **Diagrams** section with a live preview and **download per diagram**
  (`.mmd` source, plus `.svg` / `.png` rendered in the browser), with **select / download-all**.
- Provide `mm/master_prompt.md` and `mm/template.md` at the repo root as importable config that
  instruct the agent to create the diagrams.
- **Test milestone:** one diagram flows end-to-end; the pipeline supports N (10+).

## Non-goals (future)

- **One-click ZIP** of all version resources (md/json/docx/pdf + diagrams) — a later `bundle.zip`
  endpoint. A "Download all" (sequential) covers it for now.
- **Embedding rendered diagram images into DOCX/PDF** — needs server-side rendering. For now DOCX/PDF
  contain the Mermaid *code* as a fenced block (text fallback).
- Server-side Mermaid rendering (mermaid-cli/Chromium). Rendering is done **client-side** (mermaid.js).

## Data model — diagrams in `srs.json`

Add an optional array to `backend/app/agent/srs_schema.json`:

```json
"diagrams": {
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id", "title", "mermaid"],
    "properties": {
      "id":          { "type": "string" },
      "title":       { "type": "string" },
      "type":        { "type": "string" },
      "description": { "type": "string" },
      "mermaid":     { "type": "string" }
    }
  }
}
```

`normalize_srs` (in `srs_output.py`) gains diagram healing: default `id` (`DGM-001`…), default
`title`, coerce to strings, and **drop any entry with empty/whitespace `mermaid`** so a malformed
diagram never fails the whole run.

## Agent instructions — `mm/` config files

- `mm/master_prompt.md` — verbatim system prompt: senior BA producing a high-quality Odoo SRS, AND
  instructed to generate Mermaid diagrams for key views, **validate each with the Mermaid MCP
  `validate_and_render_mermaid_diagram` tool**, and place them in `diagrams[]` with stable IDs. Only
  include a diagram after it validates.
- `mm/template.md` — the SRS document structure, including a **Diagrams** section that references the
  diagrams by ID/title.
- The admin imports these via Admin → Master Prompt / Template → **Import .md**, then activates them.
- Requirement: the triggering user must have the **Mermaid MCP tools granted** (Admin → Users → MCP)
  so the agent can call the validate/render tool during the run.

## Backend changes

- `srs_output.write_version`: after validation, for each diagram in `data["diagrams"]` write
  `diagrams/<safe-id>.mmd` into the version folder (inside the existing atomic temp→rename write).
  The filename is a **sanitized** id (`[^A-Za-z0-9._-] → -`, deduped if collisions) so a model-chosen
  id can never escape the folder or clash; the diagram-source endpoint looks up by the original `id`
  from `srs.json` and returns the matching file.
- `render_markdown`: add a **Diagrams** section that emits each diagram as a ```mermaid fenced block
  (so Markdown viewers that support Mermaid render them; DOCX/PDF show the code as text).
- New endpoints (`api/srs.py`), auth = active user:
  - `GET /projects/{id}/versions/{n}/diagrams` → `[{id, title, type, description}]` (read from
    `srs.json`).
  - `GET /projects/{id}/versions/{n}/diagrams/{diagramId}` → the `.mmd` source text (download).
- `srs.json` continues to store `diagrams[]` verbatim (already written today).

## Frontend changes

- New `components/DiagramsCard.tsx`, shown on `ProjectDetail` when the current version has diagrams.
- Per diagram: title/type + **live preview** rendered by **mermaid.js**, which is **dynamically
  imported** (`await import("mermaid")`) so it code-splits out of the main bundle and only loads on
  this page when diagrams exist.
- Downloads per diagram: **.mmd** (fetch source), **.svg** (the mermaid-rendered SVG), **.png**
  (SVG → canvas → PNG, in-browser). Reuse the authed `downloadFile`/blob helper pattern.
- **Selection:** a checkbox per diagram + **Download selected** and **Download all** (sequential
  blob downloads for now). A disabled/"coming soon" **Download ZIP** affordance marks the future step.
- Types: add `SrsDiagram { id, title, type?, description? }` to `lib/types.ts`.

## Verification

- **Backend:** unit-test `normalize_srs` heals/drop-filters diagrams; `write_version` writes
  `diagrams/*.mmd`; the two endpoints return the list and the source. (Scratch DB / temp dirs off
  OneDrive.)
- **Frontend:** `npm run build` clean; mermaid loads lazily (separate chunk).
- **End-to-end (manual):** import the `mm/` files, grant Mermaid tools, generate → the terminal shows
  a `🔌 mermaid · validate_and_render_mermaid_diagram` call, the Diagrams card appears, the preview
  renders, and .mmd/.svg/.png downloads work.

## Future steps (tracked, not in this cycle)

1. `GET …/versions/{n}/bundle.zip` — one-click all resources.
2. Server-side render diagrams to embed real images into DOCX/PDF.
