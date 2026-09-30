export type BaseStats = {
  strength: number;
  agility: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  spirit: number;
  luck: number;
};

export function calculateDerivedStats(stats: BaseStats) {
  const floor2 = (value: number) => Math.floor(value * 100) / 100;

  const precision =
    stats.agility / 2 +
    stats.intelligence / 2 +
    stats.wisdom / 2 +
    stats.spirit / 2 +
    stats.luck / 3;

  return {
    maxHp: floor2(10 + stats.constitution * 2),

    maxMana: floor2(5 + stats.intelligence + stats.spirit),

    physicalAttack: floor2(stats.strength + stats.agility / 4),

    magicAttack: floor2(stats.intelligence + stats.spirit),

    physicalDefense: floor2(stats.constitution + stats.agility / 4),

    magicDefense: floor2(stats.spirit + stats.wisdom),

    precision: floor2(precision),

    critical: floor2(
      stats.luck * 2 +
      precision / 10 +
      stats.wisdom / 2,
    ),

    discovery: floor2(stats.luck + stats.wisdom),

    miracle: floor2(
      stats.luck +
      stats.spirit / 2 +
      stats.charisma / 2,
    ),

    intimidation: floor2(stats.charisma + stats.strength),

    conquest: floor2(stats.charisma + stats.luck),

    race: floor2(
      Math.min(stats.agility, stats.strength) +
      stats.constitution / 4,
    ),

    dodge: floor2(
      stats.luck * 3 +
      stats.agility +
      stats.wisdom / 2,
    ),

    stealth: floor2(
      stats.agility +
      stats.intelligence / 2 -
      stats.spirit / 10,
    ),

    detection: floor2(stats.wisdom + stats.luck / 3),
  };
}

export type ItemStatEffect = {
  type: string;
  stat: string;
  value: number;
};

const DERIVED_STAT_ALIASES: Record<string, keyof ReturnType<typeof calculateDerivedStats>> = {
  HP: "maxHp",
  MAX_HP: "maxHp",
  MANA: "maxMana",
  MAX_MANA: "maxMana",
  PHYS_ATK: "physicalAttack",
  PHYSICAL_ATTACK: "physicalAttack",
  MAGIC_ATK: "magicAttack",
  PHYSICAL_DEF: "physicalDefense",
  DEF: "physicalDefense",
  DEFENSE: "physicalDefense",
  MAG_DEF: "magicDefense",
  MAGIC_DEFENSE: "magicDefense",
  PRECISION: "precision",
  CRITICAL: "critical",
  DISCOVERY: "discovery",
  MIRACLE: "miracle",
  INTIMIDATION: "intimidation",
  CONQUEST: "conquest",
  RACE: "race",
  DODGE: "dodge",
  STEALTH: "stealth",
  DETECTION: "detection",
};

export function applyDerivedItemEffects(
  derivedStats: ReturnType<typeof calculateDerivedStats>,
  effects: ItemStatEffect[],
) {
  const result = { ...derivedStats };

  for (const effect of effects) {
    const target = DERIVED_STAT_ALIASES[String(effect.stat ?? "").trim().toUpperCase()];
    if (!target) continue;

    const value = Number(effect.value);
    if (!Number.isFinite(value)) continue;

    if (effect.type === "stat_bonus") {
      result[target] += value;
    } else if (effect.type === "stat_multiplier") {
      result[target] *= value / 100;
    }
  }

  return result;
}
