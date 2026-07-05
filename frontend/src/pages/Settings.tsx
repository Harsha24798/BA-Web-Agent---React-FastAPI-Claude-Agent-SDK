import { useEffect, useState } from "react";
import { Plug, RefreshCw, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api";
import { toast, withToast } from "../lib/toast";
import type { AppSettings, McpServer } from "../lib/types";
import { Layout } from "../components/Layout";
import { Button, Card, ConfirmDialog, ConnBadge as StatusBadge, Input, Label, Spinner } from "../components/ui";
import { McpServersSection } from "../components/McpServersSection";

export default function Settings() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [key, setKey] = useState("");
  const [smtp, setSmtp] = useState({ host: "", port: 587, user: "", password: "", from_addr: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<null | "key" | "smtp">(null);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpReload, setMcpReload] = useState(0);

  async function load() {
    const data = await apiGet<AppSettings>("/admin/settings");
    setS(data);
    setSmtp({ host: data.smtp_host, port: data.smtp_port, user: data.smtp_user, password: "", from_addr: data.smtp_from });
  }
  useEffect(() => { load(); }, []);

  async function run(k: string, fn: () => Promise<any>, ok?: string) {
    setBusy(k);
    const r = await withToast(fn, ok ? { success: ok } : {});
    setBusy(null);
    if (r) setS(r);
    return r;
  }

  async function checkAll() {
    setBusy("check-all");
    try {
      const r = await apiPost<{ settings: AppSettings; mcp: McpServer[] }>("/admin/settings/check-all");
      setS(r.settings);
      setMcpServers(r.mcp);
      setMcpReload((x) => x + 1);
      toast.success("Connection check complete.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!s) {
    return <Layout><div className="flex items-center gap-2 p-4 text-slate-500"><Spinner /> Loading…</div></Layout>;
  }

  const mcpConnected = mcpServers.filter((m) => m.status === "connected").length;

  return (
    <Layout>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Settings</h1>
        <Button variant="secondary" onClick={checkAll} disabled={busy !== null}>
          {busy === "check-all" ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Check all connections
        </Button>
      </div>

      {/* Connection health strip */}
      <Card className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
        <span className="flex items-center gap-2 text-sm text-slate-600">API key <StatusBadge status={s.anthropic_status} /></span>
        <span className="flex items-center gap-2 text-sm text-slate-600">
          Mail {s.smtp_host ? <StatusBadge status={s.smtp_status} /> : <span className="text-xs text-slate-400">not configured</span>}
        </span>
        <span className="flex items-center gap-2 text-sm text-slate-600">
          MCP <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">{mcpConnected}/{mcpServers.length} connected</span>
        </span>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Anthropic API key */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Anthropic API key</h2>
            <StatusBadge status={s.anthropic_status} />
          </div>
          <p className="mb-3 text-sm text-slate-500">
            Required for generating SRS documents. Stored encrypted. Users can't generate until this is set.
          </p>
          {s.anthropic_key_set && (
            <p className="mb-2 text-xs text-slate-500">Current key: <span className="font-mono">{s.anthropic_key_hint}</span></p>
          )}
          <Label>{s.anthropic_key_set ? "Replace key" : "Set key"}</Label>
          <Input type="password" value={key} placeholder="sk-ant-…" onChange={(e) => setKey(e.target.value)} />
          {s.anthropic_error && s.anthropic_status === "failed" && (
            <p className="mt-2 text-xs text-red-600">{s.anthropic_error}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={!key || busy !== null}
              onClick={async () => { const r = await run("save-key", () => apiPut("/admin/settings/anthropic", { key }), "API key saved."); if (r) setKey(""); }}>
              {busy === "save-key" ? <Spinner /> : "Save key"}
            </Button>
            <Button variant="secondary" disabled={!s.anthropic_key_set || busy !== null}
              onClick={() => run("test-key", () => apiPost("/admin/settings/anthropic/test"))}>
              {busy === "test-key" ? <Spinner /> : <><Plug className="h-4 w-4" /> Test connection</>}
            </Button>
            {s.anthropic_key_set && (
              <Button variant="danger" disabled={busy !== null}
                onClick={() => setConfirming("key")}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
          </div>
        </Card>

        {/* Mail server */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Mail server (SMTP)</h2>
            <StatusBadge status={s.smtp_status} />
          </div>
          <p className="mb-3 text-sm text-slate-500">
            Optional. Used to email approval / set-password links. If unset, links are shown in-app instead.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Host</Label><Input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.gmail.com" /></div>
            <div><Label>Port</Label><Input type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} /></div>
            <div><Label>From address</Label><Input value={smtp.from_addr} onChange={(e) => setSmtp({ ...smtp, from_addr: e.target.value })} placeholder="BA Agent <no-reply@…>" /></div>
            <div><Label>Username</Label><Input value={smtp.user} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} /></div>
            <div><Label>Password</Label><Input type="password" value={smtp.password}
              placeholder={s.smtp_pass_set ? "•••••• (leave blank to keep)" : ""}
              onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} /></div>
          </div>
          {s.smtp_error && s.smtp_status === "failed" && (
            <p className="mt-2 text-xs text-red-600">{s.smtp_error}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={!smtp.host || busy !== null}
              onClick={() => run("save-smtp", () => apiPut("/admin/settings/smtp", smtp), "Mail server saved.")}>
              {busy === "save-smtp" ? <Spinner /> : "Save"}
            </Button>
            <Button variant="secondary" disabled={!s.smtp_host || busy !== null}
              onClick={() => run("test-smtp", () => apiPost("/admin/settings/smtp/test"))}>
              {busy === "test-smtp" ? <Spinner /> : <><Plug className="h-4 w-4" /> Test connection</>}
            </Button>
            {s.smtp_host && (
              <Button variant="danger" disabled={busy !== null}
                onClick={() => setConfirming("smtp")}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
          </div>
        </Card>
      </div>

      <McpServersSection reloadToken={mcpReload} onChanged={setMcpServers} />

      <ConfirmDialog
        open={confirming === "key"}
        title="Remove the API key?"
        message="SRS generation will be blocked for everyone until a new key is set. This cannot be undone."
        confirmLabel="Remove key"
        busy={busy === "del-key"}
        onConfirm={async () => { await run("del-key", () => apiDelete("/admin/settings/anthropic"), "API key removed."); setConfirming(null); }}
        onCancel={() => setConfirming(null)}
      />

      <ConfirmDialog
        open={confirming === "smtp"}
        title="Remove the mail server?"
        message="Approval and set-password links will be shown in-app instead of emailed. This cannot be undone."
        confirmLabel="Remove"
        busy={busy === "del-smtp"}
        onConfirm={async () => { await run("del-smtp", () => apiDelete("/admin/settings/smtp"), "Mail server removed."); setConfirming(null); }}
        onCancel={() => setConfirming(null)}
      />
    </Layout>
  );
}
