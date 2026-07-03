# 11 — Frontend UI

React + Vite + TypeScript, Tailwind + shadcn/ui, `sonner` toasts, `@uiw/react-md-editor`,
`@microsoft/fetch-event-source`.

## Layout & navigation

- Top bar: app name, current user, role, logout. Admin sees an **Admin** menu (Users, Models, Master
  Prompt, Tools, Template).
- Global `<Toaster />` mounted once in `App.tsx`.
- Route guards: `RequireAuth` (any active user), `RequireAdmin` (admin only).

## Pages

### Login / Register / SetPassword
- **Login** — email + password → stores JWT, redirects to Projects.
- **Register** — full name + email → "pending approval" confirmation screen + toast.
- **SetPassword** — reads `?token=`, password + confirm, strength hint → success → login.

### Projects (`/projects`)
- Grid/list of **all** projects (shared workspace). Each card: name, creator, created date,
  **SRS status badge** (None / Generating / Generated / Stale) and **host-sync badge** (Not sent /
  Synced / Out-of-date).
- "New Project" dialog (name).

### ProjectDetail (`/projects/:id`)
- **Documents** — `FileUpload` (drag/drop, multiple), labeled categories (Transcript, Invoices,
  Customer requirement, Other). List with type, size, uploaded-by, delete.
- **Generate panel** —
  - `ModelSelect` (only models the user may use; default preselected).
  - **Generate** button — shown to users only if `srs_status='none'`; once a version exists it's
    replaced by a note "Generated — ask an admin to regenerate." Admins always see **Regenerate**.
  - While running: `GenerationProgress` (phase stepper + % + activity feed) via SSE.
- **SRS outputs** — for the current version: **Download** buttons (MD / JSON / DOCX / PDF).
- **HostSyncPanel** — badge + Send to Host / Sync buttons.
- **Version history** — list of versions; admins can view metadata, compare, and rollback.

### AdminUsers (`/admin/users`)
- **Pending** tab — approve / reject.
- **All users** tab — disable/enable, reset password, change role, manage per-user model access.

### AdminModels (`/admin/models`)
- Table of models; add/edit/delete; enable/disable; set default.

### AdminMasterPrompt (`/admin/master-prompt`)
- `MarkdownEditor` (edit/preview) bound to the active master prompt.
- Save → new version + toast. Version history dropdown with **Restore**.

### AdminTools (`/admin/tools`)
- Table: tool_key, display name, description, enabled switch, edit/delete.
- Add-tool form. Warns if all read tools are disabled.

### AdminTemplate (`/admin/template`)
- `MarkdownEditor` (edit/preview) for the SRS template. Versioned + restore.

## Key components

| Component | Purpose |
|-----------|---------|
| `GenerationProgress.tsx` | SSE-driven phase bar + activity feed + Done/Failed state |
| `ModelSelect.tsx` | dropdown of allowed models |
| `MarkdownEditor.tsx` | `@uiw/react-md-editor` wrapper (edit + preview) |
| `HostSyncPanel.tsx` | send/sync buttons + badge |
| `FileUpload.tsx` | multi-file drag/drop with category labels |
| `StatusBadge.tsx` | colored badges for SRS + host-sync status |

## Data layer (`lib/api.ts`)

- `fetch` wrapper that attaches the JWT and parses `{detail}` errors into thrown errors (caught → toast).
- SSE via `fetchEventSource(url, { headers: { Authorization }, onmessage, onerror })`.

## UX principles

- **Every action gives feedback** — a toast on success/error, plus persistent badges and the progress
  panel's terminal Done/Failed state, so the user always knows if a process finished.
- **Role-aware UI** — hide actions the user can't perform (regenerate, delete, admin menu) and also
  enforce on the server (never trust the client).
- **Refresh-proof** — reopening a project mid-generation restores the live progress via SSE replay.
- Clean, minimal styling with Tailwind + shadcn/ui; accessible components; responsive.
