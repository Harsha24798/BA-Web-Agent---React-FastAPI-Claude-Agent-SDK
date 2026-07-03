import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { withToast } from "../lib/toast";
import type { PromptVersion } from "../lib/types";
import { Button, Card } from "./ui";
import { MarkdownEditor } from "./MarkdownEditor";

/** Generic admin editor for a versioned Markdown config (master prompt / SRS template). */
export function VersionedEditor({ endpoint, title, help }: { endpoint: string; title: string; help: string }) {
  const [active, setActive] = useState<PromptVersion | null>(null);
  const [history, setHistory] = useState<PromptVersion[]>([]);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await apiGet<{ active: PromptVersion | null; history: PromptVersion[] }>(endpoint);
    setActive(data.active);
    setHistory(data.history);
    setContent(data.active?.content || "");
  }
  useEffect(() => { load(); }, [endpoint]);

  async function save() {
    setBusy(true);
    const r = await withToast(() => apiPost(endpoint, { content }), {
      success: "Saved new version.", error: "Save failed",
    });
    setBusy(false);
    if (r) load();
  }

  async function restore(id: string) {
    const r = await withToast(() => apiPost(`${endpoint}/${id}/restore`), {
      success: "Version restored.", error: "Restore failed",
    });
    if (r) load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <span className="text-xs text-slate-400">Active: v{active?.version_no ?? "—"}</span>
        </div>
        <p className="mb-3 text-sm text-slate-500">{help}</p>
        <MarkdownEditor value={content} onChange={setContent} />
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save new version"}</Button>
        </div>
      </Card>

      <Card className="h-fit p-5">
        <h3 className="mb-3 text-sm font-semibold">Version history</h3>
        <div className="space-y-2">
          {history.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
              <div>
                <p className="text-sm font-medium">v{v.version_no} {v.is_active && <span className="text-xs text-green-600">(active)</span>}</p>
                <p className="text-xs text-slate-400">{new Date(v.updated_at).toLocaleDateString()}</p>
              </div>
              {!v.is_active && (
                <Button variant="ghost" onClick={() => restore(v.id)}>Restore</Button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
