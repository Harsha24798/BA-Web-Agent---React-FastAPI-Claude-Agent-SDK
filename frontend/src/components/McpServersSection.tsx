import { useEffect, useState } from "react";
import { ListTree, Pencil, Plug, Plus, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api";
import { toast, withToast } from "../lib/toast";
import type { McpHeader, McpServer } from "../lib/types";
import { Button, Card, ConfirmDialog, ConnBadge, Input, Label, Modal, Select, Spinner, Toggle } from "./ui";

type HeaderRow = { name: string; is_secret: boolean; value: string; value_hint?: string | null };

const AUTH_PRESETS: Record<string, HeaderRow[]> = {
  none: [],
  api_key: [{ name: "x-api-key", is_secret: true, value: "" }],
  bearer: [{ name: "Authorization", is_secret: true, value: "" }],
  custom: [{ name: "", is_secret: true, value: "" }],
};

function slugPreview(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "mcp";
}

/** Full-width MCP server management, embedded in the Settings page. */
export function McpServersSection({ reloadToken = 0, onChanged }: {
  reloadToken?: number;
  onChanged?: (servers: McpServer[]) => void;
}) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<McpServer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewTools, setViewTools] = useState<McpServer | null>(null);

  // form
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"sse" | "http">("http");
  const [url, setUrl] = useState("");
  const [auth, setAuth] = useState<keyof typeof AUTH_PRESETS>("none");
  const [headers, setHeaders] = useState<HeaderRow[]>([]);

  async function load() {
    const data = await apiGet<McpServer[]>("/admin/settings/mcp");
    setServers(data);
    setLoaded(true);
    onChanged?.(data);
  }
  useEffect(() => { load(); }, [reloadToken]);

  function openAdd() {
    setEditing(null);
    setName(""); setTransport("http"); setUrl(""); setAuth("none"); setHeaders([]);
    setOpen(true);
  }
  function openEdit(s: McpServer) {
    setEditing(s);
    setName(s.name); setTransport(s.transport); setUrl(s.url); setAuth("custom");
    setHeaders(s.headers.map((h: McpHeader) => ({
      name: h.name, is_secret: h.is_secret, value: "", value_hint: h.value_hint,
    })));
    setOpen(true);
  }

  async function save() {
    if (!name.trim() || !url.trim()) { toast.error("Name and URL are required."); return; }
    setSaving(true);
    const payload = {
      name, transport, url,
      headers: headers.filter((h) => h.name.trim())
        .map((h) => ({ name: h.name.trim(), is_secret: h.is_secret, value: h.value || null })),
    };
    const req = editing
      ? apiPut(`/admin/settings/mcp/${editing.id}`, payload)
      : apiPost("/admin/settings/mcp", payload);
    const r = await withToast(() => req, {
      success: editing ? "MCP server saved. Run Test to verify." : "MCP server added. Run Test to verify.",
      error: "Save failed",
    });
    setSaving(false);
    if (r) { setOpen(false); load(); }
  }

  async function test(s: McpServer) {
    setTestingId(s.id);
    try {
      const r = await apiPost<McpServer>(`/admin/settings/mcp/${s.id}/test`);
      if (r.status === "connected") toast.success(`Connected. ${r.tools.length} tool(s) found.`);
      else toast.error(`Connection ${r.status}${r.last_error ? `: ${r.last_error}` : ""}`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTestingId(null);
    }
  }

  async function toggle(s: McpServer, v: boolean) {
    await withToast(() => apiPost(`/admin/settings/mcp/${s.id}/toggle`, { is_enabled: v }), { error: "Update failed" });
    load();
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const r = await withToast(() => apiDelete(`/admin/settings/mcp/${toDelete.id}`), {
      success: "MCP server deleted.", error: "Delete failed",
    });
    setDeleting(false);
    if (r) { setToDelete(null); load(); }
  }

  function setHeader(i: number, patch: Partial<HeaderRow>) {
    setHeaders((hs) => hs.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));
  }

  return (
    <Card className="mt-6 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">MCP servers</h2>
          <p className="text-sm text-slate-500">
            Connect external MCP tool servers (SSE/HTTP). Test each to confirm it's reachable and list
            its tools. Grant tools to users under Admin → Users.
          </p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4" /> Add MCP server</Button>
      </div>

      {!loaded ? (
        <div className="flex items-center gap-2 p-4 text-slate-500"><Spinner /> Loading…</div>
      ) : servers.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-400">No MCP servers yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="py-2">Name</th><th>Transport</th><th>URL</th><th>Status</th><th>Enabled</th><th></th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 transition hover:bg-slate-50">
                  <td className="py-2">
                    <p className="font-medium">{s.name}</p>
                    <p className="font-mono text-xs text-slate-400">{s.slug}</p>
                  </td>
                  <td className="uppercase text-xs text-slate-500">{s.transport}</td>
                  <td className="max-w-[220px] truncate text-slate-500">{s.url}</td>
                  <td><ConnBadge status={s.status} /></td>
                  <td><Toggle checked={s.is_enabled} onChange={(v) => toggle(s, v)} /></td>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <button title="Test connection" className="text-slate-400 hover:text-emerald-600 disabled:opacity-50"
                        disabled={testingId !== null} onClick={() => test(s)}>
                        {testingId === s.id ? <Spinner /> : <Plug className="h-4 w-4" />}
                      </button>
                      <button title="View tools" className="text-slate-400 hover:text-brand-600 disabled:opacity-40"
                        disabled={s.tools.length === 0} onClick={() => setViewTools(s)}>
                        <span className="flex items-center gap-0.5"><ListTree className="h-4 w-4" /><span className="text-xs">{s.tools.length}</span></span>
                      </button>
                      <button title="Edit" className="text-slate-400 hover:text-brand-600" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></button>
                      <button title="Delete" className="text-slate-400 hover:text-red-600" onClick={() => setToDelete(s)}><Trash2 className="h-4 w-4" /></button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / edit modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit MCP server" : "Add MCP server"}>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Linear" />
            <p className="mt-1 text-xs text-slate-400">
              Server key: <span className="font-mono">{editing ? editing.slug : slugPreview(name)}</span>
              {!editing && " (fixed after creation)"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Transport</Label>
              <Select value={transport} onChange={(e) => setTransport(e.target.value as "sse" | "http")}>
                <option value="http">HTTP</option>
                <option value="sse">SSE</option>
              </Select>
            </div>
            <div>
              <Label>Auth preset</Label>
              <Select value={auth} onChange={(e) => {
                const v = e.target.value as keyof typeof AUTH_PRESETS;
                setAuth(v);
                if (v !== "custom") setHeaders(AUTH_PRESETS[v].map((h) => ({ ...h })));
              }}>
                <option value="none">None</option>
                <option value="api_key">API key header</option>
                <option value="bearer">Bearer token</option>
                <option value="custom">Custom</option>
              </Select>
            </div>
          </div>
          <div><Label>Server URL</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/sse" /></div>

          <div>
            <Label>Headers</Label>
            <div className="space-y-2">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input className="max-w-[170px]" placeholder="Header name" value={h.name}
                    onChange={(e) => setHeader(i, { name: e.target.value })} />
                  <Input type={h.is_secret ? "password" : "text"}
                    placeholder={h.is_secret && h.value_hint ? `stored: ${h.value_hint} (blank = keep)` : "Value"}
                    value={h.value} onChange={(e) => setHeader(i, { value: e.target.value })} />
                  <label className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                    <input type="checkbox" checked={h.is_secret} onChange={(e) => setHeader(i, { is_secret: e.target.checked })} /> secret
                  </label>
                  <button className="text-slate-400 hover:text-red-600" onClick={() => setHeaders((hs) => hs.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button variant="ghost" onClick={() => setHeaders((hs) => [...hs, { name: "", is_secret: false, value: "" }])}>
              <Plus className="h-4 w-4" /> Add header
            </Button>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? <Spinner /> : editing ? "Save" : "Add"}</Button>
          </div>
        </div>
      </Modal>

      {/* View tools modal */}
      <Modal open={!!viewTools} onClose={() => setViewTools(null)} title={`Tools — ${viewTools?.name}`}>
        {viewTools && viewTools.tools.length === 0 ? (
          <p className="text-sm text-slate-400">No tools discovered. Run a connection test first.</p>
        ) : (
          <div className="space-y-2">
            {viewTools?.tools.map((t) => (
              <div key={t.name} className="rounded-lg border border-slate-100 p-3">
                <p className="font-mono text-sm text-slate-800">{t.name}</p>
                {t.description && <p className="mt-0.5 text-xs text-slate-500">{t.description}</p>}
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this MCP server?"
        message={<>Remove <span className="font-semibold text-slate-800">{toDelete?.name}</span> and revoke its tools from all users? This cannot be undone.</>}
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </Card>
  );
}
