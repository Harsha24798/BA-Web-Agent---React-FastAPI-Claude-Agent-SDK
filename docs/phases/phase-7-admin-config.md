# Phase 7 — Admin Config (Template · Master Prompt · Tools)

**Goal:** The three separate, versioned admin configs with a friendly Markdown editor. Reference:
[09-agent-config.md](../09-agent-config.md).

## Files
- `backend/app/api/agent_config.py` — master-prompt CRUD+restore, template CRUD+restore, tools CRUD
- `backend/app/api/templates.py` (or fold into agent_config) — SRS template endpoints
- `frontend/src/pages/{AdminMasterPrompt,AdminTools,AdminTemplate}.tsx`
- `frontend/src/components/MarkdownEditor.tsx` — `@uiw/react-md-editor` wrapper (edit/preview)

## Steps
1. **Master prompt** — `GET /admin/master-prompt` (active + history); `POST` saves a new version and
   flips `is_active`; `POST /admin/master-prompt/{versionId}/restore` rolls back. Content used
   **verbatim** by `agent/prompt.py`.
2. **SRS template** — same versioned pattern under `/admin/template`.
3. **Tools** — `GET/POST/PUT/DELETE /admin/tools` (tool_key, display_name, description, is_enabled,
   sort_order). Enabled keys drive `allowed_tools`. Guard: warn/refuse if all read tools disabled.
4. **MarkdownEditor** — wrap `@uiw/react-md-editor` with edit / preview / split modes; save button;
   version-history dropdown with **Restore**.
5. **Pages** — `AdminMasterPrompt` + `AdminTemplate` use `MarkdownEditor`; `AdminTools` is a table
   with inline add/edit/delete + enable switches. Admin-only routes; toasts on save.
6. **Wire-in** — confirm `agent/prompt.py` reads the **active** master prompt + template at
   generation time, and `runner.py` reads **enabled** tools — so edits take effect on the next run.

## Done-check
- Edit master prompt in the MD editor (preview works), save → new version; a distinctive instruction
  is reflected in the next generation's behavior/output; **restore** a prior version works.
- Disable a tool (e.g. `Grep`) → it's absent from `allowed_tools` on the next run; add/edit/delete a
  tool persists.
- Edit SRS template → next SRS follows the new structure.
