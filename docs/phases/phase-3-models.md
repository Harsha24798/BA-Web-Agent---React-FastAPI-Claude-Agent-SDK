# Phase 3 — LLM Models & Access

**Goal:** Admin manages the model list; users pick an allowed model before generating. Reference:
[05-agent-and-srs.md](../05-agent-and-srs.md).

## Files
- `backend/app/api/models.py` — `GET /models` (caller's allowed), admin CRUD under `/admin/models`
- extend `backend/app/api/users.py` — `PUT /users/{id}/models` (per-user grants)
- `frontend/src/pages/AdminModels.tsx`, `frontend/src/components/ModelSelect.tsx`
- extend `frontend/src/pages/AdminUsers.tsx` — per-user model access UI

## Steps
1. **Allowed-models logic** — `GET /models` returns: if the caller has `user_models` rows → those
   (intersected with `is_enabled`); else all `is_enabled` models. Mark the default.
2. **Admin model CRUD** — `/admin/models` add/edit/delete, toggle `is_enabled`, set `is_default`,
   `sort_order`.
3. **Per-user grants** — `PUT /users/{id}/models {model_ids}` replaces that user's grants.
4. **Frontend** — `AdminModels` table (CRUD + toggles); `ModelSelect` dropdown used in ProjectDetail
   (fetches `/models`, preselects default); AdminUsers gains a per-user model multi-select.

## Done-check
- Admin enables 2 models; a user with no grants sees both; grant the user only 1 → they see only 1.
- `ModelSelect` shows the default preselected.
- Server rejects a generate request with a model the caller isn't allowed (403) — verify in phase 4.
