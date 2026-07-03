"""Startup health checks: Node.js, Claude Code CLI, and API key presence."""
from __future__ import annotations

import shutil
import subprocess

from app.config import settings


class HealthError(RuntimeError):
    pass


def _cmd_exists(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def _try_version(args: list[str]) -> bool:
    try:
        subprocess.run(args, capture_output=True, timeout=15, check=False)
        return True
    except Exception:
        return False


def check_environment(strict: bool = True) -> list[str]:
    """Return a list of problems. If strict and any exist, raise HealthError."""
    problems: list[str] = []

    if not settings.anthropic_api_key:
        problems.append("ANTHROPIC_API_KEY is not set (put it in backend/.env).")

    if not _cmd_exists("node"):
        problems.append("Node.js not found on PATH. Install Node 18+ (https://nodejs.org).")

    # Claude Code CLI is installed as `claude`
    if not (_cmd_exists("claude") or _try_version(["npx", "claude", "--version"])):
        problems.append(
            "Claude Code CLI not found. Run: npm install -g @anthropic-ai/claude-code"
        )

    if strict and problems:
        raise HealthError(
            "Startup health check failed:\n  - " + "\n  - ".join(problems)
        )
    return problems
