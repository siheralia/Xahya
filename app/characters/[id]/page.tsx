"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { CharacterSilhouette, getCharacterSilhouetteSvg } from "@/components/CharacterSilhouette";
import { applyDerivedItemEffects, calculateDerivedStats } from "@/lib/stats/derived";

type PropertyItem = { id:number; itemId:number; businessId:number|null; purchasePrice:number; item:{ id:number; name:string; description:string|null; imageUrl:string|null }|null };
type EquipmentItem = {
  id: number; itemId: number; quantity: number; equipped: boolean; equippedSlot: string | null; flair: string | null;
  item: { id: number; name: string; description: string | null; itemType: string; allowedSlots?: string[]; effects: { type: string; value: number; description?: string; action?: string }[] } | null;
};

type SkillEffect = { type: "DAMAGE_MULTIPLIER" | "STAT_MULTIPLIER" | "STAT_BONUS" | "NARRATIVE"; target?: string; value?: number; description?: string };
type SkillState = { id:number; characterId:number; skillId:number; active:boolean; accumulations:number; totalTicks:number; lastTickAt:string|null; };
type Skill = {
  id: number; characterId: number; name: string; cost: number; accumulationCost: number; accumulationPerTick: number; maintenanceCost: number; description: string | null; duration: string | null;
  category: string; basicType: string | null; attackType: string | null; defenseType: string | null; areaOfEffect: string | null; speed: string | null; cooldown: string | null; effect: SkillEffect[];
  condition: string | null; status: string; approvedAt: string | null;
};

const skillCategories = [["OFFENSIVE","Ofensiva"],["PASSIVE","Pasiva"],["SUPPORT","Soporte"],["UTILITY","Utilidad"],["BASIC","Básica"]] as const;
const skillEffectTypes = [["DAMAGE_MULTIPLIER","Daño ×"],["STAT_MULTIPLIER","Estadística ×"],["STAT_BONUS","Estadística +"],["NARRATIVE","Narrativo"]] as const;
const skillTargets = [
  ["STR","Fuerza"],["AGI","Agilidad"],["CON","Constitución"],["INT","Inteligencia"],["WIS","Sabiduría"],["CHA","Carisma"],["SPI","Espíritu"],["LCK","Suerte"],
  ["HP","HP"],["MANA","Mana"],["PHYS_ATK","Ataque físico"],["MAGIC_ATK","Ataque mágico"],["DEF","Defensa física"],["MAG_DEF","Defensa mágica"],
  ["PRECISION","Precisión"],["CRITICAL","Crítico"],["DISCOVERY","Hallazgo"],["MIRACLE","Milagro"],["INTIMIDATION","Intimidación"],["CONQUEST","Conquista"],
  ["RACE","Carrera"],["DODGE","Evasión"],["STEALTH","Sigilo"],["DETECTION","Detección"],["ATTACK_TOTAL","Ataque total"],
] as const;

type ThemePalette = {
  primary: string;
  secondary: string;
  accent: string;
  overlayPrimary: string;
  background: string;
  surface: string;
  border: string;
  foreground: string;
  muted: string;
};

const DEFAULT_THEME: ThemePalette = {
  primary: "#22d3ee",
  secondary: "#8b5cf6",
  accent: "#f59e0b",
  overlayPrimary: "#22d3ee",
  background: "#09090b",
  surface: "#18181b",
  border: "#3f3f46",
  foreground: "#ffffff",
  muted: "#a1a1aa",
};

type Character = {
  id: number;
  name: string;
  flair: string | null;
  avatarUrl: string | null;
  themePalette: ThemePalette | null;
  age: number | null;
  gender: string | null;
  height: number | null;
  magicAttackType: string;
  magicAttackDescription: string | null;
  blockDefenseType: string;
  fieldDefenseType: string;
  fieldDefenseDescription: string | null;
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
  perks: { id: number; perkId: number; source: string; perk: { name: string; description: string | null } | null }[];
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
  perkEffects?: { type: string; target?: string; value?: number; perkName?: string }[];
  combatEffects: { type: "attack_multiplier_all" | "damage_reduction_all"; value: number; source: string; expiresAt: string | null }[];
  equipment: EquipmentItem[];
  properties: PropertyItem[];
  canSeeCharacterId: boolean;
  isAdmin: boolean;
  canManageCharacter: boolean;
  canLevelUp: boolean;
  race: { id:number; name:string; description:string|null; imagePath:string|null; perkIds:number[] } | null;
  maze: { id: number; name: string; roomId: number; roomNumber: number | null } | null;
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



function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("");
}

function hexToRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function mixHex(a: string, b: string, amount: number) {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  return rgbToHex(
    first.r + (second.r - first.r) * amount,
    first.g + (second.g - first.g) * amount,
    first.b + (second.b - first.b) * amount,
  );
}

function colorDistance(a: string, b: string) {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  return Math.sqrt((first.r - second.r) ** 2 + (first.g - second.g) ** 2 + (first.b - second.b) ** 2);
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: lightness };
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return { h: hue / 6, s: saturation, l: lightness };
}

function isLikelySkinTone(r: number, g: number, b: number, hsl: { h: number; s: number; l: number }) {
  // Excluye tonos de piel sin eliminar rojos intensos de cabello, ropa, magia o accesorios.
  const hueDegrees = hsl.h * 360;
  const warmHue = hueDegrees >= 8 && hueDegrees <= 55;
  const skinSaturation = hsl.s >= 0.12 && hsl.s <= 0.72;
  const skinLightness = hsl.l >= 0.18 && hsl.l <= 0.88;
  const redDominance = r >= g * 0.82 && g >= b * 0.72;
  const notStrongOrange = !(r > 180 && g < r * 0.72);
  return warmHue && skinSaturation && skinLightness && redDominance && notStrongOrange;
}

function colorfulness(r: number, g: number, b: number) {
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

async function paletteFromSource(source: string | File, flair: string | null = null): Promise<ThemePalette> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  image.src = url;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("No se pudo analizar el avatar."));
  });

  const size = 72;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No se pudo analizar el avatar.");

  // Solo analizamos el 60% central para eliminar marcos, bordes y fondos de la orilla.
  const crop = 0.2;
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  context.drawImage(
    image,
    sourceWidth * crop,
    sourceHeight * crop,
    sourceWidth * (1 - crop * 2),
    sourceHeight * (1 - crop * 2),
    0,
    0,
    size,
    size,
  );
  if (typeof source !== "string") URL.revokeObjectURL(url);

  const pixels = context.getImageData(0, 0, size, size).data;

  const buckets = new Map<string, { count: number; colorfulness: number; hex: string }>();
  for (let i = 0; i < pixels.length; i += 16) {
    const alpha = pixels[i + 3];
    if (alpha < 180) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const hsl = rgbToHsl(r, g, b);
    if (isLikelySkinTone(r, g, b, hsl)) continue;

    const qr = Math.round(r / 24) * 24;
    const qg = Math.round(g / 24) * 24;
    const qb = Math.round(b / 24) * 24;
    const hex = rgbToHex(qr, qg, qb);
    const current = buckets.get(hex) ?? { count: 0, colorfulness: 0, hex };
    current.count += 1;
    current.colorfulness += colorfulness(r, g, b);
    buckets.set(hex, current);
  }

  const imageColors = [...buckets.values()]
    .map((entry) => ({ ...entry, colorfulness: entry.colorfulness / entry.count }))
    .filter((entry) => entry.colorfulness >= 0.12)
    .sort((a, b) =>
      (b.colorfulness ** 1.3 * Math.log2(b.count + 1)) -
      (a.colorfulness ** 1.3 * Math.log2(a.count + 1))
    );

  // Extraemos también los colores visibles del flair. Los emojis se renderizan
  // en un canvas pequeño y sus píxeles saturados reciben un peso fuerte.
  const flairColors: { hex: string; weight: number }[] = [];
  if (flair?.trim()) {
    const flairCanvas = document.createElement("canvas");
    flairCanvas.width = 128;
    flairCanvas.height = 64;
    const flairContext = flairCanvas.getContext("2d", { willReadFrequently: true });
    if (flairContext) {
      flairContext.clearRect(0, 0, 128, 64);
      flairContext.font = "42px sans-serif";
      flairContext.textAlign = "center";
      flairContext.textBaseline = "middle";
      flairContext.fillText(flair.trim(), 64, 32);

      const flairPixels = flairContext.getImageData(0, 0, 128, 64).data;
      const flairBuckets = new Map<string, number>();
      for (let i = 0; i < flairPixels.length; i += 16) {
        const alpha = flairPixels[i + 3];
        if (alpha < 120) continue;
        const r = flairPixels[i];
        const g = flairPixels[i + 1];
        const b = flairPixels[i + 2];
        if (colorfulness(r, g, b) < 0.16) continue;
        const hex = rgbToHex(Math.round(r / 16) * 16, Math.round(g / 16) * 16, Math.round(b / 16) * 16);
        flairBuckets.set(hex, (flairBuckets.get(hex) ?? 0) + 1);
      }
      for (const [hex, count] of flairBuckets.entries()) {
        flairColors.push({ hex, weight: count * 8 });
      }
    }
  }

  // Los colores estándar SOLO se usan para elegir el color del overlay.
  // La paleta conserva los colores reales extraídos del avatar y del flair.
  const standardColors = [
    "#00c853", // verde
    "#ff1744", // rojo
    "#006eff", // azul
    "#7c00ff", // morado
    "#ff6d00", // naranja
  ];

  const nearestStandard = (source: string) =>
    standardColors
      .map((standard) => ({ standard, distance: colorDistance(source, standard) }))
      .sort((a, b) => a.distance - b.distance)[0].standard;

  const weightedColors = [
    ...imageColors.map((entry) => ({ hex: entry.hex, weight: entry.colorfulness * Math.log2(entry.count + 1) })),
    ...flairColors,
  ].sort((a, b) => b.weight - a.weight);

  if (!weightedColors.length) return DEFAULT_THEME;

  // Primary/secondary/accent son colores reales de la paleta, NO colores estándar.
  const primarySource = weightedColors[0].hex;
  const secondarySource = weightedColors.find((entry) =>
    colorDistance(entry.hex, primarySource) > 55
  )?.hex ?? weightedColors[1]?.hex ?? primarySource;
  const accentSource = weightedColors.find((entry) =>
    entry.hex !== primarySource &&
    entry.hex !== secondarySource &&
    colorDistance(entry.hex, primarySource) > 35
  )?.hex ?? secondarySource;

  // Únicamente el overlay se traduce al estándar más cercano.
  const overlayPrimary = nearestStandard(primarySource);

  const background = mixHex(primarySource, "#09090b", 0.82);
  const surface = mixHex(primarySource, "#18181b", 0.72);
  const border = mixHex(primarySource, "#3f3f46", 0.45);
  const primaryRgb = hexToRgb(primarySource);
  const foreground = rgbToHsl(primaryRgb.r, primaryRgb.g, primaryRgb.b).l > 0.58 ? "#18181b" : "#ffffff";
  const muted = mixHex(primarySource, "#a1a1aa", 0.45);

  return {
    primary: primarySource,
    secondary: secondarySource,
    accent: accentSource,
    overlayPrimary,
    background,
    surface,
    border,
    foreground,
    muted,
  };
}

