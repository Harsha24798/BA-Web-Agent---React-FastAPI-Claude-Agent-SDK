import { useEffect, useState } from "react";
import { FileCode, Image as ImageIcon, Workflow, X } from "lucide-react";
import { apiBase, apiGet, authHeaders, downloadFile } from "../lib/api";
import { toast } from "../lib/toast";
import type { SrsDiagram } from "../lib/types";
import { Spinner } from "./ui";

let RENDER_SEQ = 0; // unique element ids for mermaid.render across re-renders

function svgSize(svg: string): [number, number] {
  const vb = svg.match(/viewBox="([\d.\s-]+)"/);
  if (vb) {
    const p = vb[1].trim().split(/\s+/).map(Number);
    if (p.length === 4 && p[2] > 0 && p[3] > 0) return [p[2], p[3]];
  }
  const w = svg.match(/width="(\d+(?:\.\d+)?)/);
  const h = svg.match(/height="(\d+(?:\.\d+)?)/);
  return [w ? Number(w[1]) : 1200, h ? Number(h[1]) : 800];
}

async function svgToPng(svg: string): Promise<Blob> {
  const [w, h] = svgSize(svg);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b as Blob), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function triggerBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Full-diagram popup: lazy-renders the Mermaid and offers .mmd / .svg / .png downloads. */
function DiagramModal({ projectId, versionNo, diagram, onClose }: {
  projectId: string; versionNo: number; diagram: SrsDiagram; onClose: () => void;
}) {
  const [st, setSt] = useState<{ svg?: string; source?: string; error?: string }>({});
  const [dl, setDl] = useState<string | null>(null); // which download button is busy

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let source = "";
      try {
        const res = await fetch(
          `${apiBase}/projects/${projectId}/versions/${versionNo}/diagrams/${encodeURIComponent(diagram.id)}`,
          { headers: { ...authHeaders() } });
        if (!res.ok) throw new Error("source fetch failed");
        source = await res.text();
      } catch {
        if (!cancelled) setSt({ error: "Could not load diagram source" });
        return;
      }
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: "default" });
        const { svg } = await mermaid.render(`mmd-${RENDER_SEQ++}`, source);
        if (!cancelled) setSt({ svg, source });
      } catch (e: any) {
        if (!cancelled) setSt({ source, error: e?.message || "Render failed" });
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, versionNo, diagram.id]);

  async function run(key: string, fn: () => void | Promise<void>) {
    if (dl) return; // one download at a time — guard double-clicks
    setDl(key);
    try { await fn(); } catch (e: any) { toast.error(e?.message || "Download failed"); }
    finally { setDl(null); }
  }
  const dlMmd = () => run("mmd", () =>
    downloadFile(`/projects/${projectId}/versions/${versionNo}/diagrams/${encodeURIComponent(diagram.id)}`, `${diagram.id}.mmd`));
  const dlSvg = () => run("svg", () => {
    if (!st.svg) { toast.error("Not rendered yet."); return; }
    triggerBlob(new Blob([st.svg], { type: "image/svg+xml;charset=utf-8" }), `${diagram.id}.svg`);
  });
  const dlPng = () => run("png", async () => {
    if (!st.svg) { toast.error("Not rendered yet."); return; }
    triggerBlob(await svgToPng(st.svg), `${diagram.id}.png`);
  });

  const btn = "flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-800">{diagram.title}</h3>
            <p className="font-mono text-xs text-slate-400">
              {diagram.id}{diagram.type ? ` · ${diagram.type}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button className={btn} title="Download Mermaid source" onClick={dlMmd} disabled={!!dl}>
              {dl === "mmd" ? <Spinner /> : <FileCode className="h-3.5 w-3.5" />} mmd</button>
            <button className={btn} title="Download SVG" onClick={dlSvg} disabled={!st.svg || !!dl}>
              {dl === "svg" ? <Spinner /> : <ImageIcon className="h-3.5 w-3.5" />} svg</button>
            <button className={btn} title="Download PNG" onClick={dlPng} disabled={!st.svg || !!dl}>
              {dl === "png" ? <Spinner /> : <ImageIcon className="h-3.5 w-3.5" />} png</button>
            <button className="ml-1 text-slate-400 hover:text-slate-600" aria-label="Close" onClick={onClose}><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="overflow-auto p-5">
          {diagram.description && <p className="mb-3 text-sm text-slate-500">{diagram.description}</p>}
          {!st.svg && !st.error ? (
            <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner /> Rendering…</div>
          ) : st.svg ? (
            <div className="[&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: st.svg }} />
          ) : (
            <div>
              <p className="mb-1 text-xs text-red-600">Couldn't render ({st.error}). Source below:</p>
              <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{st.source}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact clickable list of a version's diagrams; clicking one opens the full popup. */
export function VersionDiagramList({ projectId, versionNo }: { projectId: string; versionNo: number }) {
  const [diagrams, setDiagrams] = useState<SrsDiagram[] | null>(null);
  const [open, setOpen] = useState<SrsDiagram | null>(null);

  useEffect(() => {
    apiGet<SrsDiagram[]>(`/projects/${projectId}/versions/${versionNo}/diagrams`)
      .then(setDiagrams)
      .catch(() => setDiagrams([]));
  }, [projectId, versionNo]);

  if (!diagrams || diagrams.length === 0) return null;

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        <Workflow className="h-3.5 w-3.5" /> Diagrams ({diagrams.length})
      </p>
      <div className="space-y-0.5">
        {diagrams.map((d) => (
          <button key={d.id} onClick={() => setOpen(d)}
            className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700">
            <span className="truncate">{d.title}</span>
            {d.type && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{d.type}</span>}
          </button>
        ))}
      </div>
      {open && (
        <DiagramModal projectId={projectId} versionNo={versionNo} diagram={open} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
