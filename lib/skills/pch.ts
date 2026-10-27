export type PricedEffect = { type?: string; target?: string; value?: number; description?: string };

// Costes iniciales configurables: el administrador conserva la última palabra.
export const BASE_COST: Record<string, number> = {
  NARRATIVE: 5,
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

export function effectPchCost(effect: PricedEffect): number {
  const type = String(effect?.type ?? "");
  const base = BASE_COST[type];
  if (base === undefined) throw new Error(`Tipo de efecto sin precio PCH: ${type}`);
  if (type === "NARRATIVE") return base;
  const raw = Number(effect?.value ?? (type.endsWith("_MULTIPLIER") ? 100 : 1));
  const power = skillEffectMultiplier(type, raw);
  if (!Number.isFinite(power) || power < 0) throw new Error("Potencia de efecto inválida");
  return base + (power > 1 ? Math.ceil(Math.log2(power)) : 0);
}

export function calculateSkillPch(effects: PricedEffect[]): number {
  if (!Array.isArray(effects)) return 0;
  return effects.reduce((total, effect) => total + effectPchCost(effect), 0);
}

export const PCH_PER_COIN = 10;
