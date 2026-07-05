"""Startup health checks: Node.js and the Claude Code CLI."""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path


class HealthError(RuntimeError):
    pass


def _cmd_exists(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def _common_cli_locations() -> list[Path]:
    """Known install locations for the Claude Code CLI, so we don't depend on how uvicorn was
    launched (its PATH may miss ~/.local/bin or the npm global dir)."""
    home = Path.home()
    appdata = os.environ.get("APPDATA", "")
    names = ["claude.exe", "claude.cmd", "claude"]
    dirs = [home / ".local" / "bin", home / "bin"]
    if appdata:
        dirs.append(Path(appdata) / "npm")
    out: list[Path] = []
    for d in dirs:
        for n in names:
            out.append(d / n)
    return out


def resolve_cli_path() -> str | None:
    """Full path to the `claude` binary. Checks CLAUDE_CLI_PATH, then PATH, then common
    install locations. Returns None if not found (SDK will fall back to its own discovery)."""
    from app.config import settings
    if settings.claude_cli_path and Path(settings.claude_cli_path).exists():
        return settings.claude_cli_path
    found = shutil.which("claude")
    if found:
        return found
    for p in _common_cli_locations():
        if p.exists():
            return str(p)
    return None


def ensure_cli_on_path() -> str | None:
    """If the CLI is found by full path, make sure its directory is on PATH for subprocesses.
    Returns the resolved CLI path (or None)."""
    cli = resolve_cli_path()
    if cli:
        d = str(Path(cli).parent)
        if d and d not in os.environ.get("PATH", "").split(os.pathsep):
            os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")
    return cli


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

    # Claude Code CLI is installed as `claude` (check PATH + common install locations)
    if not (resolve_cli_path() or _try_version(["npx", "claude", "--version"])):
        problems.append(
            "Claude Code CLI not found. Run: npm install -g @anthropic-ai/claude-code"
        )

    if strict and problems:
        raise HealthError(
            "Startup health check failed:\n  - " + "\n  - ".join(problems)
        )
    return problems
