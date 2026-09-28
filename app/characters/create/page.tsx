"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

const INITIAL_POINTS = 40;
const MIN_STAT = 1;
const MAX_STAT = INITIAL_POINTS;

const suggestedNames = [
  "Ariana Lailas",
  "Lyra Vesper",
  "Kael Ardent",
  "Seraphine Vale",
  "Noelle Astris",
  "Darian Crowe",
  "Elara Veyne",
  "Lucien Aster",
  "Mira Solenne",
  "Ren Valerius",
];

function getRandomSuggestedName() {
  return suggestedNames[Math.floor(Math.random() * suggestedNames.length)];
}

function Radar({ values }: { values: Record<StatKey, number> }) {
  const center = 150;
  const radius = 105;

  const points = stats
    .map((stat, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / stats.length;
      const value = values[stat.key];
      const r = radius * ((value - MIN_STAT) / (MAX_STAT - MIN_STAT));
      return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r };
    })
    .map((point) => point.x.toFixed(1) + "," + point.y.toFixed(1))
    .join(" ");

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
    <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-[360px]" aria-label="Radar de estadísticas base">
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <polygon
          key={scale}
          points={stats
            .map((_, index) => {
              const angle = -Math.PI / 2 + (index * Math.PI * 2) / stats.length;
              const r = radius * scale;
              return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
            })
            .join(" ")}
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
      <polygon points={points} fill="rgb(34 211 238)" fillOpacity="0.16" stroke="rgb(34 211 238)" strokeWidth="2" />
    </svg>
  );
}

export default function CreateCharacterPage() {
  const router = useRouter();
  const [name, setName] = useState(() => getRandomSuggestedName());
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<StatKey, number>>(
    Object.fromEntries(stats.map((stat) => [stat.key, MIN_STAT])) as Record<StatKey, number>,
  );

  const usedPoints = useMemo(
    () => Object.values(values).reduce((sum, value) => sum + value, 0) - stats.length * MIN_STAT,
    [values],
  );

  const remaining = INITIAL_POINTS - usedPoints;

  function updateStat(key: StatKey, value: number) {
    setValues((current) => {
      const requested = Math.max(MIN_STAT, Math.min(MAX_STAT, Math.round(value)));
      const delta = requested - current[key];

      if (delta <= 0) {
        return { ...current, [key]: requested };
      }

      const available = INITIAL_POINTS - (
        Object.values(current).reduce((sum, statValue) => sum + statValue, 0) -
        stats.length * MIN_STAT
      );

      const increase = Math.min(delta, available);
      return { ...current, [key]: current[key] + increase };
    });
  }

  function randomize() {
    let remainingPoints = INITIAL_POINTS;
    const next = Object.fromEntries(stats.map((stat) => [stat.key, MIN_STAT])) as Record<StatKey, number>;

    while (remainingPoints > 0) {
      const key = stats[Math.floor(Math.random() * stats.length)].key;
      if (next[key] < MAX_STAT) {
        next[key] += 1;
        remainingPoints -= 1;
      }
    }

    setValues(next);
  }

  function reset() {
    setName(getRandomSuggestedName());
    setValues(Object.fromEntries(stats.map((stat) => [stat.key, MIN_STAT])) as Record<StatKey, number>);
  }

  const canCreate = name.trim().length > 0 && remaining === 0 && !isCreating;

  async function createCharacter() {
    if (!canCreate) return;

    setIsCreating(true);
    setError("");

    try {
      const response = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), stats: values }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "No se pudo crear el personaje.");
      }

      const character = await response.json();
      router.push(`/characters/${character.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo crear el personaje.");
      setIsCreating(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-zinc-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(34,211,238,0.10),transparent_30%),radial-gradient(circle_at_82%_78%,rgba(168,85,247,0.10),transparent_30%)]" />

      <div className="relative mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <Link href="/" className="text-sm text-zinc-500 transition hover:text-cyan-300">← Xahya</Link>

        <header className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-400/80">Character Builder</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Crear personaje</h1>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Distribuye tus puntos iniciales entre las ocho estadísticas base.
          </p>
        </header>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 shadow-2xl shadow-cyan-950/10 backdrop-blur sm:p-7">
            <label className="block text-sm font-medium text-zinc-300" htmlFor="name">Nombre del personaje</label>
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Ariana Lailas"
              className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950/70 px-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-400"
            />

            <div className="mt-8 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-zinc-500">Puntos disponibles</p>
                <p className="mt-1 text-3xl font-bold text-cyan-300">{remaining}</p>
              </div>
              <p className="text-right text-xs text-zinc-600">{INITIAL_POINTS} puntos para repartir</p>
            </div>

            <div className="mt-6 space-y-5">
              {stats.map((stat) => (
                <div key={stat.key}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label htmlFor={stat.key} className="font-medium">
                      <span className="text-cyan-300">{stat.short}</span>{" "}
                      <span className="text-zinc-300">{stat.label}</span>
                    </label>
                    <output className="min-w-10 text-right text-lg font-semibold">{values[stat.key]}</output>
                  </div>
                  <input
                    id={stat.key}
                    type="range"
                    min={MIN_STAT}
                    max={MAX_STAT}
                    value={values[stat.key]}
                    onChange={(event) => updateStat(stat.key, Number(event.target.value))}
                    className="w-full accent-cyan-400"
                  />
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={randomize} className="rounded-xl border border-cyan-400/40 px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-400/10">Aleatorio</button>
              <button type="button" onClick={reset} className="rounded-xl border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800">Reiniciar</button>
            </div>
          </section>

          <aside className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 shadow-2xl shadow-purple-950/10 backdrop-blur sm:p-7">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-zinc-600">Base stats</p>
                <h2 className="mt-1 text-xl font-semibold">Distribución</h2>
              </div>
              <span className="rounded-full border border-cyan-400/20 px-3 py-1 text-xs text-cyan-300">{usedPoints}/{INITIAL_POINTS}</span>
            </div>

            <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
              <Radar values={values} />
            </div>

            <p className="mt-5 text-sm leading-6 text-zinc-500">
              Esta vista representa únicamente la distribución de estadísticas base.
              Las estadísticas derivadas se mostrarán después de crear el personaje.
            </p>

            <button type="button" onClick={createCharacter} disabled={!canCreate} className="mt-6 w-full rounded-xl bg-cyan-400 px-5 py-3.5 font-bold text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-30">
              {isCreating ? "Creando..." : "Crear personaje"}
            </button>

            {!name.trim() && <p className="mt-3 text-center text-xs text-zinc-600">Escribe un nombre para continuar.</p>}
            {name.trim() && remaining !== 0 && (
              <p className="mt-3 text-center text-xs text-zinc-600">
                {remaining > 0 ? `Aún quedan ${remaining} puntos por repartir.` : "Has superado el límite de puntos."}
              </p>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
