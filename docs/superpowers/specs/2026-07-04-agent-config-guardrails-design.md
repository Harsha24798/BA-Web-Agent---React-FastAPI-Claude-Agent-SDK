# Agent config guardrails: unique names, explicit deactivate, no hardcoded defaults

## Problem

The Master Prompt and SRS Template admin libraries (`AgentPrompt`, `Template` in `db/models.py`,
managed via `api/agent_config.py` + `NamedConfigManager.tsx`) currently have three gaps:

1. Two items of the same type can share a name (no uniqueness check on `name`).
2. There's no way to turn off the active item without immediately picking a replacement —
   `activate()` always leaves exactly one row active (once any row exists). Admins can't express
   "nothing should be active right now."
3. A fresh install auto-seeds a hardcoded "Default Master Prompt" and "Default SRS Template"
   (`agent/defaults.py`, wired through `db/seed.py`), so generation always has *something* to work
   with even if no admin has ever configured anything. Requirements should always come from
   admin-authored content, never a baked-in fallback — and if none exists yet, generation should be
   blocked with a clear reason instead of silently running against empty/placeholder content.

## Goals

- Template names are unique among Templates; Master Prompt names are unique among Master Prompts
  (case-insensitive). The two pools are independent — a Template and a Master Prompt may share a name.
- Admins can explicitly deactivate the current active Template/Master Prompt, leaving zero active.
- Fresh installs seed no Master Prompt or Template content. The library starts empty; the first item
  an admin creates becomes active automatically (existing `_create` behavior), same as today.
- The name-library list itself may be fully empty (no "must keep at least one" restriction), since
  "nothing configured yet" is now a normal, expected state.
- Generation is blocked — for every user, admin included — whenever there is no active Master Prompt
  or no active Template, with a clear reason shown before they even try.

## Non-goals

- No DB-level `UNIQUE` constraint on `name`. This app has no migration tool (`db/database.py::init_db`
  only calls `Base.metadata.create_all`, which never alters existing tables), so a schema-level
  constraint wouldn't retroactively apply to an already-running dev DB. Application-level validation
  is enough for a single-admin local tool.
- No change to how `activate()` behaves when picking a new active item (still deactivates all others
  of that type first).
- No change to the "cannot delete the active item" delete guard — deactivating first is still required
  before deleting an active row. (Only the separate "at least one item must remain" guard is removed.)

## Design

### Backend: `api/agent_config.py`

- `_create(db, Model, body, admin)` and `_update(db, Model, item_id, body)` gain a case-insensitive
  duplicate-name check scoped to `Model` (so `AgentPrompt` and `Template` are checked independently):
  query for another row of the same `Model` where `func.lower(Model.name) == body.name.strip().lower()`
  (excluding `item_id` itself on update). If found, raise `400 "A {noun} named '<name>' already exists."`
  The `noun` ("master prompt" / "SRS template") is already available at the call sites that invoke
  these helpers today — thread it through as a parameter.
- `_delete(db, Model, item_id)`: remove the `"At least one must remain."` check. Keep the existing
  `"Cannot delete the active item. Activate another first."` check unchanged.
- New `_deactivate(db, Model, item_id)` helper: loads the row, 404s if missing, sets `is_active = False`
  unconditionally (idempotent — no error if it was already inactive), commits, returns it.
- New routes mirroring the existing `/activate` ones:
  - `POST /admin/master-prompt/{item_id}/deactivate`
  - `POST /admin/template/{item_id}/deactivate`

### Backend: seeding

- `agent/defaults.py` is deleted (`DEFAULT_MASTER_PROMPT`, `DEFAULT_SRS_TEMPLATE` are unused anywhere
  else — confirmed by grep).
- `db/seed.py`: remove `_seed_master_prompt` and `_seed_template` and their calls from `seed()`.
  `seed()` now only seeds the admin user and default tools; `AgentPrompt`/`Template` tables start
  empty on a fresh DB.

### Backend: generation readiness

- `agent/prompt.py` already has `active_master_prompt(db)` and `active_template(db)`. Add a small
  helper, e.g. `agent_config_ready(db) -> bool`, returning whether both an active prompt (non-empty
  row) and an active template exist.
- `api/generation.py::_start_job`: add a check alongside the existing "no docs" check — if
  `not agent_config_ready(db)`, raise `400 "Ask an admin to activate a master prompt and SRS template first."`
  This covers both `/generate` and `/regenerate` (both call `_start_job`), so admins are blocked too.
- `api/projects.py::serialize_project`: gains a `ready: bool` parameter (computed **once** by the
  caller, not per project, to avoid repeating the same two queries in `list_projects`'s loop) and sets
  it on the returned `ProjectOut` as a new field `agent_config_ready: bool`. Both `list_projects` and
  `get_project` compute it once before serializing.
- `schemas.py`: add `agent_config_ready: bool` to `ProjectOut`.

### Frontend

- `lib/types.ts`: add `agent_config_ready: boolean` to `Project`.
- `pages/ProjectDetail.tsx`: `canGenerate` and `canRegenerate` also require
  `project.agent_config_ready`. When it's `false`, render a message in place of the button:
  "Generation is unavailable — ask an admin to activate a master prompt and SRS template." (shown
  regardless of admin/non-admin, since the block applies to everyone).
- `components/NamedConfigManager.tsx`: replace the "Active" badge + conditional "Activate" button with
  a `Toggle` (from `components/ui.tsx`) per row, always visible:
  - `checked = it.is_active`
  - `onChange(true)` → calls existing `POST {endpoint}/{id}/activate`
  - `onChange(false)` → calls new `POST {endpoint}/{id}/deactivate`
  - The "Delete" button's visibility/logic is unchanged (still hidden for the active row, since delete
    is blocked server-side for active rows).
- `lib/api.ts`: no changes needed — `apiPost` is generic enough for the new deactivate route.

### Error surfacing

Both new failure modes (duplicate name on save, generation blocked on missing config) are handled by
the existing `withToast` pattern already used throughout the frontend — no new UI plumbing needed
beyond what's described above.

## Testing

No test suite exists in this repo (confirmed: no test files anywhere in `backend/` or `frontend/`,
no test runner configured in `requirements.txt` or `package.json`). Verification will be manual:

1. Fresh DB (delete `DATA_DIR/app.db`, restart backend) → confirm Admin → Master Prompt / Template
   pages show empty lists, and the Generate button on a project with documents shows the "unavailable"
   message instead of being clickable.
2. Create a Master Prompt and a Template → first one created becomes active automatically → Generate
   button becomes available.
3. Try creating a second Master Prompt with the same name (any case) → expect a 400 toast.
4. Toggle the active Master Prompt off → Generate button reverts to "unavailable"; toggle it back on
   → available again.
5. Confirm deleting the last remaining (inactive) Template succeeds (previously blocked).
6. Confirm deleting the *active* Template is still blocked.

## Open items for implementation

None — all prior open questions were resolved in discussion with the user (uniqueness scope,
case-sensitivity, deactivate UX, generation-block UX, empty-list deletion).
