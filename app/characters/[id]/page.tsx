"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CharacterSilhouette, getCharacterSilhouetteSvg } from "@/components/CharacterSilhouette";

type EquipmentItem = {
  id: number; itemId: number; quantity: number; equipped: boolean; equippedSlot: string | null; flair: string | null;
  item: { id: number; name: string; description: string | null; itemType: string; allowedSlots?: string[]; effects: { type: string; value: number; description?: string }[] } | null;
};

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
  statBreakdown: Record<string, {
    base: number;
    multipliers: number[];
    combinedMultiplier: number;
    objectFlatBonus: number;
    karmaBonus: number;
    value: number;
  }> | null;
  combatEffects: { type: "attack_multiplier_all" | "damage_reduction_all"; value: number; source: string; expiresAt: string | null }[];
  equipment: EquipmentItem[];
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

const equipmentSlots = [
  ["MAIN_HAND", "Mano principal"], ["OFF_HAND", "Mano secundaria"], ["HEAD", "Cabeza"], ["BODY", "Cuerpo"],
  ["FEET", "Pies"], ["ARMS", "Brazos"], ["BACK", "Espalda"], ["ACCESSORY_1", "Accesorio 1"], ["ACCESSORY_2", "Accesorio 2"],
] as const;

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
  const [equipmentBusy, setEquipmentBusy] = useState<number | null>(null);

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
            const breakdown = character.statBreakdown?.[key];
            const base = breakdown?.base ?? character.stats?.[key as keyof typeof character.stats] ?? 0;
            const effective = breakdown?.value ?? character.effectiveStats?.[key] ?? base;
            const multiplier = breakdown?.combinedMultiplier ?? 1;
            const objectBonus = breakdown?.objectFlatBonus ?? 0;
            const karmaBonus = breakdown?.karmaBonus ?? 0;
            const multiplierText = breakdown?.multipliers?.length
              ? " ×" + breakdown.multipliers.map((value) => value.toLocaleString("es-MX", { maximumFractionDigits: 2 })).join(" + ×") + " = ×" + multiplier.toLocaleString("es-MX", { maximumFractionDigits: 2 })
              : " ×1";
            return "• " + label + ": " + effective + " [(" + base + multiplierText + ") + " + objectBonus + " + " + karmaBonus + "]";
          }).join("\n")
        : "",
      "",
      "*ESTADÍSTICAS DERIVADAS*",
      character.derivedStats
        ? Object.entries(character.derivedStats).map(([key, value]) => {
            const affectedByAttackMultiplier = key === "physicalAttack" || key === "magicAttack";
            const displayedValue = affectedByAttackMultiplier ? value * allAttackMultiplier : value;
            return "• " + (derivedLabels[key] ?? key) + ": " + displayedValue + (affectedByAttackMultiplier && allAttackMultiplier !== 1 ? " (base " + value + " · ×" + allAttackMultiplier + ")" : "");
          }).join("\n")
        : "",
      "",
      character.equipment.some((entry) => entry.equipped)
        ? [
            "*EQUIPAMIENTO*",
            ...character.equipment.filter((entry) => entry.equipped).map((entry) =>
              "• " + (entry.item?.name ?? "Objeto") +
              (entry.flair ? " — " + entry.flair : "") +
              (entry.equippedSlot ? " [" + (equipmentSlots.find((slot) => slot[0] === entry.equippedSlot)?.[1] ?? entry.equippedSlot) + "]" : "")
            ),
            "",
          ].join("\n") + (
            character.combatEffects.length > 0 ? [
              "*OBJETOS Y EFECTOS*",
              ...character.combatEffects.map((effect) =>
                "• " + effect.source.replace(/^ITEM:/, "") + ": " +
                (effect.type === "attack_multiplier_all"
                  ? "×" + (effect.value / 100) + " a todos los ataques"
                  : "×" + (effect.value / 100) + " al daño recibido")
              ),
            ].join("\n") : ""
          )
        : character.combatEffects.length > 0
        ? [
            "*OBJETOS Y EFECTOS*",
            ...character.combatEffects.map((effect) =>
              "• " + effect.source.replace(/^ITEM:/, "") + ": " +
              (effect.type === "attack_multiplier_all"
                ? "×" + (effect.value / 100) + " a todos los ataques"
                : "×" + (effect.value / 100) + " al daño recibido")
            ),
          ].join("\n")
        : "",
      "",
      "*RECURSOS*",
      character.resources ? "• Karma: " + character.resources.karma + "\n• Dinero: " + character.resources.money : "",
    ];
    return lines.join("\n");
  }


  async function saveFlair(characterItemId: number, flair: string) {
    if (!character || equipmentBusy !== null) return;
    setEquipmentBusy(characterItemId);
    setError("");
    try {
      const response = await fetch("/api/characters/" + character.id + "/equipment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterItemId, equipped: character.equipment.find((entry) => entry.id === characterItemId)?.equipped ?? false, slot: character.equipment.find((entry) => entry.id === characterItemId)?.equippedSlot ?? null, flair }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar la variante.");
      const refreshed = await fetch("/api/characters/" + character.id);
      if (!refreshed.ok) throw new Error("La variante se guardó, pero no se pudo actualizar la ficha.");
      setCharacter(await refreshed.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la variante.");
    } finally {
      setEquipmentBusy(null);
    }
  }

  async function changeEquipment(characterItemId: number, equipped: boolean, slot?: string) {
    if (!character || equipmentBusy !== null) return;
    setEquipmentBusy(characterItemId);
    setError("");
    try {
      const response = await fetch("/api/characters/" + character.id + "/equipment", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterItemId, equipped, slot: slot ?? null }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo cambiar el equipamiento.");
      const refreshed = await fetch("/api/characters/" + character.id);
      if (!refreshed.ok) throw new Error("El equipamiento cambió, pero no se pudo actualizar la ficha.");
      setCharacter(await refreshed.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el equipamiento.");
    } finally { setEquipmentBusy(null); }
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
    const width = 760;
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

    const centerX = 380;
    const centerY = 380;
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
        ctx.drawImage(silhouetteImage, centerX - 110, centerY - 235, 220, 455);
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

    const equippedItems = character.equipment.filter((entry) => entry.equipped);
    if (equippedItems.length > 0) {
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font = "500 11px Arial, sans-serif";
      ctx.fillStyle = "#a1a1aa";
      equippedItems.slice(0, 6).forEach((entry, index) => {
        const slotLabel = entry.equippedSlot
          ? equipmentSlots.find((slot) => slot[0] === entry.equippedSlot)?.[1] ?? entry.equippedSlot
          : "";
        const flair = entry.flair ? " — " + entry.flair : "";
        const line = "• " + (entry.item?.name ?? "Objeto") + flair + (slotLabel ? " [" + slotLabel + "]" : "");
        ctx.fillText(line.slice(0, 105), 28, height - 106 - (5 - Math.min(index, 5)) * 13);
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
      <div className="mx-auto max-w-6xl px-6 py-6">
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


        <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="flex items-baseline justify-between gap-4">
            <div><h2 className="text-xl font-semibold">Equipamiento</h2><p className="mt-1 text-sm text-zinc-500">Objetos activos y sus ranuras.</p></div>
            <span className="text-xs text-zinc-600">{character.equipment.filter((entry) => entry.equipped).length} equipados</span>
          </div>
          {character.equipment.some((entry) => entry.equipped) ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {character.equipment.filter((entry) => entry.equipped).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-emerald-400/15 bg-zinc-950/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{entry.item?.name ?? "Objeto"}</p>
                      <p className="mt-1 text-xs text-zinc-500">{equipmentSlots.find((slot) => slot[0] === entry.equippedSlot)?.[1] ?? entry.equippedSlot ?? "Ranura"}</p>
                    </div>
                    <span className="rounded-full border border-emerald-400/20 px-2 py-1 text-xs text-emerald-300">Equipado</span>
                  </div>
                  {entry.item?.description && <p className="mt-3 text-sm text-zinc-400">{entry.item.description}</p>}
                  {entry.flair && <p className="mt-2 text-xs italic text-violet-300">✦ {entry.flair}</p>}
                  <button type="button" onClick={() => changeEquipment(entry.id, false)} disabled={equipmentBusy !== null} className="mt-4 w-full rounded-lg border border-red-900/70 px-3 py-2 text-xs text-red-300 disabled:opacity-50">Desequipar</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-zinc-500">No tienes objetos equipados.</p>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="flex items-baseline justify-between gap-4">
            <div><h2 className="text-xl font-semibold">Inventario</h2><p className="mt-1 text-sm text-zinc-500">Todos los objetos que posee el personaje.</p></div>
            <span className="text-xs text-zinc-600">{character.equipment.length} {character.equipment.length === 1 ? "objeto" : "objetos"}</span>
          </div>
          {character.equipment.length === 0 ? (
            <p className="mt-5 text-sm text-zinc-500">El inventario está vacío.</p>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {character.equipment.map((entry) => {
                const allowed = Array.isArray(entry.item?.allowedSlots) ? entry.item.allowedSlots : [];
                return (
                  <div key={entry.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{entry.item?.name ?? "Objeto"}</p>
                        <p className="mt-1 text-xs text-zinc-500">Cantidad: {entry.quantity}</p>
                      </div>
                      {entry.equipped && <span className="rounded-full border border-emerald-400/20 px-2 py-1 text-xs text-emerald-300">Equipado</span>}
                    </div>
                    {entry.item && (
                      <div className="mt-3 space-y-1 text-xs text-zinc-500">
                        <p>Tipo: {entry.item.itemType}</p>
                        {entry.item.description && <p className="pt-1 text-sm text-zinc-400">{entry.item.description}</p>}
                      </div>
                    )}
                    <div className="mt-4 space-y-2">
                      <label className="block text-xs text-zinc-500">
                        Variante / flair
                        <input
                          defaultValue={entry.flair ?? ""}
                          maxLength={500}
                          placeholder="Ej. Mandoble de 2 metros"
                          disabled={equipmentBusy !== null}
                          onBlur={(event) => {
                            const value = event.target.value.trim();
                            if (value !== (entry.flair ?? "")) saveFlair(entry.id, value);
                          }}
                          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
                        />
                      </label>
                    </div>
                    {!entry.equipped && (
                      <div className="mt-2 space-y-2">
                        <select defaultValue={allowed[0] ?? ""} id={"equipment-slot-" + entry.id} disabled={equipmentBusy !== null || allowed.length === 0} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                          {allowed.map((slot) => <option key={slot} value={slot}>{equipmentSlots.find((candidate) => candidate[0] === slot)?.[1] ?? slot}</option>)}
                        </select>
                        <button type="button" onClick={() => { const select = document.getElementById("equipment-slot-" + entry.id) as HTMLSelectElement | null; changeEquipment(entry.id, true, select?.value); }} disabled={equipmentBusy !== null || allowed.length === 0} className="w-full rounded-lg bg-white px-3 py-2 text-sm font-medium text-black disabled:opacity-50">
                          {allowed.length === 0 ? "No equipable" : "Equipar"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

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