function StatsRadar({ baseValues, values, palette }: { baseValues: RadarValues; values: RadarValues; palette: ThemePalette }) {
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
            stroke={palette.border}
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
              <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fill={palette.muted} fontSize="11">
                {stat.short}
              </text>
            </g>
          );
        })}

        <polygon points={polygonPoints(basePoints)} fill={palette.primary} fillOpacity="0.32" stroke={palette.primary} strokeWidth="2" />

        {hasBoost && (
          <polygon points={boostPath} fill="#ef4444" fillOpacity="0.38" fillRule="evenodd" stroke="#ef4444" strokeOpacity="0.75" strokeWidth="1.5" />
        )}

        {hasBoost && radarStats.map((stat, index) => {
          if (values[stat.key] <= baseValues[stat.key]) return null;
          const base = basePoints[index];
          const boosted = effectivePoints[index];
          return <line key={"boost-" + stat.key} x1={base.x} y1={base.y} x2={boosted.x} y2={boosted.y} stroke="#ef4444" strokeWidth="4" strokeLinecap="round" />;
        })}
      </svg>

      {hasBoost && (
        <div className="mt-2 flex items-center justify-center gap-4 text-xs" style={{ color: palette.muted }}>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: palette.primary }} />Base</span>
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
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState<"ficha" | "estado" | "">("");
  const [temporaryEffects, setTemporaryEffects] = useState<TemporaryEffect[]>([]);
  const [effectTarget, setEffectTarget] = useState("strength");
  const [effectMode, setEffectMode] = useState<"percent" | "flat">("percent");
  const [effectValue, setEffectValue] = useState("");
  const [effectLabel, setEffectLabel] = useState("");
  const [currentHp, setCurrentHp] = useState(0);
  const [currentMana, setCurrentMana] = useState(0);
  const [boostStat, setBoostStat] = useState("strength");
  const [boosting, setBoosting] = useState(false);
  const [profileAge, setProfileAge] = useState("");
  const [profileGender, setProfileGender] = useState("");
  const [profileHeight, setProfileHeight] = useState("");
  const [characterFlair, setCharacterFlair] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingFlair, setSavingFlair] = useState(false);
  const [combatMagicAttackType, setCombatMagicAttackType] = useState("CUT");
  const [combatMagicAttackDescription, setCombatMagicAttackDescription] = useState("");
  const [combatBlockDefenseType, setCombatBlockDefenseType] = useState("CONCENTRATED");
  const [combatFieldDefenseType, setCombatFieldDefenseType] = useState("CONCENTRATED");
  const [combatFieldDefenseDescription, setCombatFieldDefenseDescription] = useState("");
  const [savingCombatTypes, setSavingCombatTypes] = useState(false);
  const [equipmentBusy, setEquipmentBusy] = useState<number | null>(null);
  const [flairSaving, setFlairSaving] = useState<number | null>(null);
  const [inventoryDeleting, setInventoryDeleting] = useState<number | null>(null);
  const [itemUsing, setItemUsing] = useState<number | null>(null);
  const [knownCharacters, setKnownCharacters] = useState<{ id: number; name: string }[]>([]);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferMoney, setTransferMoney] = useState(0);
  const [transferItem, setTransferItem] = useState("");
  const [transferQuantity, setTransferQuantity] = useState(1);
  const [transferBusy, setTransferBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarLoaded, setAvatarLoaded] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [avatarFlairOpen, setAvatarFlairOpen] = useState(false);
  const [combatPanelOpen, setCombatPanelOpen] = useState(false);
  const [perkRecoveryBusy, setPerkRecoveryBusy] = useState(false);
  const [races, setRaces] = useState<Array<{ id:number; name:string; description:string|null; imagePath:string|null; perks:Array<{id:number;name:string;description:string|null}> }>>([]);
  const [racePickerOpen, setRacePickerOpen] = useState(false);
  const [raceSaving, setRaceSaving] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [pendingSkills, setPendingSkills] = useState<Skill[]>([]);
  const [skillStates, setSkillStates] = useState<SkillState[]>([]);
  const [skillCreationCredits, setSkillCreationCredits] = useState(0);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [skillSaving, setSkillSaving] = useState(false);
  const [skillForm, setSkillForm] = useState({
    name: "", cost: 0, accumulationCost: 0, accumulationPerTick: 0, maintenanceCost: 0, description: "", duration: "", category: "OFFENSIVE",
    areaOfEffect: "", speed: "", cooldown: "", condition: "",
    effect: [] as SkillEffect[],
  });
  const themePalette = character?.themePalette ?? DEFAULT_THEME;

  useEffect(() => {
    if (!character) return;
    fetch("/api/characters/" + character.id + "/skills", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        setSkills(data.skills ?? []);
        setPendingSkills(data.pendingSkills ?? []);
        setSkillCreationCredits(Number(data.skillCreationCredits ?? 0));
        setSkillStates(data.skillStates ?? []);
      })
      .catch(() => {
        setSkills([]);
        setPendingSkills([]);
        setSkillCreationCredits(0);
        setSkillStates([]);
      });
  }, [character?.id]);

  useEffect(() => {
    if (!character || !skillStates.some((state) => state.active)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch("/api/characters/" + character.id + "/skills/tick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "tick" }),
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = await response.json();
        setSkillStates(data.states ?? []);
      } catch {
        // The scheduled server tick remains authoritative if the page is temporarily offline.
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [character?.id, skillStates.some((state) => state.active)]);

  async function toggleSkillAccumulation(skillId: number, active: boolean) {
    if (!character) return;
    try {
      const response = await fetch("/api/characters/" + character.id + "/skills/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: active ? "start" : "stop", skillId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo cambiar la acumulación.");
      setSkillStates((current) => {
        const next = current.filter((state) => state.skillId !== skillId);
        return [...next, data.state];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la acumulación.");
    }
  }

  useEffect(() => {
    if (!character) return;
    fetch("/api/characters/" + character.id + "/relationships", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        setKnownCharacters(data.characters ?? []);
      })
      .catch(() => setKnownCharacters([]));
  }, [character?.id]);

  useEffect(() => {
    if (!character) return;
    setCharacterFlair(character.flair ?? "");
  }, [character?.id]);

  async function compressAvatar(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Usa JPG, PNG o WebP.");
    if (file.size > 10 * 1024 * 1024) throw new Error("La imagen original no puede superar 10 MB.");
    const bitmap = await createImageBitmap(file);
    const maxSize = 512;
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la imagen.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("No se pudo comprimir la imagen.")), "image/webp", 0.82));
    return new File([blob], "avatar.webp", { type: "image/webp" });
  }

  async function uploadAvatar(file: File) {
    if (!character || avatarBusy) return;
    setAvatarBusy(true); setError(""); setSuccess("");
    try {
      const compressed = await compressAvatar(file);
      const palette = await paletteFromSource(compressed, character.flair);
      const formData = new FormData();
      formData.append("file", compressed);
      const response = await fetch("/api/characters/" + character.id + "/avatar", { method: "POST", body: formData });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo subir la imagen.");
      let savedPalette = palette;
      if (data.avatarUrl) {
        const themeResponse = await fetch("/api/characters/" + character.id + "/theme", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ palette }),
        });
        if (themeResponse.ok) {
          const themeData = await themeResponse.json();
          savedPalette = themeData.themePalette ?? palette;
        }
      }
      setCharacter((current) => current ? { ...current, avatarUrl: data.avatarUrl ?? null, themePalette: savedPalette } : current);
      setSuccess("Avatar y tema visual actualizados.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen.");
    } finally { setAvatarBusy(false); }
  }

  async function removeAvatar() {
    if (!character || avatarBusy || !character.avatarUrl) return;
    if (!window.confirm("¿Eliminar el avatar del personaje?")) return;
    setAvatarBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/characters/" + character.id + "/avatar", { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo eliminar la imagen.");
      setCharacter((current) => current ? { ...current, avatarUrl: null, themePalette: null } : current);
      setSuccess("Avatar eliminado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la imagen.");
    } finally { setAvatarBusy(false); }
  }

  useEffect(() => {
    setAvatarLoaded(false);
    setAvatarLoadError(false);
  }, [character?.avatarUrl]);

  const creationPerkCount = character?.perks?.filter((perk: any) => String(perk.source ?? "") === "CREATION_ROLL").length ?? 0;

  useEffect(() => {
    if (!character || character.race || !character.canManageCharacter) return;
    fetch("/api/races", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        setRaces(Array.isArray(data.races) ? data.races : []);
      })
      .catch(() => setRaces([]));
  }, [character?.id, character?.race, character?.canManageCharacter]);

  async function chooseExistingCharacterRace(raceId:number) {
    if (!character || raceSaving || character.race) return;
    setRaceSaving(true);
    setError("");
    try {
      const response = await fetch("/api/characters/" + character.id + "/race", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raceId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo elegir la raza.");
      const refresh = await fetch("/api/characters/" + character.id, { cache: "no-store" });
      if (!refresh.ok) throw new Error("La raza se guardó, pero no se pudo actualizar la ficha.");
      setCharacter(await refresh.json());
      setRacePickerOpen(false);
      setSuccess("Raza elegida correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo elegir la raza.");
    } finally {
      setRaceSaving(false);
    }
  }

  async function recoverCreationPerks() {
    if (!character || creationPerkCount >= 3 || perkRecoveryBusy) return;
    setPerkRecoveryBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/characters/" + character.id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudieron recuperar las perks de creación.");

      const refresh = await fetch("/api/characters/" + character.id, { cache: "no-store" });
      if (!refresh.ok) throw new Error("Las perks se otorgaron, pero no se pudo actualizar la ficha.");
      setCharacter(await refresh.json());
      setSuccess("Se recuperaron las perks de creación que faltaban.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron recuperar las perks de creación.");
    } finally {
      setPerkRecoveryBusy(false);
    }
  }

  async function transfer() {
    if (!character || !transferTarget || (transferMoney <= 0 && !transferItem)) return;
    setTransferBusy(true);
    setError("");
    try {
      const response = await fetch("/api/characters/" + character.id + "/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetCharacterId: Number(transferTarget),
          money: transferItem ? 0 : Math.trunc(transferMoney),
          characterItemId: transferItem ? Number(transferItem) : null,
          quantity: transferItem ? Math.trunc(transferQuantity) : 1,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudo completar la entrega.");
      setSuccess("Entrega realizada correctamente.");
      setTransferMoney(0);
      setTransferItem("");
      setTransferQuantity(1);
      const refresh = await fetch("/api/characters/" + character.id, { cache: "no-store" });
      if (refresh.ok) setCharacter(await refresh.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la entrega.");
    } finally {
      setTransferBusy(false);
    }
  }

  const maxHp = character?.derivedStats?.maxHp ?? 0;
  const maxMana = character?.derivedStats?.maxMana ?? 0;

  useEffect(() => {
    if (!character) return;
    setCurrentHp(maxHp);
    setCurrentMana(maxMana);
  }, [character?.id, maxHp, maxMana]);

  const radarValues = character?.stats
    ? radarStats.reduce((result, stat) => {
        const base = character.effectiveStats?.[stat.key] ?? character.stats?.[stat.key] ?? 0;
        result[stat.key] = applyTemporaryEffects(stat.key, base);
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

  type TemporaryEffect = { id: number; target: string; mode: "percent" | "flat"; value: number; label: string };

  function applyTemporaryEffects(target: string, value: number) {
    return temporaryEffects.filter((effect) => effect.target === target).reduce(
      (result, effect) => effect.mode === "percent" ? result * (1 + effect.value / 100) : result + effect.value,
      value,
    );
  }

  function addTemporaryEffect() {
    const numericValue = Number(effectValue);
    if (!effectLabel.trim() || effectValue === "" || !Number.isFinite(numericValue) || numericValue === 0) return;
    setTemporaryEffects((effects) => [...effects, { id: Date.now(), target: effectTarget, mode: effectMode, value: numericValue, label: effectLabel.trim() }]);
    setEffectLabel("");
    setEffectValue("");
  }

  function removeTemporaryEffect(id: number) {
    setTemporaryEffects((effects) => effects.filter((effect) => effect.id !== id));
  }

  function formatNumber(value: number) {
    return Number.isInteger(value) ? String(value) : value.toLocaleString("es-MX", { maximumFractionDigits: 2 });
  }

  function buildFichaWhatsApp(character: Character) {
    const itemStatCode: Record<string, string> = {
      strength: "STR", agility: "AGI", constitution: "CON", intelligence: "INT",
      wisdom: "WIS", charisma: "CHA", spirit: "SPI", luck: "LCK",
    };
    const signed = (value: number) => (value >= 0 ? "+" : "") + formatNumber(value);

    // Los multiplicadores se exportan como factores reales y se SUMAN:
    // 2 + 2 = 4, por lo que una base de 21.5 queda como 21.5 × (2 + 2).
    const buffFormula = (base: number, multipliers: number[], karma: number, flat: number) => {
      const factors = multipliers.filter((value) => Math.abs(value - 1) > 0.000001);
      if (!factors.length && karma === 0 && flat === 0) return "";
      // Los factores se acumulan como incrementos sobre el 1 base:
      // ×2 + ×2 + +30% = 1 + (2-1) + (2-1) + (1.3-1) = 4.3.
      const combinedMultiplier = 1 + factors.reduce((sum, value) => sum + (value - 1), 0);
      const multiplierText = factors.length
        ? formatNumber(base) + " × " + formatNumber(combinedMultiplier)
        : formatNumber(base);
      return [
        multiplierText,
        karma !== 0 ? signed(karma) + " 🪷" : "",
        flat !== 0 ? signed(flat) : "",
      ].filter(Boolean).join(" ");
    };

    const equippedStatEffects = (stat: string) =>
      character.equipment.filter((entry) => entry.equipped).flatMap((entry) =>
        (entry.item?.effects ?? []).filter((effect) =>
          (effect as { stat?: string }).stat === itemStatCode[stat] &&
          (effect.type === "stat_bonus" || effect.type === "stat_multiplier")
        )
      );

    // Los efectos temporales sobre estadísticas base deben recalcular TODAS las
    // estadísticas derivadas usando las mismas fórmulas del sistema.
    const equippedEffects = character.equipment.filter((entry) => entry.equipped).flatMap((entry) =>
      (entry.item?.effects ?? []).map((effect) => ({
        item: entry.item?.name ?? "Objeto",
        type: effect.type,
        stat: String((effect as { stat?: string }).stat ?? "").toUpperCase(),
        value: Number(effect.value),
      }))
    );

    const temporaryBaseStats = {
      strength: applyTemporaryEffects("strength", character.effectiveStats?.strength ?? character.stats?.strength ?? 0),
      agility: applyTemporaryEffects("agility", character.effectiveStats?.agility ?? character.stats?.agility ?? 0),
      constitution: applyTemporaryEffects("constitution", character.effectiveStats?.constitution ?? character.stats?.constitution ?? 0),
      intelligence: applyTemporaryEffects("intelligence", character.effectiveStats?.intelligence ?? character.stats?.intelligence ?? 0),
      wisdom: applyTemporaryEffects("wisdom", character.effectiveStats?.wisdom ?? character.stats?.wisdom ?? 0),
      charisma: applyTemporaryEffects("charisma", character.effectiveStats?.charisma ?? character.stats?.charisma ?? 0),
      spirit: applyTemporaryEffects("spirit", character.effectiveStats?.spirit ?? character.stats?.spirit ?? 0),
      luck: applyTemporaryEffects("luck", character.effectiveStats?.luck ?? character.stats?.luck ?? 0),
    };
    const recalculatedDerived = applyDerivedItemEffects(
      calculateDerivedStats(temporaryBaseStats),
      equippedEffects
        .filter((effect) => effect.type === "stat_bonus" || effect.type === "stat_multiplier")
        .map((effect) => ({ type: effect.type, stat: effect.stat, value: effect.value }))
    );

    const lines = [
      "*" + character.name + (character.flair ? " ⟨" + character.flair + "⟩" : ""),
      "",
      "*DATOS DEL PERSONAJE*",
      character.age !== null ? "• Edad: " + character.age + " años" : "",
      character.gender ? "• Género: " + (genderOptions.find((option) => option.value === character.gender)?.label ?? character.gender) : "",
      character.height !== null ? "• Altura: " + character.height + " cm" : "",
      "",
      "*ESTADÍSTICAS*",
      character.stats
        ? Object.entries(statLabels).map(([key, label]) => {
            const breakdown = character.statBreakdown?.[key];
            const base = breakdown?.base ?? character.stats?.[key as keyof typeof character.stats] ?? 0;
            const effective = breakdown?.value ?? character.effectiveStats?.[key] ?? base;
            const effects = equippedStatEffects(key);
            const itemMultipliers = effects.filter((effect) => effect.type === "stat_multiplier").map((effect) => 1 + Number(effect.value) / 100);
            const formula = buffFormula(
              base,
              [...(breakdown?.multipliers ?? []), ...itemMultipliers],
              breakdown?.karmaBonus ?? 0,
              breakdown?.objectFlatBonus ?? 0,
            );
            return "• " + label + ": " + formatNumber(effective) + (formula ? " [" + formula + "]" : "");
          }).join("\n")
        : "",
      "*ESTADÍSTICAS DERIVADAS*",
      character.derivedStats
        ? Object.entries(character.derivedStats).map(([key, value]) => {
            const directEffects = character.equipment.filter((entry) => entry.equipped).flatMap((entry) =>
              (entry.item?.effects ?? []).filter((effect) => {
                const target = String((effect as { stat?: string }).stat ?? "").toUpperCase();
                const aliases: Record<string,string> = {
                  HP:"maxHp",MAX_HP:"maxHp",MANA:"maxMana",MAX_MANA:"maxMana",
                  PHYS_ATK:"physicalAttack",PHYSICAL_ATTACK:"physicalAttack",MAGIC_ATK:"magicAttack",
                  PHYSICAL_DEF:"physicalDefense",DEF:"physicalDefense",DEFENSE:"physicalDefense",
                  MAG_DEF:"magicDefense",MAGIC_DEFENSE:"magicDefense",PRECISION:"precision",
                  CRITICAL:"critical",DISCOVERY:"discovery",MIRACLE:"miracle",INTIMIDATION:"intimidation",
                  CONQUEST:"conquest",RACE:"race",DODGE:"dodge",STEALTH:"stealth",DETECTION:"detection"
                };
                return aliases[target] === key && (effect.type === "stat_bonus" || effect.type === "stat_multiplier");
              })
            );
            const directFlat = directEffects.filter((effect) => effect.type === "stat_bonus").reduce((sum, effect) => sum + Number(effect.value), 0);
            const directMultipliers = directEffects.filter((effect) => effect.type === "stat_multiplier").map((effect) => 1 + Number(effect.value) / 100);
            const perkEffects = (character.perkEffects ?? []).filter((effect) =>
              String(effect.type) === "RESOURCE_BONUS" &&
              ((key === "maxHp" && String(effect.target) === "HP") || (key === "maxMana" && String(effect.target) === "MANA"))
            );
            const perkFlat = perkEffects.reduce((sum, effect) => sum + Number(effect.value ?? 0), 0);
            const attackMultipliers = (key === "physicalAttack" || key === "magicAttack")
              ? character.equipment.filter((entry) => entry.equipped).flatMap((entry) =>
                  (entry.item?.effects ?? [])
                    .filter((effect) =>
                      ((effect as { stat?: string }).stat === "ATTACK_TOTAL" || effect.type === "attack_multiplier_all") &&
                      Number(effect.value) / 100 !== 1
                    )
                    .map((effect) => Number(effect.value) / 100)
                )
              : [];
            const multipliers = [...directMultipliers, ...attackMultipliers];
            const flat = directFlat + perkFlat;
            const formula = buffFormula(value - flat, multipliers, 0, flat);
            const displayed = value;
            return "• " + (derivedLabels[key] ?? key) + ": " + formatNumber(displayed) + (formula ? " [" + formula + "]" : "");
          }).join("\n")
        : "",
      "*PERKS*",
      character.perks.length
        ? character.perks.map((entry) => "• " + (entry.perk?.name ?? "Perk") + (entry.perk?.description ? " — " + entry.perk.description : "")).join("\n")
        : "• Ninguna",
      "",
      "*HABILIDADES*",
      skills.length
        ? skills.flatMap((skill) => {
            const categoryLabels: Record<string, string> = { OFFENSIVE: "Ofensiva", PASSIVE: "Pasiva", SUPPORT: "Soporte", UTILITY: "Utilidad" };
            const targetLabels: Record<string, string> = Object.fromEntries(skillTargets.map(([value, label]) => [value, label]));
            const effectLines = skill.effect.map((effect) => {
              const target = effect.target ? (targetLabels[effect.target] ?? effect.target) : "";
              if (effect.type === "NARRATIVE") {
                return effect.description ? "  " + effect.description : "";
              }
              if (effect.type === "DAMAGE_MULTIPLIER") {
                return "  Daño: " + target + " ×" + formatNumber(Number(effect.value ?? 100) / 100);
              }
              if (effect.type === "STAT_MULTIPLIER") {
                return "  " + target + " ×" + formatNumber(Number(effect.value ?? 100) / 100);
              }
              if (effect.type === "STAT_BONUS") {
                return "  " + target + " " + (Number(effect.value ?? 0) >= 0 ? "+" : "") + formatNumber(Number(effect.value ?? 0));
              }
              return "";
            }).filter(Boolean);
            return [
              "• *" + skill.name + "* — " + (categoryLabels[skill.category] ?? skill.category) + " | Coste: " + formatNumber(skill.cost) + (Number(skill.maintenanceCost ?? 0) > 0 ? " | Mantenimiento/turno: " + formatNumber(Number(skill.maintenanceCost)) : ""),
              ...(skill.description ? ["  " + skill.description] : []),
              ...(skill.duration ? ["  Duración: " + skill.duration] : []),
              ...(skill.areaOfEffect ? ["  Área: " + skill.areaOfEffect] : []),
              ...(skill.speed ? ["  Velocidad: " + skill.speed] : []),
              ...(skill.cooldown ? ["  Cooldown: " + skill.cooldown] : []),
              ...(skill.condition ? ["  Condición: " + skill.condition] : []),
              ...effectLines,
            ];
          }).join("\n")
        : "• Ninguna",
      "",
      "*INVENTARIO*",
      character.equipment.length
        ? character.equipment.map((entry) =>
            "• " + (entry.item?.name ?? "Objeto") + " ×" + entry.quantity +
            (entry.equipped ? " [Equipado" + (entry.equippedSlot ? ": " + (equipmentSlots.find((slot) => slot[0] === entry.equippedSlot)?.[1] ?? entry.equippedSlot) : "") + "]" : "") +
            (entry.flair ? " — " + entry.flair : "")
          ).join("\n")
        : "• Vacío",
      "",
      "*BONOS DE EQUIPO*",
      character.equipment.filter((entry) => entry.equipped && (entry.item?.effects?.length ?? 0) > 0).flatMap((entry) =>
        (entry.item?.effects ?? []).map((effect) => "• " + (entry.item?.name ?? "Objeto") + ": " + (effect.description ?? effect.type + " " + effect.value))
      ).join("\n") || "• Ninguno",
      "",
      "*RECURSOS PERMANENTES*",
      character.resources ? "• Karma: " + character.resources.karma + "\n• Dinero: " + character.resources.money : "",
    ];
    return lines.filter((line, index) => !(line === "" && lines[index - 1] === "")).join("\n");
  }

  function buildEstadoWhatsApp(character: Character) {
    const signed = (value: number) => (value >= 0 ? "+" : "") + formatNumber(value);
    const buffFormula = (base: number, multipliers: number[], karma: number, flat: number) => {
      const factors = multipliers.filter((value) => Math.abs(value - 1) > 0.000001);
      if (!factors.length && karma === 0 && flat === 0) return "";
      const multiplierText = factors.length
        ? formatNumber(base) + " × (" + factors.map((value) => formatNumber(value)).join(" + ") + ")"
        : formatNumber(base);
      return [multiplierText, karma !== 0 ? signed(karma) + " 🪷" : "", flat !== 0 ? signed(flat) : ""].filter(Boolean).join(" ");
    };
    const temporaryBaseStats = {
      strength: applyTemporaryEffects("strength", character.effectiveStats?.strength ?? character.stats?.strength ?? 0),
      agility: applyTemporaryEffects("agility", character.effectiveStats?.agility ?? character.stats?.agility ?? 0),
      constitution: applyTemporaryEffects("constitution", character.effectiveStats?.constitution ?? character.stats?.constitution ?? 0),
      intelligence: applyTemporaryEffects("intelligence", character.effectiveStats?.intelligence ?? character.stats?.intelligence ?? 0),
      wisdom: applyTemporaryEffects("wisdom", character.effectiveStats?.wisdom ?? character.stats?.wisdom ?? 0),
      charisma: applyTemporaryEffects("charisma", character.effectiveStats?.charisma ?? character.stats?.charisma ?? 0),
      spirit: applyTemporaryEffects("spirit", character.effectiveStats?.spirit ?? character.stats?.spirit ?? 0),
      luck: applyTemporaryEffects("luck", character.effectiveStats?.luck ?? character.stats?.luck ?? 0),
    };
    const recalculatedDerived = applyDerivedItemEffects(
      calculateDerivedStats(temporaryBaseStats),
      character.equipment.filter((entry) => entry.equipped).flatMap((entry) =>
        (entry.item?.effects ?? [])
          .filter((effect) => effect.type === "stat_bonus" || effect.type === "stat_multiplier")
          .map((effect) => ({
            type: effect.type,
            stat: String((effect as { stat?: string }).stat ?? "").toUpperCase(),
            value: Number(effect.value),
          }))
      )
    );
    const itemStatCode: Record<string, string> = {
      strength: "STR", agility: "AGI", constitution: "CON", intelligence: "INT",
      wisdom: "WIS", charisma: "CHA", spirit: "SPI", luck: "LCK",
    };
    const derivedAliases: Record<string,string> = {
      HP:"maxHp",MAX_HP:"maxHp",MANA:"maxMana",MAX_MANA:"maxMana",
      PHYS_ATK:"physicalAttack",PHYSICAL_ATTACK:"physicalAttack",MAGIC_ATK:"magicAttack",
      PHYSICAL_DEF:"physicalDefense",DEF:"physicalDefense",DEFENSE:"physicalDefense",
      MAG_DEF:"magicDefense",MAGIC_DEFENSE:"magicDefense",PRECISION:"precision",
      CRITICAL:"critical",DISCOVERY:"discovery",MIRACLE:"miracle",INTIMIDATION:"intimidation",
      CONQUEST:"conquest",RACE:"race",DODGE:"dodge",STEALTH:"stealth",DETECTION:"detection"
    };
    const equippedEffects = character.equipment.filter((entry) => entry.equipped).flatMap((entry) =>
      (entry.item?.effects ?? []).map((effect) => ({
        item: entry.item?.name ?? "Objeto",
        type: effect.type,
        stat: String((effect as { stat?: string }).stat ?? "").toUpperCase(),
        value: Number(effect.value),
      }))
    );
    const directEffectsForExport = (key: string) =>
      equippedEffects.filter((effect) => derivedAliases[effect.stat] === key && (effect.type === "stat_bonus" || effect.type === "stat_multiplier"));

    const getAttackExportFormula = (base: number, equipmentFactors: number[], temporaryPercentages: number[]) => {
      if (!equipmentFactors.length && !temporaryPercentages.length) return "";
      // Para ataques: los multiplicadores de ataque se SUMAN (×2 + ×2 = ×4)
      // y los porcentajes aportan solo su incremento (+30% = +0.3).
      const combinedMultiplier = equipmentFactors.length
        ? equipmentFactors.reduce((sum, factor) => sum + factor, 0) +
          temporaryPercentages.reduce((sum, percent) => sum + percent / 100, 0)
        : 1 + temporaryPercentages.reduce((sum, percent) => sum + percent / 100, 0);
      return formatNumber(base) + " × " + formatNumber(combinedMultiplier);
    };

    const getDerivedFormula = (key: string, value: number) => {
      const direct = directEffectsForExport(key);
      const directFlat = direct.filter((effect) => effect.type === "stat_bonus").reduce((sum, effect) => sum + effect.value, 0);
      const directMultipliers = direct.filter((effect) => effect.type === "stat_multiplier").map((effect) => 1 + effect.value / 100);
      const perkFlat = (character.perkEffects ?? [])
        .filter((effect) => String(effect.type) === "RESOURCE_BONUS" && ((key === "maxHp" && String(effect.target) === "HP") || (key === "maxMana" && String(effect.target) === "MANA")))
        .reduce((sum, effect) => sum + Number(effect.value ?? 0), 0);
      const attackMultipliers = (key === "physicalAttack" || key === "magicAttack")
        ? equippedEffects
            .filter((effect) => (effect.stat === "ATTACK_TOTAL" || effect.type === "attack_multiplier_all") && effect.value / 100 !== 1)
            .map((effect) => effect.value / 100)
        : [];
      const flat = directFlat + perkFlat;
      if ((key === "physicalAttack" || key === "magicAttack") && attackMultipliers.length) {
        return getAttackExportFormula(value - flat, attackMultipliers, []);
      }
      const multipliers = [...directMultipliers, ...attackMultipliers];
      return buffFormula(value - flat, multipliers, 0, flat);
    };
    const lines = [
      "*" + character.name + (character.flair ? " ⟨" + character.flair + "⟩" : "") + "*",
      "",
      "*ESTADO ACTUAL*",
      "• ❤️ HP: " + formatNumber(currentHp) + "/" + formatNumber(maxHp),
      "• 🔷 Mana: " + formatNumber(currentMana) + "/" + formatNumber(maxMana),
      "",
      "*ESTADÍSTICAS EFECTIVAS*",
      ...Object.entries(statLabels).map(([key, label]) => {
        const breakdown = character.statBreakdown?.[key];
        const base = breakdown?.base ?? character.stats?.[key as keyof typeof character.stats] ?? 0;
        const permanentValue = breakdown?.value ?? character.effectiveStats?.[key] ?? base;
        const temporaryValue = applyTemporaryEffects(key, permanentValue);
        const formula = buffFormula(base, breakdown?.multipliers ?? [], breakdown?.karmaBonus ?? 0, breakdown?.objectFlatBonus ?? 0);
        const temporaryEffectsForStat = temporaryEffects.filter((effect) => effect.target === key);
        const temporaryText = temporaryEffectsForStat.length
          ? " (" + temporaryEffectsForStat.map((effect) => effect.label + ": " + (effect.mode === "percent" ? (effect.value > 0 ? "+" : "") + formatNumber(effect.value) + "%" : (effect.value > 0 ? "+" : "") + formatNumber(effect.value))).join(", ") + ")"
          : "";
        return "• " + label + ": " + formatNumber(temporaryValue) + (formula ? " [" + formula + "]" : "") + temporaryText;
      }),
      ...(character.derivedStats ? [
        "",
        ...Object.entries(character.derivedStats).map(([key, serverValue]) => {
          const affectedByAttackMultiplier = key === "physicalAttack" || key === "magicAttack";
          // Recalculamos desde las estadísticas base temporales en vez de partir
          // del valor derivado permanente del servidor.
          const value = recalculatedDerived[key as keyof typeof recalculatedDerived] ?? serverValue;
          const temporaryAttackPercentages = affectedByAttackMultiplier
            ? temporaryEffects
                .filter((effect) => effect.target === key && effect.mode === "percent")
                .map((effect) => effect.value)
            : [];
          const equipmentAttackFactors = affectedByAttackMultiplier
            ? equippedEffects
                .filter((effect) => (effect.stat === "ATTACK_TOTAL" || effect.type === "attack_multiplier_all") && effect.value / 100 !== 1)
                .map((effect) => effect.value / 100)
            : [];
          const combinedExportAttackMultiplier = affectedByAttackMultiplier
            ? (equipmentAttackFactors.length
                ? equipmentAttackFactors.reduce((sum, factor) => sum + factor, 0) +
                  temporaryAttackPercentages.reduce((sum, percent) => sum + percent / 100, 0)
                : 1 + temporaryAttackPercentages.reduce((sum, percent) => sum + percent / 100, 0))
            : 1;

          const valueWithEquipment = affectedByAttackMultiplier
            ? value * combinedExportAttackMultiplier
            : value;
          // Los porcentajes temporales del ataque ya están incluidos arriba;
          // no deben volver a pasar por applyTemporaryEffects.
          const effectiveValue = affectedByAttackMultiplier
            ? valueWithEquipment
            : applyTemporaryEffects(key, valueWithEquipment);
          const formula = affectedByAttackMultiplier && (equipmentAttackFactors.length || temporaryAttackPercentages.length)
            ? getAttackExportFormula(value, equipmentAttackFactors, temporaryAttackPercentages)
            : getDerivedFormula(key, value);
          const temporaryEffectsForStat = temporaryEffects.filter((effect) => effect.target === key);
          const temporaryText = temporaryEffectsForStat.length
            ? " (" + temporaryEffectsForStat.map((effect) => effect.label + ": " + (effect.mode === "percent" ? (effect.value > 0 ? "+" : "") + formatNumber(effect.value) + "%" : (effect.value > 0 ? "+" : "") + formatNumber(effect.value))).join(", ") + ")"
            : "";
          return "• " + (derivedLabels[key] ?? key) + ": " + formatNumber(effectiveValue) + (formula ? " [" + formula + "]" : "") + temporaryText;
        }),
      ] : []),
      "",
      "*EQUIPO EQUIPADO*",
      character.equipment.filter((entry) => entry.equipped).length
        ? character.equipment.filter((entry) => entry.equipped).flatMap((entry) => {
            const effects = entry.item?.effects ?? [];
            return ["• " + (entry.item?.name ?? "Objeto") + (entry.equippedSlot ? " — " + (equipmentSlots.find((slot) => slot[0] === entry.equippedSlot)?.[1] ?? entry.equippedSlot) : ""), ...effects.map((effect) => "  ↳ " + (effect.description ?? effect.type + " " + effect.value))];
          }).join("\n")
        : "• Ninguno",
      "",
      "*EFECTOS TEMPORALES*",
      ...(temporaryEffects.length
        ? temporaryEffects.map((effect) => "• " + (effect.mode === "percent" ? (effect.value > 0 ? "+" : "") + formatNumber(effect.value) + "%" : (effect.value > 0 ? "+" : "") + formatNumber(effect.value)) + " — " + effect.label + " → " + (statLabels[effect.target] ?? derivedLabels[effect.target] ?? effect.target))
        : ["• Ninguno"]),
    ];
    return lines.join("\n");
  }

  async function copyFichaToClipboard() {
    if (!character) return;
    try {
      await navigator.clipboard.writeText(buildFichaWhatsApp(character));
      setCopied("ficha");
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("No se pudo copiar la ficha al portapapeles.");
    }
  }

  async function copyEstadoToClipboard() {
    if (!character) return;
    try {
      await navigator.clipboard.writeText(buildEstadoWhatsApp(character));
      setCopied("estado");
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("No se pudo copiar el estado al portapapeles.");
    }
  }

  async function saveFlair(characterItemId: number, flair: string) {
    if (!character || !character.isAdmin || flairSaving !== null) return;
    setFlairSaving(characterItemId);
    setError("");
    try {
      const response = await fetch("/api/management/characters/" + character.id + "/equipment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterItemId, flair }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo actualizar el flair.");
      setCharacter((current) => current ? {
        ...current,
        equipment: current.equipment.map((entry) => entry.id === characterItemId ? { ...entry, flair: flair || null } : entry),
      } : current);
      setSuccess("Flair actualizado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el flair.");
    } finally {
      setFlairSaving(null);
    }
  }

  async function deleteInventoryItem(characterItemId: number) {
    if (!character || !character.isAdmin || inventoryDeleting !== null) return;
    if (!window.confirm("¿Eliminar este objeto del inventario?")) return;
    setInventoryDeleting(characterItemId);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/management/characters/" + character.id + "/equipment", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterItemId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo eliminar el objeto.");
      setCharacter((current) => current ? {
        ...current,
        equipment: current.equipment.filter((entry) => entry.id !== characterItemId),
      } : current);
      setSuccess("Objeto eliminado del inventario.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el objeto.");
    } finally {
      setInventoryDeleting(null);
    }
  }

  async function useConsumable(characterItemId: number, itemName: string) {
    if (!character || itemUsing !== null) return;
    if (!window.confirm("¿Usar 1 × " + itemName + "?")) return;
    setItemUsing(characterItemId);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/characters/" + character.id + "/items/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterItemId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo usar el consumible.");
      const refreshed = await fetch("/api/characters/" + character.id, { cache: "no-store" });
      if (!refreshed.ok) throw new Error("El consumible se usó, pero no se pudo actualizar el inventario.");
      setCharacter(await refreshed.json());
      if (data.action === "CREATE_SKILL") {
        setSkillCreationCredits(Number(data.skillCreationCredits ?? skillCreationCredits + 1));
        setSkillModalOpen(true);
        setSkillsOpen(true);
        setSuccess("Cristal consumido. Ahora puedes crear una habilidad y enviarla a aprobación.");
      } else {
        setSuccess(data.action === "ESCAPE_MAZE" ? "Consumible usado. Has regresado a la habitación inicial del laberinto." : "Consumible usado.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo usar el consumible.");
    } finally {
      setItemUsing(null);
    }
  }

  function addSkillEffect() {
    setSkillForm((current) => ({ ...current, effect: [...current.effect, { type: "STAT_BONUS", target: "STR", value: 10, description: "" }] }));
  }

  function updateSkillEffect(index: number, key: keyof SkillEffect, value: string) {
    setSkillForm((current) => ({
      ...current,
      effect: current.effect.map((effect, effectIndex) => effectIndex === index
        ? { ...effect, [key]: key === "value" ? Number(value) : value }
        : effect),
    }));
  }

  async function submitSkill() {
    if (!character || skillSaving || skillCreationCredits <= 0) return;
    setSkillSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/characters/" + character.id + "/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(skillForm),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo enviar la habilidad.");
      setSkillCreationCredits((value) => Math.max(0, value - 1));
      setPendingSkills((current) => [data.skill, ...current]);
      setSkillModalOpen(false);
      setSkillForm({ name: "", cost: 0, accumulationCost: 0, accumulationPerTick: 0, maintenanceCost: 0, description: "", duration: "", category: "OFFENSIVE", areaOfEffect: "", speed: "", cooldown: "", condition: "", effect: [] });
      setSuccess("Habilidad enviada. Quedó pendiente de aprobación administrativa.");
      const refreshed = await fetch("/api/characters/" + character.id + "/skills", { cache: "no-store" });
      if (refreshed.ok) {
        const skillData = await refreshed.json();
        setSkills(skillData.skills ?? []);
        setPendingSkills(skillData.pendingSkills ?? []);
        setSkillCreationCredits(Number(skillData.skillCreationCredits ?? 0));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la habilidad.");
    } finally {
      setSkillSaving(false);
    }
  }

  function openSkillCreator() {
    if (skillCreationCredits <= 0) return;
    setSkillForm({ name: "", cost: 0, accumulationCost: 0, accumulationPerTick: 0, maintenanceCost: 0, description: "", duration: "", category: "OFFENSIVE", areaOfEffect: "", speed: "", cooldown: "", condition: "", effect: [] });
    setSkillModalOpen(true);
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

  async function saveCombatTypes() {
    if (!character || savingCombatTypes) return;
    setSavingCombatTypes(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/characters/" + character.id + "/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ magicAttackType: combatMagicAttackType, magicAttackDescription: combatMagicAttackDescription, blockDefenseType: combatBlockDefenseType, fieldDefenseType: combatFieldDefenseType, fieldDefenseDescription: combatFieldDefenseDescription }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar la configuración de combate.");
      setCharacter((current) => current ? { ...current, magicAttackType: data.magicAttackType, magicAttackDescription: data.magicAttackDescription ?? null, blockDefenseType: data.blockDefenseType, fieldDefenseType: data.fieldDefenseType, fieldDefenseDescription: data.fieldDefenseDescription ?? null } : current);
      setCombatMagicAttackType(data.magicAttackType ?? combatMagicAttackType);
      setCombatMagicAttackDescription(data.magicAttackDescription ?? combatMagicAttackDescription);
      setCombatBlockDefenseType(data.blockDefenseType ?? combatBlockDefenseType);
      setCombatFieldDefenseType(data.fieldDefenseType ?? combatFieldDefenseType);
      setCombatFieldDefenseDescription(data.fieldDefenseDescription ?? combatFieldDefenseDescription);
      setSuccess("Configuración de combate guardada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la configuración de combate.");
    } finally {
      setSavingCombatTypes(false);
    }
  }

  async function saveCharacterFlair() {
    if (!character || savingFlair) return;
    setSavingFlair(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/characters/" + character.id + "/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flair: characterFlair }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar el flair.");
      setCharacter((current) => current ? { ...current, flair: data.flair ?? null } : current);
      setCharacterFlair(data.flair ?? "");
      setSuccess("Flair actualizado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el flair.");
    } finally {
      setSavingFlair(false);
    }
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
      await navigator.clipboard.writeText(buildFichaWhatsApp(character));
      setCopied("ficha");
      setTimeout(() => setCopied(""), 2000);
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

    if (character.avatarUrl) {
      const avatarImage = new Image();
      avatarImage.crossOrigin = "anonymous";
      avatarImage.src = character.avatarUrl;
      await new Promise<void>((resolve) => {
        avatarImage.onload = () => resolve();
        avatarImage.onerror = () => resolve();
      });
      if (avatarImage.complete && avatarImage.naturalWidth > 0) {
        const imageRatio = avatarImage.naturalWidth / avatarImage.naturalHeight;
        const canvasRatio = width / height;
        let drawWidth = width;
        let drawHeight = height;
        let drawX = 0;
        let drawY = 0;
        if (imageRatio > canvasRatio) {
          drawWidth = height * imageRatio;
          drawX = (width - drawWidth) / 2;
        } else {
          drawHeight = width / imageRatio;
          drawY = (height - drawHeight) / 2;
        }
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, 0, width, height, 22);
        ctx.clip();
        ctx.drawImage(avatarImage, drawX, drawY, drawWidth, drawHeight);
        ctx.fillStyle = themePalette.primary + "8c";
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      } else {
        ctx.fillStyle = "#09090b";
        ctx.fillRect(0, 0, width, height);
      }
    } else {
      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, width, height);
    }

    ctx.strokeStyle = themePalette.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1, 1, width - 2, height - 2, 22);
    ctx.stroke();
    ctx.fillStyle = themePalette.muted;
    ctx.font = "600 12px Arial, sans-serif";
    ctx.letterSpacing = "3px";
    ctx.fillText("PERFIL", 28, 38);
    ctx.fillStyle = themePalette.foreground;
    ctx.font = "600 22px Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Distribución de estadísticas", width - 28, 38);
    ctx.textAlign = "center";

    const centerX = 380;
    const centerY = 380;
    const radius = 245;
    const effectiveStats = character.effectiveStats ?? character.stats;
    if (!character.avatarUrl && character.age !== null && character.gender !== null) {
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
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo cargar el personaje.");
        return response.json() as Promise<Character>;
      })
      .then((data) => {
        setCharacter(data);
        setCharacterFlair(data.flair ?? "");
        setCombatMagicAttackType(data.magicAttackType ?? "CUT");
         setCombatMagicAttackDescription(data.magicAttackDescription ?? "");
        setCombatBlockDefenseType(data.blockDefenseType ?? "CONCENTRATED");
        setCombatFieldDefenseType(data.fieldDefenseType ?? "CONCENTRATED");
         setCombatFieldDefenseDescription(data.fieldDefenseDescription ?? "");
        return data;
      })
      .then((data) => {
        if (!data?.avatarUrl || data?.themePalette) return;
        return paletteFromSource(data.avatarUrl)
          .then(async (palette) => {
            const themeResponse = await fetch("/api/characters/" + data.id + "/theme", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ palette }),
            });
            if (themeResponse.ok) {
              const themeData = await themeResponse.json();
              setCharacter((current) => current ? { ...current, themePalette: themeData.themePalette ?? palette } : current);
            }
          })
          .catch(() => undefined);
      })
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
    <main className="xahya-character-theme min-h-screen text-white" style={{ backgroundColor: themePalette.background, color: "#ffffff", "--theme-primary": themePalette.primary, "--theme-secondary": themePalette.secondary, "--theme-accent": themePalette.accent, "--theme-surface": themePalette.surface, "--theme-border": themePalette.border } as CSSProperties}>
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <h1 className="w-full text-4xl font-bold" style={{ color: themePalette.foreground, textShadow: "0 0 28px " + themePalette.primary + "55" }}>{character.name} {character.flair && <span className="text-2xl font-normal" style={{ color: themePalette.primary }}>⟨{character.flair}⟩</span>}</h1>
          {character.canLevelUp && <Link href={"/characters/" + character.id + "/levelup"} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300">Level Up</Link>}
          {character.canManageCharacter && <Link href={"/management?characterId=" + character.id} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white">Gestionar personaje</Link>}
          <button type="button" onClick={copyFichaToClipboard} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white">{copied === "ficha" ? "✓ Ficha copiada" : "Copiar ficha"}</button>
          <button type="button" onClick={exportProfileCard} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white">Exportar imagen</button>
        </div>
        {character.canSeeCharacterId && <p className="mt-2 text-zinc-500">Personaje #{character.id}</p>}

        <div className="xahya-floating-below-nav right-0 mt-2">
          <button
            type="button"
            onClick={() => setAvatarFlairOpen(true)}
            aria-label="Abrir avatar y flair"
            className="flex w-[76px] flex-col items-center gap-1.5 rounded-l-2xl border border-r-0 p-2.5 shadow-2xl backdrop-blur-md transition hover:w-[84px]"
            style={{
              borderColor: themePalette.border,
              backgroundColor: themePalette.surface + "ee",
              color: themePalette.foreground,
              boxShadow: "0 0 28px " + themePalette.primary + "22",
            }}
          >
            <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border-2 bg-zinc-950" style={{ borderColor: themePalette.primary }}>
              {character.avatarUrl
                ? <div className="relative h-full w-full">
                  {!avatarLoaded || avatarLoadError ? <CharacterSilhouette age={character.age ?? 18} gender={(character.gender as "masculino" | "femenino" | "indefinido") ?? "indefinido"} className="absolute inset-0 m-auto h-11 w-11 text-zinc-700" /> : null}
                  <img key={character.avatarUrl} src={character.avatarUrl} alt={"Avatar de " + character.name} decoding="async" onLoad={() => { setAvatarLoaded(true); setAvatarLoadError(false); }} onError={() => { setAvatarLoaded(false); setAvatarLoadError(true); }} className={"h-full w-full object-cover transition-opacity duration-150 " + (avatarLoaded && !avatarLoadError ? "opacity-100" : "opacity-0")} />
                </div>
                : <CharacterSilhouette age={character.age ?? 18} gender={(character.gender as "masculino" | "femenino" | "indefinido") ?? "indefinido"} className="h-11 w-11 text-zinc-700" />}
            </span>
            {character.flair && <span className="text-xl leading-none" aria-hidden="true">{character.flair}</span>}
          </button>
        </div>

        {avatarFlairOpen && (
          <div className="xahya-modal-overlay bg-black/55 backdrop-blur-[2px]" onMouseDown={() => setAvatarFlairOpen(false)}>
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Avatar y flair"
              className="absolute right-0 top-0 flex h-full w-[min(92vw,420px)] flex-col overflow-y-auto border-l p-6 shadow-2xl"
              style={{
                borderColor: themePalette.border,
                backgroundColor: themePalette.background,
                color: "#ffffff",
                boxShadow: "0 0 60px " + themePalette.primary + "33",
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: themePalette.muted }}>Personalización</p>
                  <h2 className="mt-1 text-2xl font-bold">Avatar y flair</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setAvatarFlairOpen(false)}
                  className="rounded-lg border px-3 py-2 text-sm transition hover:bg-white/5"
                  style={{ borderColor: themePalette.border, color: themePalette.foreground }}
                >
                  Cerrar
                </button>
              </div>

              <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: themePalette.border, backgroundColor: themePalette.surface + "aa" }}>
                <div className="flex justify-center">
                  <div className="flex h-56 w-56 items-center justify-center overflow-hidden rounded-2xl border-2 bg-zinc-950" style={{ borderColor: themePalette.primary, boxShadow: "0 0 32px " + themePalette.primary + "33" }}>
                    {character.avatarUrl
                      ? <div className="relative h-full w-full">
                        {!avatarLoaded || avatarLoadError ? <CharacterSilhouette age={character.age ?? 18} gender={(character.gender as "masculino" | "femenino" | "indefinido") ?? "indefinido"} className="absolute inset-0 m-auto h-40 w-40 text-zinc-700" /> : null}
                        <img key={character.avatarUrl} src={character.avatarUrl} alt={"Avatar de " + character.name} decoding="async" onLoad={() => { setAvatarLoaded(true); setAvatarLoadError(false); }} onError={() => { setAvatarLoaded(false); setAvatarLoadError(true); }} className={"h-full w-full object-cover transition-opacity duration-150 " + (avatarLoaded && !avatarLoadError ? "opacity-100" : "opacity-0")} />
                      </div>
                      : <CharacterSilhouette age={character.age ?? 18} gender={(character.gender as "masculino" | "femenino" | "indefinido") ?? "indefinido"} className="h-40 w-40 text-zinc-700" />}
                  </div>
                </div>
                <p className="mt-4 text-center text-2xl leading-none">{character.flair || "Sin flair"}</p>
              </div>

              <div className="mt-6">
                <h3 className="text-lg font-semibold">Avatar del personaje</h3>
                <p className="mt-1 text-sm" style={{ color: themePalette.muted }}>JPG, PNG o WebP. Se redimensiona a 512 px y se comprime automáticamente.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <label className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition hover:brightness-110" style={{ backgroundColor: themePalette.primary, color: themePalette.foreground }}>
                    {avatarBusy ? "Procesando..." : character.avatarUrl ? "Cambiar imagen" : "Subir imagen"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={avatarBusy} onChange={(e) => { const file = e.target.files?.[0]; e.currentTarget.value = ""; if (file) void uploadAvatar(file); }} />
                  </label>
                  {character.avatarUrl && <button type="button" onClick={removeAvatar} disabled={avatarBusy} className="rounded-lg border px-4 py-2 text-sm transition hover:bg-white/5 disabled:opacity-50" style={{ borderColor: themePalette.border, color: themePalette.foreground }}>Eliminar</button>}
                </div>
              </div>

              <div className="mt-8 border-t pt-6" style={{ borderColor: themePalette.border }}>
                <h3 className="text-lg font-semibold">Flair</h3>
                <p className="mt-1 text-sm" style={{ color: themePalette.muted }}>Emoji del personaje <span className="opacity-60">(máx. 2)</span></p>
                <div className="mt-4 flex flex-col gap-3">
                  <input
                    type="text"
                    maxLength={8}
                    value={characterFlair}
                    onChange={(event) => setCharacterFlair(event.target.value)}
                    disabled={savingFlair}
                    className="h-12 w-full rounded-xl border bg-zinc-950 px-4 text-2xl outline-none"
                    style={{ borderColor: themePalette.border, color: themePalette.foreground }}
                    placeholder="Ej. 🪞🗡️"
                  />
                  <button type="button" onClick={saveCharacterFlair} disabled={savingFlair} className="rounded-xl px-5 py-3 font-bold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40" style={{ backgroundColor: themePalette.primary, color: themePalette.foreground }}>
                    {savingFlair ? "Guardando..." : "Guardar flair"}
                  </button>
                </div>
              </div>
            </aside>
          </div>
        )}

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
              <div><p className="text-sm text-[color:var(--theme-muted)]">Edad</p><p className="mt-1 text-lg font-semibold">{character.age ?? "—"}{character.age !== null ? " años" : ""}</p></div>
              <div><p className="text-sm text-[color:var(--theme-muted)]">Género</p><p className="mt-1 text-lg font-semibold">{character.gender ? genderOptions.find((option) => option.value === character.gender)?.label ?? character.gender : "—"}</p></div>
              <div><p className="text-sm text-[color:var(--theme-muted)]">Altura</p><p className="mt-1 text-lg font-semibold">{character.height !== null ? character.height + " cm" : "—"}</p></div>
            </div>
          </section>
        )}


        <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="flex items-baseline justify-between gap-4">
            <div><h2 className="text-xl font-semibold">Equipamiento</h2><p className="mt-1 text-sm text-[color:var(--theme-muted)]">Objetos activos y sus ranuras.</p></div>
            <span className="text-xs text-zinc-600">{character.equipment.filter((entry) => entry.equipped).length} equipados</span>
          </div>
        {skillModalOpen && (
          <div className="xahya-modal-overlay flex items-center justify-center bg-black/75 p-4">
            <div className="xahya-modal-panel w-full max-w-3xl rounded-2xl border border-cyan-400/30 bg-zinc-950 p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">Crear habilidad</h2>
                  <p className="mt-1 text-sm text-zinc-500">Se enviará a administración. No aparecerá como aprobada hasta que un ADMIN la revise.</p>
                </div>
                <button type="button" onClick={() => setSkillModalOpen(false)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Cerrar</button>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-zinc-400">Nombre<input value={skillForm.name} onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" /></label>
                <label className="text-sm text-zinc-400">Coste<input type="number" min="0" value={skillForm.cost} onChange={(e) => setSkillForm({ ...skillForm, cost: Number(e.target.value) })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" /></label>
                <label className="text-sm text-zinc-400">Costo por acumulación<input type="number" min="0" value={skillForm.accumulationCost} onChange={(e) => setSkillForm({ ...skillForm, accumulationCost: Number(e.target.value) })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" /></label>
                <label className="text-sm text-zinc-400">Acumulaciones por tick<input type="number" min="0" value={skillForm.accumulationPerTick} onChange={(e) => setSkillForm({ ...skillForm, accumulationPerTick: Number(e.target.value) })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" /></label>
                <label className="text-sm text-zinc-400">Costo por turno (mantenimiento)<input type="number" min="0" value={skillForm.maintenanceCost} onChange={(e) => setSkillForm({ ...skillForm, maintenanceCost: Number(e.target.value) })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" /></label>
                <label className="text-sm text-zinc-400">Categoría<select value={skillForm.category} onChange={(e) => setSkillForm({ ...skillForm, category: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white">{skillCategories.map((category) => <option key={category[0]} value={category[0]}>{category[1]}</option>)}</select></label>
                <label className="text-sm text-zinc-400">Duración<input value={skillForm.duration} onChange={(e) => setSkillForm({ ...skillForm, duration: e.target.value })} placeholder="Ej. 3 turnos / Instantánea" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" /></label>
                <label className="text-sm text-zinc-400">Área de efecto<input value={skillForm.areaOfEffect} onChange={(e) => setSkillForm({ ...skillForm, areaOfEffect: e.target.value })} placeholder="Ej. Objetivo único / 5 m" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" /></label>
                <label className="text-sm text-zinc-400">Velocidad<input value={skillForm.speed} onChange={(e) => setSkillForm({ ...skillForm, speed: e.target.value })} placeholder="Ej. Instantánea / 1 turno" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" /></label>
                <label className="text-sm text-zinc-400">Cooldown<input value={skillForm.cooldown} onChange={(e) => setSkillForm({ ...skillForm, cooldown: e.target.value })} placeholder="Ej. 2 turnos" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" /></label>
                {skillForm.category === "PASSIVE" && <label className="text-sm text-zinc-400">Condición<input value={skillForm.condition} onChange={(e) => setSkillForm({ ...skillForm, condition: e.target.value })} placeholder="Ej. Mientras tenga más de 50% de HP" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" /></label>}
              </div>
              <label className="mt-4 block text-sm text-zinc-400">Descripción<textarea rows={4} value={skillForm.description} onChange={(e) => setSkillForm({ ...skillForm, description: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" /></label>

              <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold">Efecto</h3><p className="text-xs text-zinc-500">Ej. ofensiva: Ataque mágico ×2. Soporte: Fuerza ×1.5.</p></div><button type="button" onClick={addSkillEffect} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">+ Añadir</button></div>
                <div className="mt-4 space-y-3">
                  {skillForm.effect.map((effect, index) => {
                    const narrative = effect.type === "NARRATIVE";
                    return <div key={index} className="grid gap-2 sm:grid-cols-[170px_1fr_100px_auto]">
                      <select value={effect.type} onChange={(e) => updateSkillEffect(index, "type", e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm">{skillEffectTypes.map((type) => <option key={type[0]} value={type[0]}>{type[1]}</option>)}</select>
                      {narrative
                        ? <input value={effect.description ?? ""} onChange={(e) => updateSkillEffect(index, "description", e.target.value)} placeholder="Qué ocurre en rol" className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm" />
                        : <select value={effect.target ?? "MAGIC_ATK"} onChange={(e) => updateSkillEffect(index, "target", e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm">{skillTargets.map((target) => <option key={target[0]} value={target[0]}>{target[1]}</option>)}</select>}
                      {!narrative ? <input type="number" step="0.01" value={effect.value ?? 0} onChange={(e) => updateSkillEffect(index, "value", e.target.value)} placeholder={effect.type === "DAMAGE_MULTIPLIER" ? "200 = ×2" : "Valor"} className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm" /> : <span />}
                      <button type="button" onClick={() => setSkillForm((current) => ({ ...current, effect: current.effect.filter((_, effectIndex) => effectIndex !== index) }))} className="rounded-lg border border-red-900/60 px-2 py-2 text-sm text-red-300">Quitar</button>
                    </div>;
                  })}
                  {!skillForm.effect.length && <p className="text-sm text-zinc-600">Sin efectos estructurados.</p>}
                </div>
              </div>
              <button type="button" onClick={submitSkill} disabled={skillSaving || !skillForm.name.trim() || !skillForm.description.trim() || skillCreationCredits <= 0} className="mt-5 w-full rounded-lg bg-cyan-400 px-4 py-3 font-bold text-zinc-950 disabled:opacity-40">
                {skillSaving ? "Enviando..." : "Enviar para aprobación"}
              </button>
            </div>
          </div>
        )}

        {character.equipment.some((entry) => entry.equipped) ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {character.equipment.filter((entry) => entry.equipped).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-emerald-400/15 bg-zinc-950/50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: themePalette.foreground }}>{entry.item?.name ?? "Objeto"}</p>
                      <p className="mt-1 text-xs text-zinc-500">{equipmentSlots.find((slot) => slot[0] === entry.equippedSlot)?.[1] ?? entry.equippedSlot ?? "Ranura"}</p>
                    </div>
                    <span className="rounded-full border border-emerald-400/20 px-2 py-1 text-xs text-emerald-300">Equipado</span>
                  </div>
                  {entry.item?.description && <p className="mt-3 text-sm text-zinc-400">{entry.item.description}</p>}
                  {entry.flair && <p className="mt-2 text-xs italic text-violet-300">✦ {entry.flair}</p>}
                  {character.isAdmin && (
                    <input
                      key={entry.flair ?? ""}
                      defaultValue={entry.flair ?? ""}
                      maxLength={500}
                      placeholder="Flair del objeto"
                      disabled={flairSaving !== null}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value !== (entry.flair ?? "")) saveFlair(entry.id, value);
                      }}
                      className="mt-3 w-full rounded-lg border border-violet-900/60 bg-zinc-950 px-3 py-2 text-xs text-white outline-none focus:border-violet-400"
                    />
                  )}
                  <button type="button" onClick={() => changeEquipment(entry.id, false)} disabled={equipmentBusy !== null} className="mt-4 w-full rounded-lg border border-red-900/70 px-3 py-2 text-xs text-red-300 disabled:opacity-50">Desequipar</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm text-zinc-500">No tienes objetos equipados.</p>
          )}
        </section>

        <div className="xahya-floating-combat-tab right-0">
          <button
            type="button"
            onClick={() => setCombatPanelOpen(true)}
            aria-label="Abrir perks y combate"
            className="flex h-12 w-12 items-center justify-center rounded-l-xl border border-r-0 text-2xl shadow-2xl backdrop-blur-md transition hover:w-14"
            style={{
              borderColor: themePalette.border,
              backgroundColor: themePalette.surface + "ee",
              color: themePalette.foreground,
              boxShadow: "0 0 24px " + themePalette.primary + "22",
            }}
          >
            ⚔️
          </button>
        </div>

        {combatPanelOpen && (
          <div className="xahya-modal-overlay bg-black/60 backdrop-blur-[2px]" onMouseDown={() => setCombatPanelOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Perks, combate básico y habilidades"
              className="xahya-modal-panel mx-auto my-4 w-[min(96vw,1100px)] rounded-2xl border p-5 shadow-2xl sm:p-6"
              style={{
                borderColor: themePalette.border,
                backgroundColor: themePalette.background,
                color: "#ffffff",
                boxShadow: "0 0 60px " + themePalette.primary + "33",
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b pb-4" style={{ borderColor: themePalette.border }}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: themePalette.muted }}>Combate</p>
                  <h2 className="mt-1 text-2xl font-bold">Perks, combate y habilidades</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setCombatPanelOpen(false)}
                  className="rounded-lg border px-3 py-2 text-sm transition hover:bg-white/5"
                  style={{ borderColor: themePalette.border, color: themePalette.foreground }}
                >
                  Cerrar
                </button>
              </div>
          <section className="mt-10 rounded-2xl border border-violet-400/20 bg-violet-400/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div><h2 className="text-xl font-semibold">Raza</h2><p className="mt-1 text-sm text-zinc-500">La raza es permanente y otorga las perks configuradas para ella.</p></div>
              {!character.race && <button type="button" onClick={() => setRacePickerOpen(true)} className="rounded-lg bg-violet-400 px-4 py-2 font-semibold text-zinc-950">Elegir raza</button>}
            </div>
            {character.race ? (
              <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 sm:flex-row">
                <div className="h-32 w-full overflow-hidden rounded-xl bg-zinc-950 sm:w-44">{character.race.imagePath && <img src={character.race.imagePath} alt={character.race.name} className="h-full w-full object-cover" />}</div>
                <div><h3 className="text-2xl font-bold">{character.race.name}</h3>{character.race.description&&<p className="mt-2 text-sm text-zinc-400">{character.race.description}</p>}</div>
              </div>
            ) : <p className="mt-5 text-sm text-zinc-500">Todavía no has elegido una raza.</p>}
          </section>

          {racePickerOpen && !character.race && (
            <div className="xahya-modal-overlay flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-sm">
              <div className="w-full max-w-5xl rounded-3xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl sm:p-8">
                <div className="text-center"><p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-400">Origen del personaje</p><h2 className="mt-2 text-3xl font-bold">Elige tu raza</h2><p className="mt-2 text-sm text-zinc-500">La elección es permanente.</p></div>
                <div className="mt-7 flex snap-x snap-mandatory gap-5 overflow-x-auto px-3 pb-5 pt-3">
                  {races.map((race,index)=><article key={race.id} className={`w-[min(78vw,330px)] shrink-0 snap-center overflow-hidden rounded-3xl border border-violet-400/25 bg-zinc-900 shadow-2xl transition-transform ${index%3===0?"-rotate-2":index%3===1?"translate-y-2":"rotate-2"}`}>
                    <div className="aspect-[4/3] bg-zinc-950">{race.imagePath?<img src={race.imagePath} alt={race.name} className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center text-zinc-700">Sin imagen</div>}</div>
                    <div className="p-5"><h3 className="text-2xl font-bold">{race.name}</h3>{race.description&&<p className="mt-2 text-sm leading-6 text-zinc-400">{race.description}</p>}
                      <div className="mt-4 space-y-2">{race.perks.map(perk=><div key={perk.id} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3"><p className="font-semibold">{perk.name}</p>{perk.description&&<p className="mt-1 text-xs text-zinc-500">{perk.description}</p>}</div>)}</div>
                      <button type="button" onClick={()=>chooseExistingCharacterRace(race.id)} disabled={raceSaving} className="mt-5 w-full rounded-xl bg-violet-400 px-5 py-3 font-bold text-zinc-950 disabled:opacity-40">{raceSaving?"Eligiendo...":"Elegir"}</button>
                    </div>
                  </article>)}
                </div>
                <button type="button" onClick={()=>setRacePickerOpen(false)} className="mt-2 w-full rounded-xl border border-zinc-700 px-5 py-3 text-zinc-300">Cancelar</button>
              </div>
            </div>
          )}

          <section className="mt-10 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><h2 className="text-xl font-semibold">Perks</h2><p className="mt-1 text-sm text-zinc-500">Beneficios permanentes obtenidos por el personaje.</p></div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-600">{creationPerkCount}/3 de creación</span>
              {creationPerkCount < 3 && (
                <button
                  type="button"
                  onClick={recoverCreationPerks}
                  disabled={perkRecoveryBusy}
                  className="rounded-lg border border-amber-400/40 px-3 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {perkRecoveryBusy ? "Recuperando..." : "Obtener perks de creación"}
                </button>
              )}
            </div>
          </div>
          {character.perks.length > 0 ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {character.perks.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="font-semibold">{entry.perk?.name ?? "Perk"}</p>
                  {entry.perk?.description && <p className="mt-2 text-sm text-zinc-400">{entry.perk.description}</p>}
                  <p className="mt-2 text-xs text-zinc-600">{entry.source === "CREATION_ROLL" ? "Obtenido al crear personaje" : "Otorgado por gestión"}</p>
                </div>
              ))}
            </div>
          ) : <p className="mt-5 text-sm text-zinc-500">No tiene perks.</p>}
        </section>

        <section className="mt-6 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6">
  <h2 className="text-xl font-semibold">Combate básico</h2>
  <p className="mt-1 text-sm text-zinc-500">Las acciones básicas forman la base del futuro sistema de combate.</p>
  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><p className="text-xs text-zinc-500">⚔️ Ataque físico</p><p className="mt-1 text-lg font-semibold">Depende del arma equipada</p></div>
    <label className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><p className="text-xs text-zinc-500">✨ Ataque básico mágico</p><select value={combatMagicAttackType} onChange={(e) => setCombatMagicAttackType(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"><option value="CUT">🗡️ Corte</option><option value="BLUNT">🔨 Contundente</option><option value="PIERCE">🪡 Penetración</option></select><textarea value={combatMagicAttackDescription} onChange={(e) => setCombatMagicAttackDescription(e.target.value)} maxLength={500} rows={3} placeholder="Describe cómo funciona tu ataque mágico básico..." className="mt-3 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" /></label>
    <label className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><p className="text-xs text-zinc-500">🛡️ Defensa de bloqueo físico</p><select value={combatBlockDefenseType} onChange={(e) => setCombatBlockDefenseType(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"><option value="CONCENTRATED">🟢 Concentrada</option><option value="DISPERSED">🟡 Dispersa</option><option value="SOLID">🔴 Sólida</option></select></label><label className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><p className="text-xs text-zinc-500">🔮 Campo defensivo mágico</p><select value={combatFieldDefenseType} onChange={(e) => setCombatFieldDefenseType(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"><option value="CONCENTRATED">🟢 Concentrada</option><option value="DISPERSED">🟡 Dispersa</option><option value="SOLID">🔴 Sólida</option></select><textarea value={combatFieldDefenseDescription} onChange={(e) => setCombatFieldDefenseDescription(e.target.value)} maxLength={500} rows={3} placeholder="Describe cómo funciona tu campo defensivo mágico..." className="mt-3 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm" /></label><div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><p className="text-xs text-zinc-500">💨 Esquivar · 🛡️ Bloquear · 🔮 Campo</p><p className="mt-1 text-lg font-semibold">Acciones básicas</p></div>
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 sm:col-span-2 lg:col-span-3"><p className="text-xs text-zinc-500">Puntos de acción</p><p className="mt-1 text-2xl font-semibold">9 + CON = {9 + Number(character.effectiveStats?.constitution ?? character.stats?.constitution ?? 0)}</p><p className="mt-1 text-xs text-zinc-600">La Constitución determina cuántas acciones puede realizar el personaje por ciclo de combate.</p></div>
  </div>
  <button type="button" onClick={saveCombatTypes} disabled={savingCombatTypes} className="mt-4 rounded-xl bg-cyan-400 px-5 py-3 font-bold text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">{savingCombatTypes ? "Guardando..." : "Guardar configuración de combate"}</button>
</section>

<section className="mt-10 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Habilidades</h2>
              <p className="mt-1 text-sm" style={{ color: themePalette.muted }}>Abre el menú para consultar tus habilidades sin ocupar espacio permanente en la ficha.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {skillCreationCredits > 0 && (
                <button type="button" onClick={openSkillCreator} className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-zinc-950">
                  Crear habilidad · {skillCreationCredits}
                </button>
              )}
              <button type="button" onClick={() => setSkillsOpen((value) => !value)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200">
                {skillsOpen ? "Cerrar menú" : "Abrir menú"}
              </button>
            </div>
          </div>

          {skillsOpen && (
            <div className="mt-5 space-y-4">
              {skills.length === 0 && pendingSkills.length === 0 && (
                <p className="text-sm text-zinc-500">Todavía no tienes habilidades aprobadas.</p>
              )}

              {skills.map((skill) => (
                <div key={skill.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold" style={{ color: themePalette.foreground }}>{skill.name}</h3>
                      <p className="mt-1 text-xs" style={{ color: themePalette.muted }}>
                        {skillCategories.find((category) => category[0] === skill.category)?.[1] ?? skill.category}
                        {" · "}Coste {skill.cost}{Number(skill.maintenanceCost ?? 0) > 0 ? " · Mantenimiento/turno " + skill.maintenanceCost : ""}{Number(skill.accumulationPerTick ?? 0) > 0 ? " · +" + skill.accumulationPerTick + " acumulación/tick" : ""}
                      </p>
                    </div>
                    <span className="rounded-full border border-emerald-400/25 px-2 py-1 text-xs text-emerald-300">Aprobada</span>
                  </div>
                  <p className="mt-3 text-sm text-zinc-300 whitespace-pre-wrap">{skill.description}</p>
                  <div className="mt-3 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2 lg:grid-cols-4">
                    {skill.duration && <span>⏳ Duración: {skill.duration}</span>}
                    {skill.areaOfEffect && <span>◎ Área: {skill.areaOfEffect}</span>}
                    {skill.speed && <span>⚡ Velocidad: {skill.speed}</span>}
                    {skill.cooldown && <span>↻ Cooldown: {skill.cooldown}</span>}
                    {Number(skill.maintenanceCost ?? 0) > 0 && <span>⟳ Mantenimiento/turno: {skill.maintenanceCost}</span>}
                    {Number(skill.accumulationPerTick ?? 0) > 0 && (() => { const state = skillStates.find((entry) => entry.skillId === skill.id); return <span>◉ Acumulaciones: {state?.accumulations ?? 0} · {skill.accumulationPerTick}/tick</span>; })()}
                  </div>
                  {skill.condition && <p className="mt-3 text-xs text-amber-300">Condición: {skill.condition}</p>}
                  {Number(skill.accumulationPerTick ?? 0) > 0 && (() => { const state = skillStates.find((entry) => entry.skillId === skill.id); const active = Boolean(state?.active); return <button type="button" onClick={() => toggleSkillAccumulation(skill.id, !active)} className={"mt-3 rounded-lg border px-3 py-2 text-xs font-semibold " + (active ? "border-rose-400/30 text-rose-300" : "border-cyan-400/30 text-cyan-300")}>{active ? "Detener acumulación" : "Iniciar acumulación"}{state ? " · " + state.accumulations + " cargas" : ""}</button>; })()}
                  {skill.effect?.length > 0 && (
                    <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Efecto</p>
                      <div className="mt-2 space-y-1.5 text-sm">
                        {skill.effect.map((effect, index) => {
                          if (effect.type === "NARRATIVE") return <p key={index} className="text-zinc-300">• {effect.description}</p>;
                          const targetLabel = skillTargets.find((target) => target[0] === effect.target)?.[1] ?? effect.target ?? "Objetivo";
                          if (effect.type === "DAMAGE_MULTIPLIER") {
                            const targetValue = effect.target === "MAGIC_ATK"
                              ? (character.derivedStats?.magicAttack ?? 0) * allAttackMultiplier
                              : effect.target === "PHYS_ATK"
                                ? (character.derivedStats?.physicalAttack ?? 0) * allAttackMultiplier
                                : null;
                            const shown = targetValue !== null ? " = " + formatNumber(targetValue * Number(effect.value ?? 0) / 100) : "";
                            return <p key={index} className="text-rose-300">• Daño: {targetLabel} ×{formatNumber(Number(effect.value ?? 0) / 100)}{shown}</p>;
                          }
                          if (effect.type === "STAT_MULTIPLIER") return <p key={index} className="text-cyan-300">• {targetLabel} ×{formatNumber(Number(effect.value ?? 1))}</p>;
                          return <p key={index} className="text-cyan-300">• {targetLabel} {Number(effect.value ?? 0) >= 0 ? "+" : ""}{formatNumber(Number(effect.value ?? 0))}</p>;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {pendingSkills.length > 0 && (
                <div className="rounded-xl border border-amber-400/20 bg-amber-950/10 p-4">
                  <p className="font-semibold text-amber-300">Solicitudes pendientes</p>
                  <div className="mt-3 space-y-2">
                    {pendingSkills.map((skill) => (
                      <div key={skill.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{skill.name}</span>
                          <span className="text-xs text-amber-300">{skill.status === "REJECTED" ? "Rechazada" : "Pendiente"}</span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">{skill.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>


            </div>
          </div>
        )}
        {character.properties?.length > 0 && (
        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold">Propiedades</h2>
          <p className="mt-1 text-sm text-[color:var(--theme-muted)]">Bienes adquiridos por este personaje.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {character.properties.map((property) => <article key={property.id} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/50">
              {property.item?.imageUrl && <img src={property.item.imageUrl} alt={property.item.name} className="h-40 w-full object-cover" />}
              <div className="p-4"><p className="font-semibold">{property.item?.name ?? "Propiedad"}</p>{property.item?.description && <p className="mt-2 text-sm text-zinc-500">{property.item.description}</p>}<p className="mt-3 text-xs text-zinc-600">Adquirida por ◈ {property.purchasePrice.toLocaleString("es-MX")}</p></div>
            </article>)}
          </div>
        </section>
        )}

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="flex items-baseline justify-between gap-4">
            <div><h2 className="text-xl font-semibold">Inventario</h2><p className="mt-1 text-sm text-[color:var(--theme-muted)]">Todos los objetos que posee el personaje.</p></div>
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
                        <p className="mt-1 text-xs" style={{ color: themePalette.muted }}>Cantidad: {entry.quantity}</p>
                      </div>
                      {entry.equipped && <span className="rounded-full border border-emerald-400/20 px-2 py-1 text-xs text-emerald-300">Equipado</span>}
                    </div>
                    {entry.item && (
                      <div className="mt-3 space-y-1 text-xs text-zinc-500">
                        <p>Tipo: {entry.item.itemType}</p>
                        {entry.item.description && <p className="pt-1 text-sm text-zinc-400">{entry.item.description}</p>}
                      </div>
                    )}
                    {entry.flair && <p className="mt-3 text-xs italic text-violet-300">✦ {entry.flair}</p>}
                    {entry.item?.itemType === "CONSUMABLE" && Array.isArray(entry.item.effects) && entry.item.effects.some((effect: any) => effect?.type === "system_action" && ["ESCAPE_MAZE", "DISARM_MAZE_TRAP", "RELEASE_MAZE_TRAPPED", "CREATE_SKILL"].includes(effect?.action)) && (
                      <button type="button" onClick={() => useConsumable(entry.id, entry.item?.name ?? "Consumible")} disabled={itemUsing !== null} className="mt-3 w-full rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50">
                        {itemUsing === entry.id ? "Usando..." : entry.item?.effects?.some((effect: any) => effect?.action === "CREATE_SKILL") ? "Crear habilidad" : "Usar"}
                      </button>
                    )}
                    {character.isAdmin && (
                      <button type="button" onClick={() => deleteInventoryItem(entry.id)} disabled={inventoryDeleting !== null} className="mt-3 w-full rounded-lg border border-red-900/70 px-3 py-2 text-xs text-red-300 disabled:opacity-50">
                        {inventoryDeleting === entry.id ? "Eliminando..." : "Eliminar objeto"}
                      </button>
                    )}
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
          <section className="theme-card mt-10 grid gap-6 rounded-2xl border p-5 lg:grid-cols-[1fr_0.85fr] lg:items-center" style={{ borderColor: themePalette.border, backgroundColor: themePalette.surface + "66" }}>
            <div>
              <h2 className="text-xl font-semibold">Estadísticas base</h2>
              <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(statLabels).map(([key, label]) => (
                  <div key={key} className="flex items-baseline justify-between gap-3 border-b border-zinc-800/80 py-2">
                    <p className="text-sm text-zinc-400">{label}</p>
                    <div className="text-right"><span className="text-lg font-semibold text-white">{formatNumber(applyTemporaryEffects(key, character.effectiveStats?.[key] ?? character.stats?.[key as keyof typeof character.stats] ?? 0))}</span>{character.effectiveStats && character.effectiveStats[key] !== character.stats?.[key as keyof typeof character.stats] && <span className="ml-2 text-xs text-amber-300">({formatNumber(character.stats?.[key as keyof typeof character.stats] ?? 0)})</span>}{temporaryEffects.some((effect) => effect.target === key) && <span className="ml-2 text-xs text-violet-300">◈ temporal</span>}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 pb-12">
              {character.avatarUrl ? (
                <>
                  <div className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: "url(" + character.avatarUrl + ")" }} />
                  <div
                    className="pointer-events-none absolute inset-0 z-[1]"
                    style={{ backgroundColor: hexToRgba(themePalette.overlayPrimary || themePalette.primary, 0.6) }}
                  />
                </>
              ) : character.age !== null && character.gender !== null ? (
                <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
                  <CharacterSilhouette
                    age={character.age}
                    gender={character.gender as "masculino" | "femenino" | "indefinido"}
                    className="h-[125%] w-auto text-zinc-400"
                  />
                </div>
              ) : null}
              <div className="relative z-10" style={{ color: themePalette.foreground }}>
                <div className="flex items-center justify-start gap-2" aria-label="Xahya">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 p-1">
                    <img src="/sakura-petal.svg" alt="" className="h-full w-full object-contain" />
                  </span>
                  <span className="text-lg font-semibold tracking-tight">Xahya</span>
                </div>
                <div className="mt-3"><StatsRadar baseValues={baseRadarValues!} values={radarValues} palette={themePalette} /></div>
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
                const displayedValue = applyTemporaryEffects(key, affectedByAttackMultiplier ? value * allAttackMultiplier : value);
                return <div key={key} className="flex items-baseline justify-between gap-3 border-b border-zinc-800/80 py-2">
                  <p className="text-sm text-zinc-400">{derivedLabels[key] ?? key}</p>
                  <p className="text-lg font-semibold">{formatNumber(displayedValue)}{affectedByAttackMultiplier && allAttackMultiplier !== 1 && <span className="ml-2 text-xs text-amber-300">(base {formatNumber(value)} · ×{formatNumber(allAttackMultiplier)})</span>}{temporaryEffects.some((effect) => effect.target === key) && <span className="ml-2 text-xs text-violet-300">◈ temporal</span>}</p>
                </div>;
              })}
            </div>
          </section>
        )}

        {character.combatEffects.length > 0 && (
  
        <section className="mt-10 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6">
          <div className="flex items-baseline justify-between gap-4">
            <div><h2 className="text-xl font-semibold">Estado de rol</h2><p className="mt-1 text-sm text-[color:var(--theme-muted)]">HP, Mana y efectos temporales. Nada de esta sección se guarda en la ficha.</p></div>
            <button type="button" onClick={() => setTemporaryEffects([])} disabled={!temporaryEffects.length} className="text-xs text-zinc-500 hover:text-white disabled:opacity-30">Limpiar efectos</button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-zinc-400">❤️ HP actual
              <input type="number" min="0" max={maxHp} value={currentHp} onChange={(e) => setCurrentHp(Math.min(maxHp, Math.max(0, Number(e.target.value) || 0)))} className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-white" />
            </label>
            <label className="text-sm text-zinc-400">🔷 Mana actual
              <input type="number" min="0" max={maxMana} value={currentMana} onChange={(e) => setCurrentMana(Math.min(maxMana, Math.max(0, Number(e.target.value) || 0)))} className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-white" />
            </label>
          </div>
          <p className="mt-3 text-xs text-zinc-500">Los cambios de HP y Mana se reflejan inmediatamente en el estado; no necesitas aplicar un efecto.</p>
          <button type="button" onClick={copyEstadoToClipboard} className="mt-4 w-full rounded-xl border border-violet-700/60 px-4 py-3 text-sm font-semibold text-violet-200 transition hover:bg-violet-900/20">
            {copied === "estado" ? "✓ Estado copiado" : "Copiar estado actual"}
          </button>
          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_140px_120px_1fr_auto]">
            <select value={effectTarget} onChange={(e) => setEffectTarget(e.target.value)} className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-white">
              {Object.entries(statLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              {Object.entries(derivedLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <select value={effectMode} onChange={(e) => setEffectMode(e.target.value as "percent" | "flat")} className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-white">
              <option value="percent">Porcentaje</option><option value="flat">Plano</option>
            </select>
            <input type="number" value={effectValue} onChange={(e) => setEffectValue(e.target.value)} className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-white" placeholder="Valor" />
            <input type="text" value={effectLabel} onChange={(e) => setEffectLabel(e.target.value)} className="h-11 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-white" placeholder="Ej. Debuff del enemigo" />
            <button type="button" onClick={addTemporaryEffect} disabled={!effectLabel.trim() || effectValue === "" || Number(effectValue) === 0} className="rounded-xl bg-violet-400 px-4 py-2 font-bold text-zinc-950 disabled:opacity-40">Aplicar</button>
          </div>
          {temporaryEffects.length > 0 && (
            <div className="mt-4 space-y-2">
              {temporaryEffects.map((effect) => (
                <div key={effect.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm">
                  <span>{effect.label} · {effect.mode === "percent" ? (effect.value > 0 ? "+" : "") + formatNumber(effect.value) + "%" : (effect.value > 0 ? "+" : "") + formatNumber(effect.value)} {statLabels[effect.target] ?? derivedLabels[effect.target] ?? effect.target} <span className="text-zinc-500">→ {formatNumber(applyTemporaryEffects(effect.target, character.effectiveStats?.[effect.target] ?? character.derivedStats?.[effect.target] ?? character.stats?.[effect.target as keyof typeof character.stats] ?? 0))}</span></span>
                  <button type="button" onClick={() => removeTemporaryEffect(effect.id)} className="text-red-300 hover:text-red-200">Quitar</button>
                </div>
              ))}
            </div>
          )}
        </section>
        )}

        {character.maze && (
          <section className="mt-6 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-violet-300/70">Exploración activa</p>
                <h2 className="mt-1 text-xl font-semibold">Está dentro de {character.maze.name}</h2>
                <p className="mt-1 text-sm text-zinc-400">Habitación #{character.maze.roomNumber ?? "?"}</p>
              </div>
              <Link href={"/maze?mazeId=" + character.maze.id + "&characterId=" + character.id} className="rounded-lg border border-violet-400/30 px-4 py-2 text-sm text-violet-200 hover:bg-violet-400/10">
                Ver laberinto
              </Link>
            </div>
          </section>
        )}

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

        {knownCharacters.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">Dar a otro personaje</h2>
            <p className="mt-1 text-sm text-zinc-500">Solo puedes entregar dinero u objetos a personajes que conoces.</p>
            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="text-sm text-zinc-400">Destinatario</span>
                  <select value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
                    <option value="">Selecciona un personaje</option>
                    {knownCharacters.map((known) => <option key={known.id} value={known.id}>{known.name}</option>)}
                  </select>
                </label>
                <label className="block"><span className="text-sm text-zinc-400">Objeto</span>
                  <select value={transferItem} onChange={(e) => { setTransferItem(e.target.value); setTransferMoney(0); }} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">
                    <option value="">Ninguno — entregar dinero</option>
                    {character.equipment.filter((entry) => !entry.equipped).map((entry) => <option key={entry.id} value={entry.id}>{entry.item?.name ?? "Objeto"} ×{entry.quantity}{entry.flair ? " — " + entry.flair : ""}</option>)}
                  </select>
                </label>
                {transferItem ? (
                  <label className="block"><span className="text-sm text-zinc-400">Cantidad</span>
                    <input type="number" min={1} value={transferQuantity} onChange={(e) => setTransferQuantity(Math.max(1, Math.trunc(Number(e.target.value) || 1)))} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" />
                  </label>
                ) : (
                  <label className="block"><span className="text-sm text-zinc-400">Dinero</span>
                    <input type="number" min={0} value={transferMoney} onChange={(e) => setTransferMoney(Math.max(0, Math.trunc(Number(e.target.value) || 0)))} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" />
                  </label>
                )}
              </div>
              <button type="button" onClick={transfer} disabled={transferBusy || !transferTarget || (!transferItem && transferMoney <= 0)} className="mt-4 w-full rounded-lg bg-white px-5 py-3 font-medium text-black disabled:opacity-40">
                {transferBusy ? "Entregando..." : "Dar"}
              </button>
            </div>
          </section>
        )}

        {character.resources && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">Recursos</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><p className="text-sm text-zinc-500">Karma</p><p className="mt-1 text-2xl font-semibold">{character.resources.karma}</p></div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><p className="text-sm text-zinc-500">Dinero</p><p className="mt-1 text-2xl font-semibold">{character.resources.money.toLocaleString("es-MX")}</p></div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"><p className="text-sm text-zinc-500">Puntos de Level Up</p><p className="mt-1 text-2xl font-semibold">{character.resources.levelUpPoints}</p></div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}