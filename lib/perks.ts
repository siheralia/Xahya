export type PerkEffect = {
  type: string;
  target?: string;
  value?: number;
};

export function pickWeightedPerk(perks: any[]) {
  const active = perks.filter((perk) => Boolean(perk.active) && Number(perk.probability) > 0);
  const total = active.reduce((sum, perk) => sum + Number(perk.probability), 0);
  if (!active.length || total <= 0) return null;
  let roll = Math.random() * total;
  for (const perk of active) {
    roll -= Number(perk.probability);
    if (roll < 0) return perk;
  }
  return active[active.length - 1];
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
