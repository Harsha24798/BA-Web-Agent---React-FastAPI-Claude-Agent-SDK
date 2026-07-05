import { useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/api";
import type { LlmModel } from "../lib/types";
import { Label, Select } from "./ui";

const POLL_MS = 30_000;

export function ModelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [models, setModels] = useState<LlmModel[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Keep the latest value/onChange in refs so the effect can run once but always see current props.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    let alive = true;

    async function refresh(initial = false) {
      try {
        const ms = await apiGet<LlmModel[]>("/models");
        if (!alive) return;
        setModels(ms);
        setLoaded(true);
        const cur = valueRef.current;
        if (cur && !ms.some((m) => m.model_id === cur)) {
          // The selected model was disabled/removed by an admin — drop it so the user re-picks.
          onChangeRef.current("");
        } else if (initial && !cur) {
          const def = ms.find((m) => m.is_default) || ms[0];
          if (def) onChangeRef.current(def.model_id);
        }
      } catch {
        if (alive) setLoaded(true);
      }
    }

    refresh(true);
    const interval = setInterval(() => refresh(), POLL_MS);
    const onFocus = () => refresh();
    const onVisible = () => { if (!document.hidden) refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!loaded) {
    return <p className="text-sm text-slate-400">Loading models…</p>;
  }
  if (models.length === 0) {
    return <p className="text-sm text-slate-500">No models available. Ask an admin to enable one.</p>;
  }

  return (
    <div>
      <Label>LLM model</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {!value && <option value="">Select a model…</option>}
        {models.map((m) => (
          <option key={m.model_id} value={m.model_id}>
            {m.display_name}
            {m.is_default ? " (default)" : ""}
          </option>
        ))}
      </Select>
    </div>
  );
}
