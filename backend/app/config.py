"""Typed application settings loaded from environment / .env."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Anthropic
    anthropic_api_key: str = ""

    # Optional explicit path to the Claude Code CLI (else auto-detected from PATH / common
    # install locations). Set this if the backend can't launch `claude`.
    claude_cli_path: str = ""

    # Security
    jwt_secret: str = "change-me"
    jwt_expire_minutes: int = 720
    jwt_algorithm: str = "HS256"

    # Seeded admin
    admin_email: str = "admin@example.com"
    admin_password: str = "ChangeMe123!"

    # Models
    default_model: str = "claude-sonnet-5"

    # Paths
    data_dir: Path = Path("./data")
    ba_output_dir: Path = Path("./BA Output")
    host_storage_dir: Path = Path("./host-storage")

    # URLs
    app_base_url: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173"

    # Email
    dev_email: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_from: str = "BA Agent <no-reply@example.com>"

    # ----- derived paths -----
    @property
    def db_path(self) -> Path:
        return self.data_dir / "app.db"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def workspaces_dir(self) -> Path:
        return self.data_dir / "workspaces"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_from)

    def ensure_dirs(self) -> None:
        for p in (self.data_dir, self.ba_output_dir, self.host_storage_dir,
                  self.uploads_dir, self.workspaces_dir):
            Path(p).mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
