"""MCP server config assembly + live connection probe.

Secrets are decrypted just-in-time and never logged or returned to clients.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import McpServer, User, UserMcpTool
from app.security.crypto import decrypt_secret
from app.services.settings_service import effective_anthropic_key

logger = logging.getLogger("ba-agent.mcp")

PROBE_TIMEOUT_S = 20


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:60] or "mcp"


def resolved_headers(server: McpServer) -> tuple[dict[str, str], list[str]]:
    """Full header dict (secret values decrypted). Returns (headers, secret_values)."""
    meta = json.loads(server.headers_json or "[]")
    secrets = json.loads(server.secrets_ciphertext or "{}")
    out: dict[str, str] = {}
    secret_values: list[str] = []
    for h in meta:
        name = h.get("name", "")
        if not name:
            continue
        if h.get("is_secret"):
            cipher = secrets.get(name)
            if cipher:
                value = decrypt_secret(cipher)
                out[name] = value
                secret_values.append(value)
        elif h.get("value") is not None:
            out[name] = str(h["value"])
    return out, secret_values


def server_config_dict(server: McpServer) -> tuple[dict, list[str]]:
    """SDK McpServerConfig dict ({type,url,headers}). Returns (config, secret_values)."""
    headers, secret_values = resolved_headers(server)
    entry: dict = {"type": server.transport, "url": server.url}
    if headers:
        entry["headers"] = headers
    return entry, secret_values


def _redact(text: str, secrets: list[str]) -> str:
    for s in secrets:
        if s:
            text = text.replace(s, "***")
    return text


def _describe_exception(e: Exception) -> str:
    """Build an informative one-line error from an SDK/CLI exception.

    The claude-agent-sdk CLI errors put the useful detail on attributes (stderr/exit_code),
    not always in str(e) — so a bare str() can read like 'Failed to start Claude Code:'.
    """
    parts: list[str] = []
    msg = (str(e) or "").strip().rstrip(":").strip()
    parts.append(msg or type(e).__name__)
    stderr = getattr(e, "stderr", None)
    if stderr:
        parts.append(f"details: {str(stderr).strip()[:600]}")
    exit_code = getattr(e, "exit_code", None)
    if exit_code is not None:
        parts.append(f"exit code {exit_code}")
    # Common Windows/setup hint when the CLI won't launch.
    low = " ".join(parts).lower()
    if "start claude" in low or "not found" in low or "enoent" in low:
        parts.append("(the Claude Code CLI could not be launched — confirm `claude --version` runs "
                     "in the same environment as the backend, and that Node.js is on PATH)")
    return " — ".join(parts)


async def probe_mcp_server(slug: str, server: McpServer) -> dict:
    """Connect a throwaway SDK client with only this server and read its live status.

    Returns {status: connected|failed, error: str|None, tools: [{name, description}]}.
    """
    if not effective_anthropic_key():
        return {"status": "failed",
                "error": "Configure and connect the Anthropic API key first.", "tools": []}

    from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

    from app.health import resolve_cli_path

    entry, secret_values = server_config_dict(server)
    opts: dict = dict(mcp_servers={slug: entry}, allowed_tools=[], max_turns=1)
    cli = resolve_cli_path()
    if cli:
        opts["cli_path"] = cli
    options = ClaudeAgentOptions(**opts)
    client = ClaudeSDKClient(options=options)
    last: dict | None = None
    try:
        async with asyncio.timeout(PROBE_TIMEOUT_S):
            await client.connect()
            # MCP servers connect asynchronously — get_mcp_status() reports "pending" at first.
            # Poll until this server settles (connected / failed / needs-auth) or we time out.
            while True:
                status_resp = await client.get_mcp_status()
                last = next((s for s in (status_resp or {}).get("mcpServers", []) or []
                             if s.get("name") == slug), None)
                if last and last.get("status") != "pending":
                    break
                await asyncio.sleep(1)
    except asyncio.TimeoutError:
        if last is not None:  # settled as pending the whole time
            return {"status": "failed",
                    "error": "Timed out while the server was still connecting.", "tools": []}
        return {"status": "failed", "error": "Connection test timed out.", "tools": []}
    except Exception as e:  # noqa: BLE001
        # Log the full stack to the backend console for diagnosis; return a readable summary.
        logger.exception("MCP probe failed for %s", slug)
        return {"status": "failed", "error": _redact(_describe_exception(e), secret_values), "tools": []}
    finally:
        try:
            await client.disconnect()
        except Exception:  # noqa: BLE001
            pass

    if last is None:
        return {"status": "failed", "error": "Server did not report a status.", "tools": []}

    sdk_status = last.get("status", "failed")
    tools = [{"name": t.get("name"), "description": t.get("description", "")}
             for t in (last.get("tools") or []) if t.get("name")]
    if sdk_status == "connected":
        return {"status": "connected", "error": None, "tools": tools}
    if sdk_status == "needs-auth":
        return {"status": "failed",
                "error": "Authentication was rejected — check the API key/header.", "tools": tools}
    return {"status": "failed",
            "error": _redact(last.get("error") or f"Server status: {sdk_status}", secret_values),
            "tools": tools}


def build_generation_mcp(db: Session, user: User | None) -> tuple[dict, list[str]]:
    """Assemble (mcp_servers_config, allowed_tool_refs) for a generation run.

    Includes ONLY: servers that are enabled AND status=='connected', tools that are enabled
    (per-tool toggle) AND granted to `user` (opt-in per-user grants). Returns empty when the
    user has no grants — matching the opt-in MCP access model. Secrets are decrypted here and
    live only in memory for the run.
    """
    if user is None:
        return {}, []
    granted = set(db.scalars(
        select(UserMcpTool.tool_ref).where(UserMcpTool.user_id == user.id)
    ))
    if not granted:
        return {}, []

    servers = db.scalars(
        select(McpServer).where(
            McpServer.is_enabled == True,  # noqa: E712
            McpServer.status == "connected",
        )
    )
    mcp_servers: dict = {}
    allowed_refs: list[str] = []
    for s in servers:
        tools = json.loads(s.discovered_tools_json or "[]")
        server_refs = [
            f"mcp__{s.slug}__{t['name']}"
            for t in tools
            if t.get("name") and t.get("is_enabled", True)
            and f"mcp__{s.slug}__{t['name']}" in granted
        ]
        if server_refs:
            entry, _secrets = server_config_dict(s)
            mcp_servers[s.slug] = entry
            allowed_refs.extend(server_refs)
    return mcp_servers, allowed_refs


def apply_probe_result(server: McpServer, result: dict) -> None:
    server.status = result["status"]
    server.last_error = result.get("error")
    server.last_checked_at = datetime.now(timezone.utc)
    # Preserve each tool's admin enable/disable flag across re-probes (default enabled for new tools).
    prev = {t.get("name"): t for t in json.loads(server.discovered_tools_json or "[]")}
    tools = [
        {"name": t.get("name"), "description": t.get("description", ""),
         "is_enabled": prev.get(t.get("name"), {}).get("is_enabled", True)}
        for t in (result.get("tools") or []) if t.get("name")
    ]
    server.discovered_tools_json = json.dumps(tools)
