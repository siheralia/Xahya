"use client";

import { useEffect, useState } from "react";

type MechanicKey = "mazeStealth" | "mazeDetection" | "casinoInfluence";
type Option = { key: string; name: string; kind: string };
const labels: Record<MechanicKey, string> = {
  mazeStealth: "Estadística de sigilo",
  mazeDetection: "Estadística de detección",
  casinoInfluence: "Estadística que influye en las tiradas",
};
export default function MechanicStatSettings({ mode }: { mode: "maze" | "casino" }) {
  const [values, setValues] = useState<Record<MechanicKey, string>>({ mazeStealth: "stealth", mazeDetection: "detection", casinoInfluence: "luck" });
  const [options, setOptions] = useState<Option[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/management/stat-mechanics", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo cargar.");
      setValues(data.mechanics);
      setOptions(data.options);
    }).catch((error) => setMessage(error instanceof Error ? error.message : "No se pudo cargar."));
  }, []);
  async function save() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/management/stat-mechanics", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mechanics: values }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo guardar.");
      setMessage("Configuración guardada.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }
  const keys: MechanicKey[] = mode === "maze" ? ["mazeStealth", "mazeDetection"] : ["casinoInfluence"];
  return <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
    <h2 className="text-xl font-semibold">Estadísticas de las mecánicas</h2>
    <p className="mt-2 text-sm text-zinc-400">Selecciona qué estadística utiliza cada mecánica. Los cambios se aplican a futuras acciones; no modifican resultados anteriores.</p>
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {keys.map((key) => <label key={key} className="text-sm text-zinc-300">{labels[key]}
        <select className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3" value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}>
          {options.map((option) => <option key={option.key} value={option.key}>{option.name} ({option.key})</option>)}
        </select>
      </label>)}
    </div>
    <button type="button" disabled={busy || !options.length} onClick={save} className="mt-4 rounded-lg bg-white px-5 py-2 font-medium text-black disabled:opacity-50">{busy ? "Guardando…" : "Guardar estadísticas"}</button>
    {message && <p className="mt-3 text-sm text-zinc-300">{message}</p>}
  </section>;
}
