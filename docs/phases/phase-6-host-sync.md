# Phase 6 — Host Storage Sync

**Goal:** Push generated outputs to host storage and show sync status. Reference:
[07-host-storage-sync.md](../07-host-storage-sync.md).

## Files
- `backend/app/services/storage.py` — `StorageAdapter` interface + `LocalFolderStorage` (dev)
- `backend/app/api/storage.py` — send-host / sync-host / host-status
- extend `backend/app/config.py` — select active adapter (`HOST_STORAGE_DIR`)
- `frontend/src/components/HostSyncPanel.tsx`; extend Projects/ProjectDetail badges

## Steps
1. **Adapter** — `StorageAdapter.push(slug, version_no, files)` and `status(...)`. `LocalFolderStorage`
   copies the version folder into `HOST_STORAGE_DIR/<slug>/v<N>/` atomically (temp then move).
2. **Endpoints** —
   - `POST /projects/{id}/srs/{version}/send-host` → push; set `host_sync_status='synced'`,
     `host_synced_at`.
   - `POST /projects/{id}/sync-host` → re-push the **current** version.
   - `GET /projects/{id}/host-status` → derived badge (Not sent / Synced / Out-of-date).
3. **Badge derivation** — compare `current_srs_version` to the latest synced version (see doc).
4. **Frontend** — `HostSyncPanel` (badge + timestamp + Send/Sync buttons, toasts). Show the host-sync
   badge on project cards and detail. After an admin regeneration, badge flips to **Out-of-date**
   until Sync.

## Done-check
- Send-to-Host copies files into `HOST_STORAGE_DIR/<slug>/v1/`; badge → **Synced**; toast fires.
- Regenerate (admin) → new v2 → badge **Out-of-date**; **Sync** pushes v2 → **Synced**.
- Swapping the adapter class in `config.py` would change the destination with no route/UI changes
  (design verification — no need to build a real remote adapter now).
