"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Character = {
  id: number;
  name: string;
  stats: {
    strength: number;
    agility: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
    spirit: number;
    luck: number;
  } | null;
  resources: {
    karma: number;
    money: number;
    levelUpPoints: number;
  } | null;
  derivedStats: Record<string, number> | null;
  canSeeCharacterId: boolean;
  canManageCharacter: boolean;
  canLevelUp: boolean;
};

const statLabels: Record<string, string> = {
  strength: "Fuerza",
  agility: "Agilidad",
  constitution: "Constitución",
  intelligence: "Inteligencia",
  wisdom: "Sabiduría",
  charisma: "Carisma",
  spirit: "Espíritu",
  luck: "Suerte",
};


const radarStats = [
  { key: "strength", short: "STR" },
  { key: "agility", short: "AGI" },
  { key: "constitution", short: "CON" },
  { key: "intelligence", short: "INT" },
  { key: "wisdom", short: "WIS" },
  { key: "charisma", short: "CHA" },
  { key: "spirit", short: "SPI" },
  { key: "luck", short: "LCK" },
] as const;

type RadarValues = Record<(typeof radarStats)[number]["key"], number>;

function StatsRadar({ values, name }: { values: RadarValues; name: string }) {
  const center = 150;
  const radius = 105;
  const maxValue = Math.max(20, ...Object.values(values));

  const polygon = radarStats.map((stat, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / radarStats.length;
    const r = radius * Math.max(0, values[stat.key]) / maxValue;
    return (center + Math.cos(angle) * r).toFixed(1) + "," + (center + Math.sin(angle) * r).toFixed(1);
  }).join(" ");

  return (
    <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-[360px]" aria-label="Polígono de estadísticas base">
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <polygon
          key={scale}
          points={radarStats.map((_, index) => {
            const angle = -Math.PI / 2 + (index * Math.PI * 2) / radarStats.length;
            const r = radius * scale;
            return (center + Math.cos(angle) * r) + "," + (center + Math.sin(angle) * r);
          }).join(" ")}
          fill="none"
          stroke="rgb(63 63 70)"
          strokeOpacity={0.55}
          strokeWidth="1"
        />
      ))}
      {radarStats.map((stat, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI * 2) / radarStats.length;
        const x = center + Math.cos(angle) * 124;
        const y = center + Math.sin(angle) * 124;
        const x2 = center + Math.cos(angle) * radius;
        const y2 = center + Math.sin(angle) * radius;
        return (
          <g key={stat.key}>
            <line x1={center} y1={center} x2={x2} y2={y2} stroke="rgb(63 63 70)" strokeWidth="1" />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill="rgb(161 161 170)" fontSize="11">
              {stat.short}
            </text>
          </g>
        );
      })}
      <polygon points={polygon} fill="rgb(34 211 238)" fillOpacity="0.16" stroke="rgb(34 211 238)" strokeWidth="2" />
    </svg>
  );
}

const derivedLabels: Record<string, string> = {
  maxHp: "HP Máx.",
  maxMana: "Mana Máx.",
  physicalAttack: "Ataque físico",
  magicAttack: "Ataque mágico",
  physicalDefense: "Defensa física",
  magicDefense: "Defensa mágica",
  precision: "Precisión",
  critical: "Crítico",
  discovery: "Hallazgo",
  miracle: "Suceso milagroso",
  intimidation: "Intimidación",
  conquest: "Conquista",
  race: "Carrera",
  dodge: "Esquive",
  stealth: "Sigilo",
  detection: "Detección",
};

