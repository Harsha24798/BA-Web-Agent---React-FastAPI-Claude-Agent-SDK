# 07 — Host Storage: Send & Sync

## Why

The downstream "BA Agent" reads the SRS from **host storage** — it does **not** reach into this app's
local `BA Output/`. So after generation, the user explicitly **sends** the outputs to host storage,
and can **sync** to confirm the host has the latest version. Status is always visible via a badge.

For **dev**, "host storage" is just a local folder (`HOST_STORAGE_DIR`). The code is written behind a
**storage adapter** so a real backend (S3, FTP, an HTTP API) can be dropped in later with no changes
to the API routes or the UI.

## Storage adapter (`services/storage.py`)

```python
class StorageAdapter:
    def push(self, project_slug: str, version_no: int, files: list[Path]) -> PushResult: ...
    def status(self, project_slug: str, version_no: int) -> HostStatus: ...

class LocalFolderStorage(StorageAdapter):
    # dev impl: copy files into HOST_STORAGE_DIR/<slug>/v<N>/ atomically
    ...
```

- The active adapter is chosen in `config.py` (dev → `LocalFolderStorage`).
- Future adapters (`S3Storage`, `FtpStorage`, `HttpStorage`) implement the same interface.
- `push()` copies the **whole version folder** (srs.md, srs.json, srs.docx, srs.pdf). The downstream
  agent primarily needs `srs.json` + `srs.md`, but all four are sent for completeness.
- Writes are atomic (temp then move/rename) so a partially-copied version is never visible.

## API (`app/api/storage.py`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/projects/{id}/srs/{version}/send-host` | active | push a specific version to host |
| POST | `/projects/{id}/sync-host` | active | (re)push the **current** version to host |
| GET | `/projects/{id}/host-status` | active | current host-sync badge state |

On a successful push: set `srs_versions.host_sync_status='synced'`, `host_synced_at=now`, fire a toast.

## Sync-status badge (project & version)

| Badge | Meaning |
|-------|---------|
| **Not sent** | The current version has never been pushed. |
| **Synced** | The current version is on the host (`host_sync_status='synced'`). |
| **Out-of-date** | A newer local version exists than the last one synced → click **Sync**. |

Derivation: compare `project.current_srs_version_id` against the latest version whose
`host_sync_status='synced'`. Equal → Synced; newer local exists → Out-of-date; none synced → Not sent.

Because version folders are **immutable**, once a version is synced it stays synced — "Out-of-date"
only appears when a *new* version (e.g. an admin regeneration) hasn't been pushed yet.

## Frontend (`components/HostSyncPanel.tsx`)

- Shows the badge + `host_synced_at` timestamp.
- **Send to Host Storage** button (for a version not yet sent).
- **Sync** button (re-push current version) — useful after a regeneration.
- Every action fires a success/error toast and refreshes the badge.

## Dev tips (requirement #6)

- Set `HOST_STORAGE_DIR` to any local folder, e.g. `C:\ba-agent-host`. "Send" just creates
  `C:\ba-agent-host\<project-slug>\v1\...`.
- Keep it **outside OneDrive** to avoid sync-lock conflicts.
- When you later have a real host, implement one adapter class and switch it in `config.py`; nothing
  else changes.
