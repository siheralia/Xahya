"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Segment = {
  label: string;
  weight: number;
  multiplier: number;
  color: string;
};

type CasinoSet = {
  id: string;
  name: string;
  description: string;
  houseEdgeLabel: string;
  expectedReturn: number;
  segments: Segment[];
};

function formatPercent(value: number) {
  return (value * 100).toFixed(2) + "%";
}

function getWheelBackground(segments: Segment[]) {
  const total = segments.reduce((sum, segment) => sum + segment.weight, 0);
  let start = 0;
  const stops = segments.map((segment) => {
    const end = start + (segment.weight / total) * 360;
    const stop = segment.color + " " + start + "deg " + end + "deg";
    start = end;
    return stop;
  });
  return "conic-gradient(from 0deg, " + stops.join(", ") + ")";
}

export default function CasinoManagementPage() {
  const [sets, setSets] = useState<CasinoSet[]>([]);
  const [activeSetId, setActiveSetId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/management/casino", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudo cargar la gestión del casino.");
      setSets(data.sets ?? []);
      setActiveSetId(data.activeSetId ?? "");
      setSelectedId(data.activeSetId ?? data.sets?.[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la gestión del casino.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const selected = useMemo(
    () => sets.find((set) => set.id === selectedId) ?? null,
    [sets, selectedId],
  );

  async function activate() {
    if (!selected || saving || selected.id === activeSetId) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/management/casino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId: selected.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudo cambiar el set.");
      setActiveSetId(data.activeSetId);
      setSuccess("Set "" + selected.name + "" activado. Las siguientes tiradas usarán esta configuración.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el set.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-zinc-950 p-12 text-white"><p className="text-zinc-500">Cargando gestión del casino...</p></main>;
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/management" className="text-sm text-zinc-500 hover:text-white">← Gestión</Link>
            <h1 className="mt-4 text-4xl font-bold">Gestión del casino</h1>
            <p className="mt-2 text-zinc-500">Cambia el conjunto de probabilidades sin tocar el código de la ruleta.</p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Set activo</p>
            <p className="mt-1 font-bold text-amber-300">{sets.find((set) => set.id === activeSetId)?.name ?? activeSetId}</p>
          </div>
        </div>

        {error && <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
        {success && <div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {sets.map((set) => (
            <button
              key={set.id}
              type="button"
              onClick={() => setSelectedId(set.id)}
              className={"rounded-2xl border p-5 text-left transition " + (selectedId === set.id ? "border-amber-400/60 bg-amber-950/15" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">{set.name}</h2>
                  <p className="mt-1 text-sm text-zinc-500">{set.description}</p>
                </div>
                {set.id === activeSetId && <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300">ACTIVO</span>}
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div className="h-20 w-20 shrink-0 rounded-full border-4 border-zinc-800" style={{ background: getWheelBackground(set.segments) }} />
                <div>
                  <p className="text-sm text-zinc-400">Margen base</p>
                  <p className="text-2xl font-black text-amber-300">{formatPercent(set.expectedReturn)}</p>
                  <p className="mt-1 text-xs text-zinc-600">{set.houseEdgeLabel}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">{selected.name}</h2>
                <p className="mt-1 text-sm text-zinc-500">{selected.description}</p>
              </div>
              <button
                type="button"
                onClick={activate}
                disabled={saving || selected.id === activeSetId}
                className="rounded-xl bg-amber-400 px-5 py-3 font-bold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {selected.id === activeSetId ? "Set activo" : saving ? "Activando..." : "Activar este set"}
              </button>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-600">
                  <tr>
                    <th className="px-3 py-3">Segmento</th>
                    <th className="px-3 py-3">Peso</th>
                    <th className="px-3 py-3">Multiplicador</th>
                    <th className="px-3 py-3">Color</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.segments.map((segment, index) => (
                    <tr key={index} className="border-b border-zinc-900">
                      <td className="px-3 py-3 font-bold"><span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: segment.color }} />{segment.label}</td>
                      <td className="px-3 py-3 text-zinc-300">{segment.weight}</td>
                      <td className={"px-3 py-3 font-semibold " + (segment.multiplier < 0 ? "text-red-300" : "text-emerald-300")}>{segment.multiplier > 0 ? "+" : ""}{segment.multiplier}×</td>
                      <td className="px-3 py-3 font-mono text-xs text-zinc-500">{segment.color}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-5 text-xs text-zinc-600">
              El margen mostrado es el rendimiento esperado de la ruleta antes del ajuste de Suerte. La Suerte sigue modificando los pesos durante cada tirada.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
