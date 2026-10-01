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


export async function awardCreationPerks(tx: any, characterId: number) {
  const Perk = tx?.orm?.public?.Perk;
  const CharacterPerk = tx?.orm?.public?.CharacterPerk;
  if (!Perk || !CharacterPerk) return { awardedPerks: [], existingCount: 0, availablePerks: [] };

  const allCharacterPerks = await CharacterPerk.where({ characterId }).all();
  // Solo cuentan las perks obtenidas durante la creación. Las otorgadas por
  // gestión u otras fuentes no consumen ninguno de los 3 rolls de creación.
  const creationPerks = allCharacterPerks.filter(
    (entry: any) => String(entry.source ?? "") === "CREATION_ROLL"
  );
  const existingCount = creationPerks.length;

  if (existingCount >= 3) {
    return { awardedPerks: [], existingCount, availablePerks: await Perk.where({ active: true }).all() };
  }

  const availablePerks = await Perk.where({ active: true }).all();
  const awardedPerks: any[] = [];
  const allCreationAwarded = [...creationPerks];

  for (let roll = existingCount; roll < 3; roll += 1) {
    const selected = pickWeightedPerk(availablePerks, (perk: any) => getCreationRollProbability(perk, roll));
    if (!selected) continue;

    const existingSelectedCount = allCreationAwarded.filter(
      (entry) => Number(entry.perkId) === Number(selected.id)
    ).length;

    // No hay un límite global de perks: solo respetamos maxStacks cuando
    // la propia perk lo define y contamos únicamente las de creación.
    if (!Boolean(selected.stackable) && Number(selected.maxStacks ?? 1) <= existingSelectedCount) continue;

    const awarded = await CharacterPerk.create({
      characterId,
      perkId: selected.id,
      source: "CREATION_ROLL",
    });
    awardedPerks.push(awarded);
    allCreationAwarded.push(awarded);
  }

  const resourceBonuses = awardedPerks
    .map((entry) => availablePerks.find((perk: any) => Number(perk.id) === Number(entry.perkId)))
    .flatMap((perk: any) => Array.isArray(perk?.effects) ? perk.effects : [])
    .filter((effect: any) => String(effect.type) === "RESOURCE_BONUS")
    .reduce((totals: any, effect: any) => {
      const target = String(effect.target ?? "");
      const value = Number(effect.value ?? 0);
      if (target === "KARMA") totals.karma += value;
      if (target === "MONEY") totals.money += value;
      if (target === "LEVEL_UP_POINTS") totals.levelUpPoints += value;
      return totals;
    }, { karma: 0, money: 0, levelUpPoints: 0 });

  if (awardedPerks.length && (resourceBonuses.karma || resourceBonuses.money || resourceBonuses.levelUpPoints)) {
    const CharacterResource = tx?.orm?.public?.CharacterResource;
    if (CharacterResource) {
      const resource = await CharacterResource.where({ characterId }).first();
      if (resource) {
        await CharacterResource.where({ characterId }).update({
          karma: Number(resource.karma ?? 0) + resourceBonuses.karma,
          money: Number(resource.money ?? 0) + resourceBonuses.money,
          levelUpPoints: Number(resource.levelUpPoints ?? 0) + resourceBonuses.levelUpPoints,
        });
      }
    }
  }

  return { awardedPerks, existingCount, availablePerks };
}
