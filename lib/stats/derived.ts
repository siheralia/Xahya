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
  const precision =
    stats.agility / 2 +
    stats.intelligence / 2 +
    stats.wisdom / 2 +
    stats.spirit / 2 +
    stats.luck / 3;

  return {
    maxHp: 10 + stats.constitution * 2,

    maxMana: 5 + stats.intelligence + stats.spirit,

    physicalAttack: stats.strength + stats.agility / 4,

    magicAttack: stats.intelligence + stats.spirit,

    physicalDefense: stats.constitution + stats.agility / 4,

    magicDefense: stats.spirit + stats.wisdom,

    precision,

    critical:
      stats.luck * 2 +
      precision / 10 +
      stats.wisdom / 2,

    discovery: stats.luck + stats.wisdom,

    miracle:
      stats.luck +
      stats.spirit / 2 +
      stats.charisma / 2,

    intimidation: stats.charisma + stats.strength,

    conquest: stats.charisma + stats.luck,

    race:
      Math.min(stats.agility, stats.strength) +
      stats.constitution / 4,

    dodge:
      stats.luck * 3 +
      stats.agility +
      stats.wisdom / 2,

    stealth:
      stats.agility +
      stats.intelligence / 2 -
      stats.spirit / 10,

    detection:
      stats.wisdom +
      stats.luck / 3,
  };
}