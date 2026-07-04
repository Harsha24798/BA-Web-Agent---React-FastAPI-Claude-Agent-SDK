import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import type { LlmModel } from "../lib/types";
import { Label, Select } from "./ui";

export function ModelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [models, setModels] = useState<LlmModel[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiGet<LlmModel[]>("/models").then((ms) => {
      setModels(ms);
      setLoaded(true);
      if (!value) {
        const def = ms.find((m) => m.is_default) || ms[0];
        if (def) onChange(def.model_id);
      }
    }).catch(() => setLoaded(true));
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
