"""Host storage adapter. Dev uses a local folder; swap the adapter for S3/FTP/HTTP later."""
from __future__ import annotations

import shutil
from pathlib import Path

from app.config import settings


class StorageAdapter:
    def push(self, project_slug: str, version_no: int, source_dir: Path) -> str:
        raise NotImplementedError

    def location(self, project_slug: str, version_no: int) -> str:
        raise NotImplementedError


class LocalFolderStorage(StorageAdapter):
    """Copies a version folder into HOST_STORAGE_DIR/<slug>/v<N>/ atomically."""

    def __init__(self, base: Path) -> None:
        self.base = Path(base)

    def push(self, project_slug: str, version_no: int, source_dir: Path) -> str:
        dest = self.base / project_slug / f"v{version_no}"
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.parent / f".v{version_no}.pushing"
        if tmp.exists():
            shutil.rmtree(tmp, ignore_errors=True)
        shutil.copytree(source_dir, tmp)
        if dest.exists():
            shutil.rmtree(dest, ignore_errors=True)
        tmp.rename(dest)
        return str(dest)

    def location(self, project_slug: str, version_no: int) -> str:
        return str(self.base / project_slug / f"v{version_no}")


def get_storage() -> StorageAdapter:
    # Production: return S3Storage()/FtpStorage() based on config — no route/UI changes needed.
    return LocalFolderStorage(settings.host_storage_dir)
