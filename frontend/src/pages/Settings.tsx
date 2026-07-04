import { useEffect, useState } from "react";
import { CheckCircle2, HelpCircle, Plug, Trash2, XCircle } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api";
import { withToast } from "../lib/toast";
import type { AppSettings } from "../lib/types";
import { Layout } from "../components/Layout";
import { Button, Card, Input, Label, Spinner } from "../components/ui";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string, JSX.Element]> = {
    connected: ["Connected", "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200", <CheckCircle2 className="h-3.5 w-3.5" />],
    failed: ["Failed", "bg-red-100 text-red-700 ring-1 ring-red-200", <XCircle className="h-3.5 w-3.5" />],
    unknown: ["Not tested", "bg-slate-100 text-slate-500 ring-1 ring-slate-200", <HelpCircle className="h-3.5 w-3.5" />],
  };
  const [label, cls, icon] = map[status] || map.unknown;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{icon} {label}</span>;
}

export default function Settings() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [key, setKey] = useState("");
  const [smtp, setSmtp] = useState({ host: "", port: 587, user: "", password: "", from_addr: "" });
  const [busy, setBusy] = useState<string | null>(null);

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

  if (!s) {
    return <Layout><div className="flex items-center gap-2 p-4 text-slate-500"><Spinner /> Loading…</div></Layout>;
  }

  return (
    <Layout>
      <h1 className="mb-5 text-xl font-semibold">Settings</h1>
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
                onClick={() => { if (confirm("Remove the API key? Generation will be blocked until a new key is set.")) run("del-key", () => apiDelete("/admin/settings/anthropic"), "API key removed."); }}>
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
                onClick={() => { if (confirm("Remove the mail server configuration?")) run("del-smtp", () => apiDelete("/admin/settings/smtp"), "Mail server removed."); }}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
}