export default function CharacterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const radarValues = character?.stats
    ? radarStats.reduce((result, stat) => {
        result[stat.key] = character.stats?.[stat.key] ?? 0;
        return result;
      }, {} as RadarValues)
    : null;

  function buildWhatsAppText(character: Character) {
    const lines = [
      "*" + character.name + "*",
      character.canSeeCharacterId ? "_Personaje #" + character.id + "_" : "",
      "",
      "*ESTADÍSTICAS BASE*",
      character.stats
        ? Object.entries(statLabels).map(([key, label]) =>
            "• " + label + ": " + character.stats?.[key as keyof typeof character.stats]
          ).join("\n")
        : "",
      "",
      "*ESTADÍSTICAS DERIVADAS*",
      character.derivedStats
        ? Object.entries(character.derivedStats).map(([key, value]) =>
            "• " + (derivedLabels[key] ?? key) + ": " + value
          ).join("\n")
        : "",
      "",
      "*RECURSOS*",
      character.resources
        ? "• Karma: " + character.resources.karma + "\n• Dinero: " + character.resources.money
        : "",
    ];
    return lines.join("\n");
  }

  async function copyToClipboard() {
    if (!character) return;
    try {
      await navigator.clipboard.writeText(buildWhatsAppText(character));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar la ficha al portapapeles.");
    }
  }

  useEffect(() => {
    params
      .then(({ id }) => fetch(`/api/characters/${id}`))
      .then((response) => {
        if (!response.ok) {
          throw new Error();
        }

        return response.json();
      })
      .then(setCharacter)
      .catch(() => setError("No se pudo cargar el personaje."))
      .finally(() => setLoading(false));
  }, [params]);

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 p-12 text-white">
        <p className="text-zinc-500">Cargando personaje...</p>
      </main>
    );
  }

  if (error || !character) {
    return (
      <main className="min-h-screen bg-zinc-950 p-12 text-white">
        <p className="text-red-400">{error || "Personaje no encontrado."}</p>
        <Link href="/characters" className="mt-4 inline-block text-zinc-300 hover:text-white">
          ← Volver a personajes
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <Link href="/characters" className="text-sm text-zinc-500 hover:text-white">
          ← Personajes
        </Link>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <h1 className="w-full text-4xl font-bold">{character.name}</h1>
          {character.canLevelUp && (
            <Link
              href={"/characters/" + character.id + "/levelup"}
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300"
            >
              Level Up
            </Link>
          )}
          {character.canManageCharacter && (
            <Link
              href={"/management?characterId=" + character.id}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
            >
              Gestionar personaje
            </Link>
          )}
          <button
            type="button"
            onClick={copyToClipboard}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
          >
            {copied ? "✓ Copiado" : "Copiar para WhatsApp"}
          </button>
        </div>
        {character.canSeeCharacterId && (
          <p className="mt-2 text-zinc-500">Personaje #{character.id}</p>
        )}

        {character.stats && radarValues && (
          <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.85fr] lg:items-center">
            <div>
              <h2 className="text-xl font-semibold">Estadísticas base</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
                {Object.entries(statLabels).map(([key, label]) => (
                  <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <p className="text-sm text-zinc-500">{label}</p>
                    <p className="mt-1 text-2xl font-semibold">
                      {character.stats?.[key as keyof typeof character.stats]}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 pb-12">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-600">Perfil</p>
                <h3 className="text-lg font-semibold text-right">Distribución de estadísticas</h3>
              </div>
              <div className="mt-3">
                <StatsRadar values={radarValues} name={character.name} />
              </div>
              <div className="absolute bottom-3 left-5 right-5 flex items-center justify-between gap-4">
                <p
                  className="text-xl font-semibold italic text-white"
                  style={{ fontFamily: '"Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive' }}
                >
                  {character.name}
                </p>
                <p className="text-base font-semibold text-zinc-300">
                  🪷 {character.resources?.karma?.toLocaleString("en-US") ?? 0}
                </p>
              </div>
            </div>
          </section>
        )}

        {character.derivedStats && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">Estadísticas derivadas</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(character.derivedStats).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <p className="text-sm text-zinc-500">{derivedLabels[key] ?? key}</p>
                  <p className="mt-1 text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {character.resources && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">Recursos</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-sm text-zinc-500">Karma</p>
                <p className="mt-1 text-2xl font-semibold">{character.resources.karma}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-sm text-zinc-500">Dinero</p>
                <p className="mt-1 text-2xl font-semibold">{character.resources.money}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-sm text-zinc-500">Puntos de Level Up</p>
                <p className="mt-1 text-2xl font-semibold">{character.resources.levelUpPoints}</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
