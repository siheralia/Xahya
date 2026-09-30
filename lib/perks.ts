export type PerkEffect = {
  type: string;
  target?: string;
  value?: number;
};

export function getCreationRollProbability(perk: any, rollIndex: number) {
  const base = Number(perk?.probability ?? 0);
  if (!Number.isFinite(base) || base <= 0) return 0;

  const isNothing = String(perk?.name ?? "").trim().toLowerCase() === "nada";
  const moved = rollIndex === 0 ? 40 : rollIndex === 1 ? 20 : 0;

  if (isNothing) return Math.max(0, 50 - moved);

  // Redistribute the moved points proportionally among the non-Nada base weights.
  // The current base table has 55 points outside Nada.
  const otherBase = 55;
  return base + (base / otherBase) * moved;
}

export function pickWeightedPerk(perks: any[], probabilityFor?: (perk: any) => number) {
  const active = perks
    .filter((perk) => Boolean(perk.active))
    .map((perk) => ({
      perk,
      probability: probabilityFor ? Number(probabilityFor(perk)) : Number(perk.probability),
    }))
    .filter((entry) => Number.isFinite(entry.probability) && entry.probability > 0);

  const total = active.reduce((sum, entry) => sum + entry.probability, 0);
  if (!active.length || total <= 0) return null;

  let roll = Math.random() * total;
  for (const entry of active) {
    roll -= entry.probability;
    if (roll < 0) return entry.perk;
  }

  return active[active.length - 1].perk;
}

export function getPerkEffects(perks: any[]) {
  return perks.flatMap((entry) => {
    const effects = Array.isArray(entry.perk?.effects) ? entry.perk.effects : [];
    return effects.map((effect: any) => ({
      ...effect,
      perkId: Number(entry.perkId),
      perkName: String(entry.perk?.name ?? "Perk"),
      source: "PERK:" + String(entry.perk?.name ?? "Perk"),
    }));
  });
}

export function getPerkSlotCapacity(perks: any[], slot: string) {
  const base = 1;
  const caps = perks
    .flatMap((entry) => Array.isArray(entry.perk?.effects) ? entry.perk.effects : [])
    .filter((effect: any) => String(effect.type) === "EQUIPMENT_SLOT_CAP" && String(effect.target) === slot)
    .map((effect: any) => Number(effect.value))
    .filter((value) => Number.isFinite(value) && value > 0);
  return caps.length ? Math.max(base, ...caps) : base;
}
