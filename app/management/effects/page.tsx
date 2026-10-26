"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Target = { key: string; label: string };
type EffectDefinition = { type: string; label: string; mode: string; targets: Target[] };
type Statistic = { key: string; code?: string; name: string; kind: string };

const modes: Record<string, string> = {
  bonus: "Suma fija", multiplier: "Multiplicador", text: "Narrativo", special: "Especial",
};

export default function EffectsManagementPage() {
  const [effects, setEffects] = useState<EffectDefinition[]>([]);
  const [statistics, setStatistics] = useState<Statistic[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/management/effect-targets", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("No tienes acceso a la gestión de efectos.");
        return response.json();
      })
      .then((data) => {
        setEffects(Array.isArray(data.effects) ? data.effects : []);
        setStatistics(Array.isArray(data.statistics) ? data.statistics : []);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudieron cargar los efectos."))
      .finally(() => setLoading(false));
  }, []);

  const visible = effects.filter((effect) => (effect.label + " " + effect.type + " " + effect.mode).toLowerCase().includes(search.toLowerCase()));
  const active = effects.find((effect) => effect.type === selected);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-white">
      <div className="space-y-2">
        <Link href="/management" className="text-sm text-cyan-300 hover:underline">← Administración</Link>
        <h1 className="text-3xl font-bold">Gestión de efectos</h1>
        <p className="text-sm text-zinc-400">Catálogo central de tipos, operaciones y objetivos para habilidades, perks y objetos. Esta vista es de consulta: las reglas se mantienen en el catálogo del sistema.</p>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-800 p-3 text-red-300">{error}</p>}
      {loading ? <p className="text-zinc-400">Cargando efectos…</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-2xl font-bold">{effects.length}</div><div className="text-sm text-zinc-400">Tipos de efectos</div></div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-2xl font-bold">{statistics.length}</div><div className="text-sm text-zinc-400">Estadísticas activas</div></div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-2xl font-bold">{effects.filter((effect) => effect.targets.length > 0).length}</div><div className="text-sm text-zinc-400">Tipos con objetivos</div></div>
          </div>
          <label className="block text-sm text-zinc-300">Buscar efecto
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tipo, nombre o cálculo" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" />
          </label>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              {visible.map((effect) => <button key={effect.type} type="button" onClick={() => setSelected(effect.type)} className={"w-full rounded-xl border p-4 text-left " + (selected === effect.type ? "border-cyan-400 bg-zinc-800" : "border-zinc-800 bg-zinc-900 hover:border-zinc-600")}>
                <div className="font-semibold">{effect.label}</div>
                <div className="mt-1 text-xs text-zinc-400">{effect.type} · {modes[effect.mode] ?? effect.mode}</div>
              </button>)}
              {!visible.length && <p className="text-zinc-400">No hay efectos coincidentes.</p>}
            </div>
            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              {active ? <>
                <h2 className="text-xl font-semibold">{active.label}</h2>
                <p className="mt-2 text-sm text-zinc-400">Código: <code>{active.type}</code></p>
                <p className="mt-1 text-sm text-zinc-400">Operación: {modes[active.mode] ?? active.mode}</p>
                <h3 className="mt-5 font-semibold">Objetivos permitidos ({active.targets.length})</h3>
                {active.targets.length ? <div className="mt-3 flex flex-wrap gap-2">{active.targets.map((target) => <span key={target.key} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">{target.label} <code className="text-xs text-zinc-500">{target.key}</code></span>)}</div> : <p className="mt-2 text-sm text-zinc-400">No requiere seleccionar un objetivo.</p>}
              </> : <p className="text-zinc-400">Selecciona un efecto para revisar sus reglas.</p>}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
