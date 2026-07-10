"""Admin settings: Anthropic API key + mail server, with connection tests."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.db.database import get_db
from app.db.models import AppSettings, McpServer, User, UserMcpTool
from app.schemas import (
    AnthropicKeyIn,
    McpServerIn,
    McpServerOut,
    McpToggleIn,
    McpHeaderOut,
    McpToolOut,
    McpToolToggleIn,
    MessageOut,
    SettingsOut,
    SmtpIn,
)
from app.security.crypto import decrypt_secret, encrypt_secret, mask
from app.services import mcp_service, settings_service as svc

router = APIRouter(prefix="/admin/settings", tags=["settings"],
                   dependencies=[Depends(require_admin)])


def _out(row: AppSettings) -> SettingsOut:
    key = decrypt_secret(row.anthropic_key_ct)
    return SettingsOut(
        anthropic_key_set=bool(row.anthropic_key_ct),
        anthropic_key_hint=mask(key) if key else None,
        anthropic_status=row.anthropic_status,
        anthropic_checked_at=row.anthropic_checked_at,
        anthropic_error=row.anthropic_error,
        smtp_host=row.smtp_host,
        smtp_port=row.smtp_port,
        smtp_user=row.smtp_user,
        smtp_pass_set=bool(row.smtp_pass_ct),
        smtp_from=row.smtp_from,
        smtp_status=row.smtp_status,
        smtp_checked_at=row.smtp_checked_at,
        smtp_error=row.smtp_error,
    )


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return _out(svc.get_or_create(db))


# ---------------- Anthropic ----------------
@router.put("/anthropic", response_model=SettingsOut)
def set_anthropic(body: AnthropicKeyIn, admin: User = Depends(require_admin),
                  db: Session = Depends(get_db)):
    row = svc.get_or_create(db)
    row.anthropic_key_ct = encrypt_secret(body.key.strip())
    row.anthropic_status = "unknown"
    row.anthropic_error = None
    row.anthropic_checked_at = None
    row.updated_by = admin.id
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    svc.apply_key_to_env()  # make it available to the agent SDK immediately
    return _out(row)


@router.delete("/anthropic", response_model=SettingsOut)
def delete_anthropic(db: Session = Depends(get_db)):
    row = svc.get_or_create(db)
    row.anthropic_key_ct = None
    row.anthropic_status = "unknown"
    row.anthropic_error = None
    row.anthropic_checked_at = None
    db.commit()
    return _out(row)


@router.post("/anthropic/test", response_model=SettingsOut)
async def test_anthropic(db: Session = Depends(get_db)):
    row = svc.get_or_create(db)
    key = decrypt_secret(row.anthropic_key_ct)
    status, error = await asyncio.to_thread(svc.test_anthropic, key)
    row.anthropic_status = status
    row.anthropic_error = error
    row.anthropic_checked_at = datetime.now(timezone.utc)
    db.commit()
    return _out(row)


# ---------------- Mail server ----------------
@router.put("/smtp", response_model=SettingsOut)
def set_smtp(body: SmtpIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = svc.get_or_create(db)
    row.smtp_host = body.host.strip()
    row.smtp_port = body.port
    row.smtp_user = body.user.strip()
    row.smtp_from = body.from_addr.strip()
    if body.password:  # omitted/empty = keep the stored password
        row.smtp_pass_ct = encrypt_secret(body.password)
    row.smtp_status = "unknown"
    row.smtp_error = None
    row.smtp_checked_at = None
    row.updated_by = admin.id
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _out(row)


@router.delete("/smtp", response_model=SettingsOut)
def delete_smtp(db: Session = Depends(get_db)):
    row = svc.get_or_create(db)
    row.smtp_host = ""
    row.smtp_user = ""
    row.smtp_pass_ct = None
    row.smtp_from = ""
    row.smtp_status = "unknown"
    row.smtp_error = None
    row.smtp_checked_at = None
    db.commit()
    return _out(row)


@router.post("/smtp/test", response_model=SettingsOut)
async def test_smtp(db: Session = Depends(get_db)):
    row = svc.get_or_create(db)
    cfg = svc.effective_smtp()
    status_, error = await asyncio.to_thread(svc.test_smtp, cfg)
    row.smtp_status = status_
    row.smtp_error = error
    row.smtp_checked_at = datetime.now(timezone.utc)
    db.commit()
    return _out(row)


# ---------------- MCP servers ----------------
def _mcp_out(server: McpServer) -> McpServerOut:
    meta = json.loads(server.headers_json or "[]")
    secrets = json.loads(server.secrets_ciphertext or "{}")
    headers: list[McpHeaderOut] = []
    for h in meta:
        name = h.get("name", "")
        if h.get("is_secret"):
            hint = None
            cipher = secrets.get(name)
            if cipher:
                hint = mask(decrypt_secret(cipher)) or "••••"
            headers.append(McpHeaderOut(name=name, is_secret=True, value_hint=hint))
        else:
            headers.append(McpHeaderOut(name=name, is_secret=False, value=h.get("value")))
    tools = [
        McpToolOut(name=t.get("name", ""), description=t.get("description", ""),
                   is_enabled=t.get("is_enabled", True))
        for t in json.loads(server.discovered_tools_json or "[]") if t.get("name")
    ]
    return McpServerOut(
        id=server.id, name=server.name, slug=server.slug, transport=server.transport,
        url=server.url, headers=headers, status=server.status,
        last_checked_at=server.last_checked_at, last_error=server.last_error,
        tools=tools, is_enabled=server.is_enabled,
    )


def _get_server(db: Session, server_id: str) -> McpServer:
    server = db.get(McpServer, server_id)
    if not server:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "MCP server not found")
    return server


def _apply_headers(server: McpServer, body: McpServerIn) -> None:
    """Rebuild headers_json + secrets_ciphertext from the request (blank secret = keep)."""
    old_secrets = json.loads(server.secrets_ciphertext or "{}")
    meta: list[dict] = []
    new_secrets: dict[str, str] = {}
    for h in body.headers:
        if h.is_secret:
            meta.append({"name": h.name, "is_secret": True})
            if h.value:
                new_secrets[h.name] = encrypt_secret(h.value)
            elif h.name in old_secrets:
                new_secrets[h.name] = old_secrets[h.name]
        else:
            meta.append({"name": h.name, "is_secret": False, "value": h.value or ""})
    server.headers_json = json.dumps(meta)
    server.secrets_ciphertext = json.dumps(new_secrets)


@router.get("/mcp", response_model=list[McpServerOut])
def list_mcp(db: Session = Depends(get_db)):
    rows = db.scalars(select(McpServer).order_by(McpServer.name))
    return [_mcp_out(s) for s in rows]


@router.post("/mcp", response_model=McpServerOut)
def create_mcp(body: McpServerIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.scalar(select(McpServer).where(McpServer.name == body.name.strip())):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An MCP server with that name already exists")
    slug = mcp_service.slugify(body.name)
    n = 1
    base = slug
    while db.scalar(select(McpServer).where(McpServer.slug == slug)):
        n += 1
        slug = f"{base}-{n}"
    server = McpServer(name=body.name.strip(), slug=slug, transport=body.transport,
                       url=body.url.strip(), is_enabled=body.is_enabled, status="unknown",
                       created_by=admin.id, updated_at=datetime.now(timezone.utc))
    _apply_headers(server, body)
    db.add(server)
    db.commit()
    return _mcp_out(server)


@router.put("/mcp/{server_id}", response_model=McpServerOut)
def update_mcp(server_id: str, body: McpServerIn, db: Session = Depends(get_db)):
    server = _get_server(db, server_id)
    if body.name.strip() != server.name and db.scalar(
        select(McpServer).where(McpServer.name == body.name.strip(), McpServer.id != server_id)
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An MCP server with that name already exists")
    server.name = body.name.strip()
    server.transport = body.transport
    server.url = body.url.strip()
    _apply_headers(server, body)
    # Any connection-affecting change invalidates the previous test result.
    server.status = "unknown"
    server.last_error = None
    server.discovered_tools_json = "[]"
    server.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _mcp_out(server)


@router.post("/mcp/{server_id}/toggle", response_model=McpServerOut)
def toggle_mcp(server_id: str, body: McpToggleIn, db: Session = Depends(get_db)):
    server = _get_server(db, server_id)
    server.is_enabled = body.is_enabled
    server.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _mcp_out(server)


@router.post("/mcp/{server_id}/tools/toggle", response_model=McpServerOut)
def toggle_mcp_tool(server_id: str, body: McpToolToggleIn, db: Session = Depends(get_db)):
    """Enable/disable a single discovered tool on a connected MCP server."""
    server = _get_server(db, server_id)
    tools = json.loads(server.discovered_tools_json or "[]")
    found = False
    for t in tools:
        if t.get("name") == body.tool_name:
            t["is_enabled"] = body.is_enabled
            found = True
    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tool not found on this server")
    server.discovered_tools_json = json.dumps(tools)
    server.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _mcp_out(server)


@router.post("/mcp/{server_id}/test", response_model=McpServerOut)
async def test_mcp(server_id: str, db: Session = Depends(get_db)):
    server = _get_server(db, server_id)
    result = await mcp_service.probe_mcp_server(server.slug, server)
    mcp_service.apply_probe_result(server, result)
    db.commit()
    return _mcp_out(server)


@router.delete("/mcp/{server_id}", response_model=MessageOut)
def delete_mcp(server_id: str, db: Session = Depends(get_db)):
    server = _get_server(db, server_id)
    # Remove any per-user grants that referenced this server's tools.
    db.query(UserMcpTool).filter(UserMcpTool.tool_ref.like(f"mcp__{server.slug}__%")).delete(
        synchronize_session=False
    )
    db.delete(server)
    db.commit()
    return MessageOut(detail="MCP server deleted.")


# ---------------- Check all connections (sync) ----------------
@router.post("/check-all")
async def check_all(db: Session = Depends(get_db)):
    row = svc.get_or_create(db)
    servers = list(db.scalars(select(McpServer)))

    # Kick off every check concurrently (blocking ones go to threads).
    tasks = []
    key = decrypt_secret(row.anthropic_key_ct) or svc.effective_anthropic_key()
    tasks.append(("anthropic", asyncio.to_thread(svc.test_anthropic, key)))
    if svc.effective_smtp().configured:
        tasks.append(("smtp", asyncio.to_thread(svc.test_smtp, svc.effective_smtp())))
    for s in servers:
        tasks.append((f"mcp:{s.id}", mcp_service.probe_mcp_server(s.slug, s)))

    results = await asyncio.gather(*[t[1] for t in tasks], return_exceptions=True)
    now = datetime.now(timezone.utc)
    by_key = {tasks[i][0]: results[i] for i in range(len(tasks))}

    # Persist anthropic
    if not isinstance(by_key.get("anthropic"), Exception):
        st, err = by_key["anthropic"]
        row.anthropic_status, row.anthropic_error, row.anthropic_checked_at = st, err, now
    # Persist smtp (if tested)
    if "smtp" in by_key and not isinstance(by_key["smtp"], Exception):
        st, err = by_key["smtp"]
        row.smtp_status, row.smtp_error, row.smtp_checked_at = st, err, now
    # Persist each MCP
    for s in servers:
        res = by_key.get(f"mcp:{s.id}")
        if isinstance(res, Exception) or res is None:
            res = {"status": "failed", "error": "Check failed.", "tools": []}
        mcp_service.apply_probe_result(s, res)
    db.commit()

    return {"settings": _out(row), "mcp": [_mcp_out(s) for s in servers]}
