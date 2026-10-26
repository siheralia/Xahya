export type PricedEffect = { type?: string; target?: string; value?: number; description?: string };

// Costes iniciales configurables: el administrador conserva la última palabra.
const BASE_COST: Record<string, number> = {
  NARRATIVE: 5,
  STAT_BONUS: 2,
  STAT_MULTIPLIER: 4,
  DAMAGE_MULTIPLIER: 4,
  HEAL: 3,
  DAMAGE: 3,
};

export function calculateSkillPch(effects: PricedEffect[]): number {
  if (!Array.isArray(effects)) return 0;
  return effects.reduce((total, effect) => {
    const type = String(effect?.type ?? "");
    const base = BASE_COST[type] ?? 2;
    if (type === "NARRATIVE") return total + base;
    const power = Number(effect?.value ?? 1);
    return total + base + (Number.isFinite(power) && power > 1 ? Math.ceil(Math.log2(power)) : 0);
  }, 0);
}

export const PCH_PER_COIN = 10;
