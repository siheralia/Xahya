"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const stats = [
  { key: "strength", label: "Fuerza", short: "STR" },
  { key: "agility", label: "Agilidad", short: "AGI" },
  { key: "constitution", label: "Constitución", short: "CON" },
  { key: "intelligence", label: "Inteligencia", short: "INT" },
  { key: "wisdom", label: "Sabiduría", short: "WIS" },
  { key: "charisma", label: "Carisma", short: "CHA" },
  { key: "spirit", label: "Espíritu", short: "SPI" },
  { key: "luck", label: "Suerte", short: "LCK" },
] as const;

type StatKey = (typeof stats)[number]["key"];
type Values = Record<StatKey, number>;

const MIN_STAT = 1;

function Radar({ current, projected }: { current: Values; projected: Values }) {
  const center = 150;
  const radius = 105;

  function polygon(values: Values) {
    return stats.map((stat, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / stats.length;
      const r = radius * Math.max(0, values[stat.key] - MIN_STAT) / Math.max(1, 20 - MIN_STAT);
      return (center + Math.cos(angle) * r).toFixed(1) + "," + (center + Math.sin(angle) * r).toFixed(1);
    }).join(" ");
  }

  const axes = stats.map((stat, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / stats.length;
    return {
      label: stat.short,
      x: center + Math.cos(angle) * 124,
      y: center + Math.sin(angle) * 124,
      x2: center + Math.cos(angle) * radius,
      y2: center + Math.sin(angle) * radius,
    };
  });

  return (
    <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-[360px]" aria-label="Comparación de estadísticas">
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <polygon
          key={scale}
          points={stats.map((_, index) => {
            const angle = -Math.PI / 2 + (index * Math.PI * 2) / stats.length;
            const r = radius * scale;
            return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
          }).join(" ")}
          fill="none"
          stroke="rgb(63 63 70)"
          strokeOpacity={0.55}
          strokeWidth="1"
        />
      ))}
      {axes.map((axis) => (
        <g key={axis.label}>
          <line x1={center} y1={center} x2={axis.x2} y2={axis.y2} stroke="rgb(63 63 70)" strokeWidth="1" />
          <text x={axis.x} y={axis.y} textAnchor="middle" dominantBaseline="middle" fill="rgb(161 161 170)" fontSize="11">
            {axis.label}
          </text>
        </g>
      ))}
      <polygon points={polygon(current)} fill="rgb(113 113 122)" fillOpacity="0.08" stroke="rgb(113 113 122)" strokeOpacity="0.65" strokeWidth="2" />
      <polygon points={polygon(projected)} fill="rgb(34 211 238)" fillOpacity="0.18" stroke="rgb(34 211 238)" strokeWidth="2" />
    </svg>
  );
}

export default function LevelUpPage({ params }: { params: Promise<{ id: string }> }) {
  const [characterId, setCharacterId] = useState("");
  const [name, setName] = useState("");
  const [current, setCurrent] = useState<Values | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const [available, setAvailable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    params.then(({ id }) => {
      setCharacterId(id);
      return fetch(`/api/characters/${id}/levelup`);
    }).then(async (response) => {
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo cargar el Level Up.");
      const next = Object.fromEntries(
        stats.map((stat) => [stat.key, Number(data.stats[stat.key])]),
      ) as Values;
      setName(data.character.name);
      setCurrent(next);
      setValues(next);
      setAvailable(Number(data.levelUpPoints));
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "No se pudo cargar el Level Up.");
    }).finally(() => setLoading(false));
  }, [params]);

  const spent = useMemo(() => {
    if (!current || !values) return 0;
    return stats.reduce((total, stat) => total + values[stat.key] - current[stat.key], 0);
  }, [current, values]);

  function updateStat(key: StatKey, value: number) {
    if (!current || !values) return;
    setValues({ ...values, [key]: Math.max(current[key], Math.round(value)) });
  }

  function reset() {
    if (current) setValues({ ...current });
    setError("");
    setSuccess("");
  }

  async function confirm() {
    if (!values || spent <= 0 || spent > available || saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/characters/${characterId}/levelup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stats: values }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo aplicar el Level Up.");

      const next = Object.fromEntries(
        stats.map((stat) => [stat.key, Number(data.updatedStats[stat.key])]),
      ) as Values;
      setCurrent(next);
      setValues(next);
      setAvailable(Number(data.updatedResources.levelUpPoints));
      setSuccess("Level Up aplicado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aplicar el Level Up.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-zinc-950 p-12 text-white"><p className="text-zinc-500">Cargando Level Up...</p></main>;
  }

  if (error && !current) {
    return (
      <main className="min-h-screen bg-zinc-950 p-12 text-white">
        <p className="text-red-400">{error}</p>
        <Link href="/characters" className="mt-4 inline-block text-zinc-300 hover:text-white">← Volver a personajes</Link>
      </main>
    );
  }

  if (!current || !values) return null;

  return (
    <main className="min-h-screen overflow-hidden bg-zinc-950 text-white">
      <div className="relative mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <Link href={`/characters/${characterId}`} className="text-sm text-zinc-500 transition hover:text-cyan-300">← Personaje</Link>

        <header className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-400/80">Level Up</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">{name}</h1>
          <p className="mt-3 max-w-2xl text-zinc-400">Distribuye tus puntos para aumentar permanentemente tus estadísticas base.</p>
        </header>

        {error && <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
        {success && <div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 shadow-2xl shadow-cyan-950/10 backdrop-blur sm:p-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-zinc-500">Puntos disponibles</p>
                <p className="mt-1 text-3xl font-bold text-cyan-300">{available - spent}</p>
              </div>
              <p className="text-right text-xs text-zinc-600">Asignados: {spent}</p>
            </div>

            <div className="mt-8 space-y-5">
              {stats.map((stat) => (
                <div key={stat.key}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label htmlFor={stat.key} className="font-medium">
                      <span className="text-cyan-300">{stat.short}</span>{" "}
                      <span className="text-zinc-300">{stat.label}</span>
                    </label>
                    <output className="min-w-16 text-right text-lg font-semibold">
                      {values[stat.key]}
                      {values[stat.key] !== current[stat.key] && <span className="ml-2 text-sm text-zinc-500">(+{values[stat.key] - current[stat.key]})</span>}
                    </output>
                  </div>
                  <input
                    id={stat.key}
                    type="range"
                    min={current[stat.key]}
                    max={current[stat.key] + available}
                    value={values[stat.key]}
                    onChange={(event) => updateStat(stat.key, Number(event.target.value))}
                    className="w-full accent-cyan-400"
                  />
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={reset} className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800">Reiniciar</button>
              <button type="button" onClick={confirm} disabled={spent <= 0 || spent > available || saving} className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-30">
                {saving ? "Aplicando..." : "Confirmar Level Up"}
              </button>
            </div>
          </section>

          <aside className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 shadow-2xl shadow-purple-950/10 backdrop-blur sm:p-7">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-zinc-600">Comparación</p>
                <h2 className="mt-1 text-xl font-semibold">Actual → Proyectado</h2>
              </div>
              <span className="rounded-full border border-cyan-400/20 px-3 py-1 text-xs text-cyan-300">{spent} gastados</span>
            </div>

            <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
              <Radar current={current} projected={values} />
            </div>

            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
              <span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-zinc-500/70" />Actual</span>
              <span><span className="mr-2 inline-block h-2 w-2 rounded-full bg-cyan-400" />Proyectado</span>
            </div>

            <p className="mt-5 text-sm leading-6 text-zinc-500">
              La figura gris representa tus estadísticas actuales. La figura cian muestra cómo quedarían después de gastar los puntos.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
