"""Startup health checks: Node.js and the Claude Code CLI."""
from __future__ import annotations

import shutil
import subprocess


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
    """Return a list of hard problems. If strict and any exist, raise HealthError.

    The Anthropic API key is intentionally NOT checked here — an admin can set it at runtime
    in Settings, and generation is gated on it separately.
    """
    problems: list[str] = []

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
