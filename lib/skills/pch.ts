export type PricedEffect = { type?: string; target?: string; value?: number; description?: string; element?: string };

// Costes iniciales configurables: el administrador conserva la última palabra.
export const BASE_COST: Record<string, number> = {
  NARRATIVE: 5,
  SUMMON_MIRROR: 5,
  MIRROR_RAY: 6,
  MAGIC_REFLECTION: 8,
  STAT_BONUS: 2,
  STAT_MULTIPLIER: 5,
  DAMAGE_MULTIPLIER: 6,
  DAMAGE_REDUCTION: 5,
  DAMAGE_INCREASE: 4,
  RESOURCE_BONUS: 4,
  COMBAT_MULTIPLIER: 6,
  EQUIPMENT_SLOT_CAP: 12,
  IGNORE_PHYS_DEF_MULTIPLIER: 8,
  IGNORE_PHYS_DEF_BONUS: 5,
  IGNORE_MAGIC_DEF_MULTIPLIER: 8,
  IGNORE_MAGIC_DEF_BONUS: 5,
  IGNORE_ALL_DEF_MULTIPLIER: 12,
  IGNORE_ALL_DEF_BONUS: 8,
  FINAL_DAMAGE_MULTIPLIER: 10,
  FINAL_DAMAGE_BONUS: 6,
  MAZE_UTILITY: 8,
  // Backward-compatible legacy types.
  HEAL: 3,
  DAMAGE: 3,
};

/** Skill multiplier values are stored as percentages: 100 means x1, 150 means x1.5. */
export function skillEffectMultiplier(type: string, value: number): number {
  return type.endsWith("_MULTIPLIER") ? value / 100 : value;
}

export type EffectPricing = { base: number; step: number; enabled: boolean };
export type EffectPricingMap = Record<string, EffectPricing>;
export function defaultEffectPricing(): EffectPricingMap {
  return Object.fromEntries(Object.entries(BASE_COST).map(([type, base]) => [type, { base, step: 1, enabled: true }]));
}

export const ELEMENT_PCH_COST = 2;
export const EFFECT_ELEMENTS = ["NEUTRAL","FIRE","WATER","EARTH","AIR","ICE","LIGHTNING","LIGHT","DARK"] as const;
export const EFFECT_ELEMENT_LABELS: Record<string,string> = {NEUTRAL:"Neutro",FIRE:"Fuego",WATER:"Agua",EARTH:"Tierra",AIR:"Aire",ICE:"Hielo",LIGHTNING:"Rayo",LIGHT:"Luz",DARK:"Oscuridad"};
export function elementPchCost(element?: string): number {
  if (!element || element === "NEUTRAL") return 0;
  if (!EFFECT_ELEMENTS.some(allowed => allowed === element)) throw new Error("Elemento de efecto inválido");
  return ELEMENT_PCH_COST;
}

export function effectPchCost(effect: PricedEffect, pricing?: EffectPricingMap): number {
  const type = String(effect?.type ?? "");
  const base = pricing?.[type]?.base ?? BASE_COST[type];
  if (base === undefined) throw new Error(`Tipo de efecto sin precio PCH: ${type}`);
  if (type === "NARRATIVE") return base + elementPchCost(effect.element);
  const raw = Number(effect?.value ?? (type.endsWith("_MULTIPLIER") ? 100 : 1));
  const power = skillEffectMultiplier(type, raw);
  if (!Number.isFinite(power) || power < 0) throw new Error("Potencia de efecto inválida");
  const steps = type.endsWith("_MULTIPLIER")
    ? Math.max(0, Math.ceil((power - 1) / 0.5 - 1e-9))
    : (power > 1 ? Math.ceil(Math.log2(power)) : 0);
  return base + steps * (pricing?.[type]?.step ?? 1) + elementPchCost(effect.element);
}

export function calculateSkillPch(effects: PricedEffect[], pricing?: EffectPricingMap): number {
  if (!Array.isArray(effects)) return 0;
  return effects.reduce((total, effect) => total + effectPchCost(effect, pricing), 0);
}

export const PCH_PER_COIN = 10;
