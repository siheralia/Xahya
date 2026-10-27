/** 90 named skill-effect presets backed by existing validated mechanics. */
export type SkillEffectPreset = { name: string; type: string; target: string; value: number };
export const SKILL_EFFECT_PRESETS: readonly SkillEffectPreset[] = [
  {
    "name": "Impulso de Fuerza",
    "type": "STAT_BONUS",
    "target": "STR",
    "value": 2
  },
  {
    "name": "Potenciación de Fuerza",
    "type": "STAT_MULTIPLIER",
    "target": "STR",
    "value": 150
  },
  {
    "name": "Impulso de Agilidad",
    "type": "STAT_BONUS",
    "target": "AGI",
    "value": 2
  },
  {
    "name": "Potenciación de Agilidad",
    "type": "STAT_MULTIPLIER",
    "target": "AGI",
    "value": 150
  },
  {
    "name": "Impulso de Constitución",
    "type": "STAT_BONUS",
    "target": "CON",
    "value": 2
  },
  {
    "name": "Potenciación de Constitución",
    "type": "STAT_MULTIPLIER",
    "target": "CON",
    "value": 150
  },
  {
    "name": "Impulso de Inteligencia",
    "type": "STAT_BONUS",
    "target": "INT",
    "value": 2
  },
  {
    "name": "Potenciación de Inteligencia",
    "type": "STAT_MULTIPLIER",
    "target": "INT",
    "value": 150
  },
  {
    "name": "Impulso de Sabiduría",
    "type": "STAT_BONUS",
    "target": "WIS",
    "value": 2
  },
  {
    "name": "Potenciación de Sabiduría",
    "type": "STAT_MULTIPLIER",
    "target": "WIS",
    "value": 150
  },
  {
    "name": "Impulso de Carisma",
    "type": "STAT_BONUS",
    "target": "CHA",
    "value": 2
  },
  {
    "name": "Potenciación de Carisma",
    "type": "STAT_MULTIPLIER",
    "target": "CHA",
    "value": 150
  },
  {
    "name": "Impulso de Espíritu",
    "type": "STAT_BONUS",
    "target": "SPI",
    "value": 2
  },
  {
    "name": "Potenciación de Espíritu",
    "type": "STAT_MULTIPLIER",
    "target": "SPI",
    "value": 150
  },
  {
    "name": "Impulso de Suerte",
    "type": "STAT_BONUS",
    "target": "LCK",
    "value": 2
  },
  {
    "name": "Potenciación de Suerte",
    "type": "STAT_MULTIPLIER",
    "target": "LCK",
    "value": 150
  },
  {
    "name": "Impulso de Vitalidad",
    "type": "STAT_BONUS",
    "target": "HP",
    "value": 2
  },
  {
    "name": "Potenciación de Vitalidad",
    "type": "STAT_MULTIPLIER",
    "target": "HP",
    "value": 150
  },
  {
    "name": "Impulso de Maná",
    "type": "STAT_BONUS",
    "target": "MANA",
    "value": 2
  },
  {
    "name": "Potenciación de Maná",
    "type": "STAT_MULTIPLIER",
    "target": "MANA",
    "value": 150
  },
  {
    "name": "Impulso de Ataque físico",
    "type": "STAT_BONUS",
    "target": "PHYS_ATK",
    "value": 2
  },
  {
    "name": "Potenciación de Ataque físico",
    "type": "STAT_MULTIPLIER",
    "target": "PHYS_ATK",
    "value": 150
  },
  {
    "name": "Impulso de Ataque mágico",
    "type": "STAT_BONUS",
    "target": "MAGIC_ATK",
    "value": 2
  },
  {
    "name": "Potenciación de Ataque mágico",
    "type": "STAT_MULTIPLIER",
    "target": "MAGIC_ATK",
    "value": 150
  },
  {
    "name": "Impulso de Defensa",
    "type": "STAT_BONUS",
    "target": "DEF",
    "value": 2
  },
  {
    "name": "Potenciación de Defensa",
    "type": "STAT_MULTIPLIER",
    "target": "DEF",
    "value": 150
  },
  {
    "name": "Impulso de Resistencia mágica",
    "type": "STAT_BONUS",
    "target": "MAG_DEF",
    "value": 2
  },
  {
    "name": "Potenciación de Resistencia mágica",
    "type": "STAT_MULTIPLIER",
    "target": "MAG_DEF",
    "value": 150
  },
  {
    "name": "Impulso de Precisión",
    "type": "STAT_BONUS",
    "target": "PRECISION",
    "value": 2
  },
  {
    "name": "Potenciación de Precisión",
    "type": "STAT_MULTIPLIER",
    "target": "PRECISION",
    "value": 150
  },
  {
    "name": "Impulso de Crítico",
    "type": "STAT_BONUS",
    "target": "CRITICAL",
    "value": 2
  },
  {
    "name": "Potenciación de Crítico",
    "type": "STAT_MULTIPLIER",
    "target": "CRITICAL",
    "value": 150
  },
  {
    "name": "Impulso de Descubrimiento",
    "type": "STAT_BONUS",
    "target": "DISCOVERY",
    "value": 2
  },
  {
    "name": "Potenciación de Descubrimiento",
    "type": "STAT_MULTIPLIER",
    "target": "DISCOVERY",
    "value": 150
  },
  {
    "name": "Impulso de Milagro",
    "type": "STAT_BONUS",
    "target": "MIRACLE",
    "value": 2
  },
  {
    "name": "Potenciación de Milagro",
    "type": "STAT_MULTIPLIER",
    "target": "MIRACLE",
    "value": 150
  },
  {
    "name": "Impulso de Intimidación",
    "type": "STAT_BONUS",
    "target": "INTIMIDATION",
    "value": 2
  },
  {
    "name": "Potenciación de Intimidación",
    "type": "STAT_MULTIPLIER",
    "target": "INTIMIDATION",
    "value": 150
  },
  {
    "name": "Impulso de Conquista",
    "type": "STAT_BONUS",
    "target": "CONQUEST",
    "value": 2
  },
  {
    "name": "Potenciación de Conquista",
    "type": "STAT_MULTIPLIER",
    "target": "CONQUEST",
    "value": 150
  },
  {
    "name": "Impulso de Carrera",
    "type": "STAT_BONUS",
    "target": "RACE",
    "value": 2
  },
  {
    "name": "Potenciación de Carrera",
    "type": "STAT_MULTIPLIER",
    "target": "RACE",
    "value": 150
  },
  {
    "name": "Impulso de Evasión",
    "type": "STAT_BONUS",
    "target": "DODGE",
    "value": 2
  },
  {
    "name": "Potenciación de Evasión",
    "type": "STAT_MULTIPLIER",
    "target": "DODGE",
    "value": 150
  },
  {
    "name": "Impulso de Sigilo",
    "type": "STAT_BONUS",
    "target": "STEALTH",
    "value": 2
  },
  {
    "name": "Potenciación de Sigilo",
    "type": "STAT_MULTIPLIER",
    "target": "STEALTH",
    "value": 150
  },
  {
    "name": "Impulso de Detección",
    "type": "STAT_BONUS",
    "target": "DETECTION",
    "value": 2
  },
  {
    "name": "Potenciación de Detección",
    "type": "STAT_MULTIPLIER",
    "target": "DETECTION",
    "value": 150
  },
  {
    "name": "Impulso de Ataque total",
    "type": "STAT_BONUS",
    "target": "ATTACK_TOTAL",
    "value": 2
  },
  {
    "name": "Potenciación de Ataque total",
    "type": "STAT_MULTIPLIER",
    "target": "ATTACK_TOTAL",
    "value": 150
  },
  {
    "name": "Golpe físico normal",
    "type": "DAMAGE_MULTIPLIER",
    "target": "PHYS_ATK",
    "value": 100
  },
  {
    "name": "Golpe físico reforzado",
    "type": "DAMAGE_MULTIPLIER",
    "target": "PHYS_ATK",
    "value": 150
  },
  {
    "name": "Golpe físico devastador",
    "type": "DAMAGE_MULTIPLIER",
    "target": "PHYS_ATK",
    "value": 200
  },
  {
    "name": "Hechizo ofensivo normal",
    "type": "DAMAGE_MULTIPLIER",
    "target": "MAGIC_ATK",
    "value": 100
  },
  {
    "name": "Hechizo ofensivo reforzado",
    "type": "DAMAGE_MULTIPLIER",
    "target": "MAGIC_ATK",
    "value": 150
  },
  {
    "name": "Hechizo ofensivo devastador",
    "type": "DAMAGE_MULTIPLIER",
    "target": "MAGIC_ATK",
    "value": 200
  },
  {
    "name": "Impacto total normal",
    "type": "DAMAGE_MULTIPLIER",
    "target": "ATTACK_TOTAL",
    "value": 100
  },
  {
    "name": "Impacto total reforzado",
    "type": "DAMAGE_MULTIPLIER",
    "target": "ATTACK_TOTAL",
    "value": 150
  },
  {
    "name": "Impacto total devastador",
    "type": "DAMAGE_MULTIPLIER",
    "target": "ATTACK_TOTAL",
    "value": 200
  },
  {
    "name": "Reserva de Vitalidad menor",
    "type": "RESOURCE_BONUS",
    "target": "HP",
    "value": 1
  },
  {
    "name": "Reserva de Vitalidad intermedia",
    "type": "RESOURCE_BONUS",
    "target": "HP",
    "value": 2
  },
  {
    "name": "Reserva de Vitalidad mayor",
    "type": "RESOURCE_BONUS",
    "target": "HP",
    "value": 4
  },
  {
    "name": "Reserva de Maná menor",
    "type": "RESOURCE_BONUS",
    "target": "MANA",
    "value": 1
  },
  {
    "name": "Reserva de Maná intermedia",
    "type": "RESOURCE_BONUS",
    "target": "MANA",
    "value": 2
  },
  {
    "name": "Reserva de Maná mayor",
    "type": "RESOURCE_BONUS",
    "target": "MANA",
    "value": 4
  },
  {
    "name": "Reserva de Dinero menor",
    "type": "RESOURCE_BONUS",
    "target": "MONEY",
    "value": 1
  },
  {
    "name": "Reserva de Dinero intermedia",
    "type": "RESOURCE_BONUS",
    "target": "MONEY",
    "value": 2
  },
  {
    "name": "Reserva de Dinero mayor",
    "type": "RESOURCE_BONUS",
    "target": "MONEY",
    "value": 4
  },
  {
    "name": "Reserva de Karma menor",
    "type": "RESOURCE_BONUS",
    "target": "KARMA",
    "value": 1
  },
  {
    "name": "Reserva de Karma intermedia",
    "type": "RESOURCE_BONUS",
    "target": "KARMA",
    "value": 2
  },
  {
    "name": "Reserva de Karma mayor",
    "type": "RESOURCE_BONUS",
    "target": "KARMA",
    "value": 4
  },
  {
    "name": "Reserva de Puntos de nivel menor",
    "type": "RESOURCE_BONUS",
    "target": "LEVEL_UP_POINTS",
    "value": 1
  },
  {
    "name": "Reserva de Puntos de nivel intermedia",
    "type": "RESOURCE_BONUS",
    "target": "LEVEL_UP_POINTS",
    "value": 2
  },
  {
    "name": "Reserva de Puntos de nivel mayor",
    "type": "RESOURCE_BONUS",
    "target": "LEVEL_UP_POINTS",
    "value": 4
  },
  {
    "name": "Reducción general básica",
    "type": "DAMAGE_REDUCTION",
    "target": "ALL",
    "value": 1
  },
  {
    "name": "Vulnerabilidad general básica",
    "type": "DAMAGE_INCREASE",
    "target": "ALL",
    "value": 1
  },
  {
    "name": "Reducción general avanzada",
    "type": "DAMAGE_REDUCTION",
    "target": "ALL",
    "value": 2
  },
  {
    "name": "Vulnerabilidad general avanzada",
    "type": "DAMAGE_INCREASE",
    "target": "ALL",
    "value": 2
  },
  {
    "name": "Reducción física básica",
    "type": "DAMAGE_REDUCTION",
    "target": "PHYSICAL",
    "value": 1
  },
  {
    "name": "Vulnerabilidad física básica",
    "type": "DAMAGE_INCREASE",
    "target": "PHYSICAL",
    "value": 1
  },
  {
    "name": "Reducción física avanzada",
    "type": "DAMAGE_REDUCTION",
    "target": "PHYSICAL",
    "value": 2
  },
  {
    "name": "Vulnerabilidad física avanzada",
    "type": "DAMAGE_INCREASE",
    "target": "PHYSICAL",
    "value": 2
  },
  {
    "name": "Reducción mágica básica",
    "type": "DAMAGE_REDUCTION",
    "target": "MAGICAL",
    "value": 1
  },
  {
    "name": "Vulnerabilidad mágica básica",
    "type": "DAMAGE_INCREASE",
    "target": "MAGICAL",
    "value": 1
  },
  {
    "name": "Reducción mágica avanzada",
    "type": "DAMAGE_REDUCTION",
    "target": "MAGICAL",
    "value": 2
  },
  {
    "name": "Vulnerabilidad mágica avanzada",
    "type": "DAMAGE_INCREASE",
    "target": "MAGICAL",
    "value": 2
  },
  {
    "name": "Combate físico reforzado",
    "type": "COMBAT_MULTIPLIER",
    "target": "PHYS_ATK",
    "value": 150
  },
  {
    "name": "Combate mágico reforzado",
    "type": "COMBAT_MULTIPLIER",
    "target": "MAGIC_ATK",
    "value": 150
  }
];
