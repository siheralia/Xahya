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

  function exportProfileCard() {
    if (!character?.stats) return;

    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = 720;
    const height = 760;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(scale, scale);

    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#27272a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1, 1, width - 2, height - 2, 22);
    ctx.stroke();

    ctx.fillStyle = "#52525b";
    ctx.font = "600 12px Arial, sans-serif";
    ctx.letterSpacing = "3px";
    ctx.fillText("PERFIL", 28, 38);

    ctx.fillStyle = "#ffffff";
    ctx.font = "600 22px Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Distribución de estadísticas", width - 28, 38);
    ctx.textAlign = "center";

    const centerX = width / 2;
    const centerY = 365;
    const radius = 245;
    const maxValue = Math.max(20, ...Object.values(character.stats));

    const point = (index: number, value: number) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / radarStats.length;
      const r = radius * value / maxValue;
      return {
        x: centerX + Math.cos(angle) * r,
        y: centerY + Math.sin(angle) * r,
      };
    };

    for (const gridScale of [0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      radarStats.forEach((_, index) => {
        const p = point(index, maxValue * gridScale);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.strokeStyle = "rgba(63,63,70,0.65)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    radarStats.forEach((stat, index) => {
      const outer = point(index, maxValue);
      const label = point(index, maxValue * 1.13);

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(outer.x, outer.y);
      ctx.strokeStyle = "rgba(63,63,70,0.65)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#a1a1aa";
      ctx.font = "11px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(stat.short, label.x, label.y);
    });

    ctx.beginPath();
    radarStats.forEach((stat, index) => {
      const value = character.stats?.[stat.key] ?? 0;
      const p = point(index, value);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(34,211,238,0.16)";
    ctx.fill();
    ctx.strokeStyle = "rgb(34,211,238)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#ffffff";
    ctx.font = '600 28px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive';
    ctx.fillText(character.name, 28, height - 28);

    ctx.textAlign = "right";
    ctx.font = "600 20px Arial, sans-serif";
    ctx.fillStyle = "#d4d4d8";
    const karmaText = character.resources?.karma?.toLocaleString("en-US") ?? "0";
    ctx.fillText(`🪷 ${karmaText}`, width - 28, height - 30);

    const link = document.createElement("a");
    link.download = character.name.replace(/[^a-z0-9-_]+/gi, "_") + "-perfil.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/characters" className="text-sm text-zinc-500 hover:text-white">
            ← Personajes
          </Link>
          <Link
            href={"/casino?characterId=" + character.id}
            className="rounded-lg border border-amber-500/40 px-4 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-400/10"
          >
            🎰 Casino
          </Link>
        </div>

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
          <button
            type="button"
            onClick={exportProfileCard}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
          >
            Exportar imagen
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
