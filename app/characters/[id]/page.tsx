"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CharacterSilhouette, getCharacterSilhouetteSvg } from "@/components/CharacterSilhouette";

type Character = {
  id: number;
  name: string;
  age: number | null;
  gender: string | null;
  height: number | null;
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
  effectiveStats: Record<string, number> | null;
  modifiers: { id: number; stat: string; amount: number; source: string; expiresAt?: string | null }[];
  combatEffects: { type: "attack_multiplier_all" | "damage_reduction_all"; value: number; source: string; expiresAt: string | null }[];
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

const genderOptions = [
  { value: "masculino", label: "Masculino" },
  { value: "femenino", label: "Femenino" },
  { value: "indefinido", label: "Indefinido" },
] as const;

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

function StatsRadar({ baseValues, values }: { baseValues: RadarValues; values: RadarValues }) {
  const center = 150;
  const radius = 105;
  const maxValue = Math.max(20, ...Object.values(values));

  const getPoints = (source: RadarValues) =>
    radarStats.map((stat, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / radarStats.length;
      const r = radius * Math.max(0, source[stat.key]) / maxValue;
      return {
        x: center + Math.cos(angle) * r,
        y: center + Math.sin(angle) * r,
      };
    });

  const basePoints = getPoints(baseValues);
  const effectivePoints = getPoints(values);

  const polygonPoints = (points: { x: number; y: number }[]) =>
    points.map((point) => point.x.toFixed(1) + "," + point.y.toFixed(1)).join(" ");

  const hasBoost = radarStats.some((stat) => values[stat.key] > baseValues[stat.key]);

  const boostPath = hasBoost
    ? polygonPoints(effectivePoints) +
      " " +
      polygonPoints([...basePoints].reverse())
    : "";

  return (
    <div>
      <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-[360px]" aria-label="Polígono de estadísticas base y boosts activos">
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

        <polygon points={polygonPoints(basePoints)} fill="rgb(34 211 238)" fillOpacity="0.16" stroke="rgb(34 211 238)" strokeWidth="2" />

        {hasBoost && (
          <polygon points={boostPath} fill="rgb(248 113 113)" fillOpacity="0.38" fillRule="evenodd" stroke="rgb(248 113 113)" strokeOpacity="0.75" strokeWidth="1.5" />
        )}

        {hasBoost && radarStats.map((stat, index) => {
          if (values[stat.key] <= baseValues[stat.key]) return null;
          const base = basePoints[index];
          const boosted = effectivePoints[index];
          return <line key={"boost-" + stat.key} x1={base.x} y1={base.y} x2={boosted.x} y2={boosted.y} stroke="rgb(248 113 113)" strokeWidth="4" strokeLinecap="round" />;
        })}
      </svg>

      {hasBoost && (
        <div className="mt-2 flex items-center justify-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-cyan-400/70" />Base</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400" />Boost</span>
        </div>
      )}
    </div>
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

export default function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [boostStat, setBoostStat] = useState("strength");
  const [boosting, setBoosting] = useState(false);
  const [profileAge, setProfileAge] = useState("");
  const [profileGender, setProfileGender] = useState("");
  const [profileHeight, setProfileHeight] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const radarValues = character?.stats
    ? radarStats.reduce((result, stat) => {
        result[stat.key] = character.effectiveStats?.[stat.key] ?? character.stats?.[stat.key] ?? 0;
        return result;
      }, {} as RadarValues)
    : null;

  const allAttackMultiplier = character?.combatEffects?.filter((effect) => effect.type === "attack_multiplier_all").reduce((multiplier, effect) => multiplier * (effect.value / 100), 1) ?? 1;
  const allDamageMultiplier = character?.combatEffects?.filter((effect) => effect.type === "damage_reduction_all").reduce((multiplier, effect) => multiplier * (effect.value / 100), 1) ?? 1;

  const baseRadarValues = character?.stats
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
        ? Object.entries(statLabels).map(([key, label]) => {
            const base = character.stats?.[key as keyof typeof character.stats] ?? 0;
            const effective = character.effectiveStats?.[key] ?? base;
            const boost = effective - base;
            return "• " + label + ": " + base + (boost > 0 ? " + " + boost + " = " + effective : "");
          }).join("\n")
        : "",
      "",
      "*ESTADÍSTICAS DERIVADAS*",
      character.derivedStats
        ? Object.entries(character.derivedStats).map(([key, value]) => "• " + (derivedLabels[key] ?? key) + ": " + value).join("\n")
        : "",
      "",
      "*RECURSOS*",
      character.resources ? "• Karma: " + character.resources.karma + "\n• Dinero: " + character.resources.money : "",
    ];
    return lines.join("\n");
  }

  async function saveProfile() {
    if (!character || savingProfile) return;
    setSavingProfile(true);
    setError("");
    try {
      const response = await fetch("/api/characters/" + character.id + "/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ age: profileAge, gender: profileGender, height: profileHeight }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar la ficha básica.");
      const refreshed = await fetch("/api/characters/" + character.id);
      if (!refreshed.ok) throw new Error("Los datos se guardaron, pero no se pudo actualizar la ficha.");
      setCharacter(await refreshed.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la ficha básica.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function applyKarmaBoost() {
    if (!character || boosting) return;
    if ((character.resources?.karma ?? 0) < 20) {
      setError("Necesitas 20 de karma para realizar un boost.");
      return;
    }
    setBoosting(true);
    setError("");
    try {
      const response = await fetch("/api/characters/" + character.id + "/boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stat: boostStat }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo aplicar el boost.");
      const refreshed = await fetch("/api/characters/" + character.id);
      if (!refreshed.ok) throw new Error("El boost se aplicó, pero no se pudo actualizar la ficha.");
      setCharacter(await refreshed.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aplicar el boost.");
    } finally {
      setBoosting(false);
    }
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

  async function exportProfileCard() {
    if (!character?.stats) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = 960;
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

    const centerX = 650;
    const centerY = 375;
    const radius = 245;
    const effectiveStats = character.effectiveStats ?? character.stats;
    if (character.age !== null && character.gender !== null) {
      const stage = character.age < 13 ? "niño" : character.age < 18 ? "adolescente" : "adulto";
      const svg = getCharacterSilhouetteSvg({
        gender: String(character.gender).trim().toLowerCase() as "masculino" | "femenino" | "indefinido",
        stage,
        color: "#a1a1aa",
        opacity: 0.14,
      });
      const silhouetteImage = new Image();
      silhouetteImage.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await new Promise<void>((resolve) => {
        silhouetteImage.onload = () => resolve();
        silhouetteImage.onerror = () => resolve();
      });
      if (silhouetteImage.complete && silhouetteImage.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.drawImage(silhouetteImage, centerX - 175, centerY - 235, 350, 455);
        ctx.restore();
      }
    }

    const maxValue = Math.max(20, ...Object.values(effectiveStats));
    const point = (index: number, value: number) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / radarStats.length;
      const r = radius * value / maxValue;
      return { x: centerX + Math.cos(angle) * r, y: centerY + Math.sin(angle) * r };
    };

    for (const gridScale of [0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      radarStats.forEach((_, index) => {
        const p = point(index, maxValue * gridScale);
        if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
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

    const basePoints = radarStats.map((stat, index) => point(index, character.stats?.[stat.key] ?? 0));
    const effectivePoints = radarStats.map((stat, index) => point(index, effectiveStats?.[stat.key] ?? 0));
    const hasBoost = radarStats.some((stat) => (effectiveStats?.[stat.key] ?? 0) > (character.stats?.[stat.key] ?? 0));

    ctx.beginPath();
    basePoints.forEach((p, index) => { if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.closePath();
    ctx.fillStyle = "rgba(34,211,238,0.16)";
    ctx.fill();
    ctx.strokeStyle = "rgb(34,211,238)";
    ctx.lineWidth = 3;
    ctx.stroke();

    if (hasBoost) {
      ctx.beginPath();
      effectivePoints.forEach((p, index) => { if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.closePath();
      ctx.save();
      ctx.fillStyle = "rgba(248,113,113,0.38)";
      ctx.fill("evenodd");
      ctx.restore();

      radarStats.forEach((stat, index) => {
        const base = character.stats?.[stat.key] ?? 0;
        const effective = effectiveStats?.[stat.key] ?? base;
        if (effective <= base) return;
        const from = basePoints[index];
        const to = effectivePoints[index];
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = "rgb(248,113,113)";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.stroke();
      });
    }

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

    if (hasBoost) {
      ctx.textAlign = "left";
      ctx.font = "12px Arial, sans-serif";
      ctx.fillStyle = "#a1a1aa";
      ctx.fillText("Cian: base · Rojo: boost", 28, 58);
    }

    const link = document.createElement("a");
    link.download = character.name.replace(/[^a-z0-9-_]+/gi, "_") + "-perfil.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  useEffect(() => {
    params
      .then(({ id }) => fetch(`/api/characters/${id}`))
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(setCharacter)
      .catch(() => setError("No se pudo cargar el personaje."))
      .finally(() => setLoading(false));
  }, [params]);

  if (loading) {
    return <main className="min-h-screen bg-zinc-950 p-12 text-white"><p className="text-zinc-500">Cargando personaje...</p></main>;
  }

  if (error || !character) {
    return (
      <main className="min-h-screen bg-zinc-950 p-12 text-white">
        <p className="text-red-400">{error || "Personaje no encontrado."}</p>
        <Link href="/characters" className="mt-4 inline-block text-zinc-300 hover:text-white">← Volver a personajes</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/characters" className="text-sm text-zinc-500 hover:text-white">← Personajes</Link>
          <Link href={"/casino?characterId=" + character.id} className="rounded-lg border border-amber-500/40 px-4 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-400/10">🎰 Casino</Link>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <h1 className="w-full text-4xl font-bold">{character.name}</h1>
          {character.canLevelUp && <Link href={"/characters/" + character.id + "/levelup"} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300">Level Up</Link>}
          {character.canManageCharacter && <Link href={"/management?characterId=" + character.id} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white">Gestionar personaje</Link>}
          <button type="button" onClick={copyToClipboard} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white">{copied ? "✓ Copiado" : "Copiar para WhatsApp"}</button>
          <button type="button" onClick={exportProfileCard} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white">Exportar imagen</button>
        </div>
        {character.canSeeCharacterId && <p className="mt-2 text-zinc-500">Personaje #{character.id}</p>}

        {character.age === null && character.gender === null && character.height === null && (
          <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
            <h2 className="text-xl font-semibold">Datos básicos</h2>
            <p className="mt-1 text-sm text-zinc-500">Estos datos se establecen una sola vez y después quedan bloqueados.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <label className="text-sm text-zinc-400">
                Edad
                <input type="number" min="0" max="1000" value={profileAge} onChange={(event) => setProfileAge(event.target.value)} disabled={savingProfile} className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-base text-white outline-none focus:border-cyan-400" placeholder="Años" />
              </label>
              <label className="text-sm text-zinc-400">
                Género
                <select value={profileGender} onChange={(event) => setProfileGender(event.target.value)} disabled={savingProfile} className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-base text-white outline-none focus:border-cyan-400">
                  <option value="">Selecciona</option>
                  {genderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="text-sm text-zinc-400">
                Altura
                <input type="number" min="1" max="1000" value={profileHeight} onChange={(event) => setProfileHeight(event.target.value)} disabled={savingProfile} className="mt-2 h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-base text-white outline-none focus:border-cyan-400" placeholder="cm" />
              </label>
            </div>
            <button type="button" onClick={saveProfile} disabled={savingProfile || !profileAge || !profileGender || !profileHeight} className="mt-5 rounded-xl bg-cyan-400 px-5 py-3 font-bold text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">
              {savingProfile ? "Guardando..." : "Guardar datos"}
            </button>
          </section>
        )}

        {(character.age !== null || character.gender !== null || character.height !== null) && (
          <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
            <h2 className="text-xl font-semibold">Datos básicos</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div><p className="text-sm text-zinc-500">Edad</p><p className="mt-1 text-lg font-semibold">{character.age ?? "—"}{character.age !== null ? " años" : ""}</p></div>
              <div><p className="text-sm text-zinc-500">Género</p><p className="mt-1 text-lg font-semibold">{character.gender ? genderOptions.find((option) => option.value === character.gender)?.label ?? character.gender : "—"}</p></div>
              <div><p className="text-sm text-zinc-500">Altura</p><p className="mt-1 text-lg font-semibold">{character.height !== null ? character.height + " cm" : "—"}</p></div>
            </div>
          </section>
        )}


        {character.stats && (
          <section className="mt-10 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><h2 className="text-xl font-semibold">Boost de Karma</h2><p className="mt-1 text-sm text-zinc-500">Gasta 20 de karma para obtener +20 como modificador activo en una estadística.</p></div>
              <span className="rounded-full border border-amber-400/20 px-3 py-1 text-sm text-amber-300">🪷 20</span>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <select value={boostStat} onChange={(event) => setBoostStat(event.target.value)} disabled={boosting} className="h-12 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-white outline-none focus:border-amber-400">
                {Object.entries(statLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              <button type="button" onClick={applyKarmaBoost} disabled={boosting || (character.resources?.karma ?? 0) < 20} className="rounded-xl bg-amber-400 px-5 py-3 font-bold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40">{boosting ? "Aplicando..." : "Aplicar boost"}</button>
            </div>
            {character.modifiers.length > 0 && <p className="mt-3 text-xs text-zinc-600">Boosts activos: {character.modifiers.filter((modifier) => modifier.source === "KARMA_BOOST").map((modifier) => `+${modifier.amount} ${statLabels[modifier.stat] ?? modifier.stat} · hasta ${new Date(String(modifier.expiresAt)).toLocaleDateString("es-MX")}`).join(" · ")}</p>}
          </section>
        )}

        {character.stats && radarValues && (
          <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.85fr] lg:items-center">
            <div>
              <h2 className="text-xl font-semibold">Estadísticas base</h2>
              <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(statLabels).map(([key, label]) => (
                  <div key={key} className="flex items-baseline justify-between gap-3 border-b border-zinc-800/80 py-2">
                    <p className="text-sm text-zinc-400">{label}</p>
                    <div className="text-right"><span className="text-lg font-semibold text-white">{character.effectiveStats?.[key] ?? character.stats?.[key as keyof typeof character.stats]}</span>{character.effectiveStats && character.effectiveStats[key] !== character.stats?.[key as keyof typeof character.stats] && <span className="ml-2 text-xs text-amber-300">({character.stats?.[key as keyof typeof character.stats]})</span>}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 pb-12">
              {character.age !== null && character.gender !== null && (
                <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
                  <CharacterSilhouette
                    age={character.age}
                    gender={character.gender as "masculino" | "femenino" | "indefinido"}
                    className="h-[125%] w-auto text-zinc-400"
                  />
                </div>
              )}
              <div className="relative z-10">
                <div className="flex items-baseline justify-between gap-4"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-600">Perfil</p><h3 className="text-lg font-semibold text-right">Distribución de estadísticas</h3></div>
                <div className="mt-3"><StatsRadar baseValues={baseRadarValues!} values={radarValues} /></div>
              </div>
              <div className="absolute bottom-3 left-5 right-5 z-20 flex items-center justify-between gap-4">
                <p className="text-xl font-semibold italic text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" style={{ fontFamily: '"Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive' }}>{character.name}</p>
                <p className="text-base font-semibold text-zinc-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">🪷 {character.resources?.karma?.toLocaleString("en-US") ?? 0}</p>
              </div>
            </div>
          </section>
        )}

        {character.derivedStats && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">Estadísticas derivadas</h2>
            <div className="mt-4 grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(character.derivedStats).map(([key, value]) => {
                const affectedByAttackMultiplier = key === "physicalAttack" || key === "magicAttack";
                const displayedValue = affectedByAttackMultiplier ? value * allAttackMultiplier : value;
                return <div key={key} className="flex items-baseline justify-between gap-3 border-b border-zinc-800/80 py-2">
                  <p className="text-sm text-zinc-400">{derivedLabels[key] ?? key}</p>
                  <p className="text-lg font-semibold">{displayedValue}{affectedByAttackMultiplier && allAttackMultiplier !== 1 && <span className="ml-2 text-xs text-amber-300">(base {value} · ×{allAttackMultiplier})</span>}</p>
                </div>;
              })}
            </div>
          </section>
        )}

        {character.combatEffects.length > 0 && (
          <section className="mt-10 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6">
            <h2 className="text-xl font-semibold">Objetos y efectos</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {character.combatEffects.map((effect) => (
                <div key={effect.type + effect.source} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                  <p className="font-semibold">{effect.source.replace(/^ITEM:/, "")}</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {effect.type === "attack_multiplier_all" ? `×${effect.value / 100} a todos los ataques` : `×${effect.value / 100} al daño recibido`}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
        )}

        {character.resources && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">Recursos</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><p className="text-sm text-zinc-500">Karma</p><p className="mt-1 text-2xl font-semibold">{character.resources.karma}</p></div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><p className="text-sm text-zinc-500">Dinero</p><p className="mt-1 text-2xl font-semibold">{character.resources.money}</p></div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><p className="text-sm text-zinc-500">Puntos de Level Up</p><p className="mt-1 text-2xl font-semibold">{character.resources.levelUpPoints}</p></div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
