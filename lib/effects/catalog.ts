export const EFFECT_CATALOG = [
  { type: "DAMAGE_MULTIPLIER", label: "Daño ×", mode: "multiplier", targets: ["PHYS_ATK","MAGIC_ATK","ATTACK_TOTAL"] },
  { type: "STAT_MULTIPLIER", label: "Estadística ×", mode: "multiplier", targets: ["STR","AGI","CON","INT","WIS","CHA","SPI","LCK","HP","MANA","PHYS_ATK","MAGIC_ATK","DEF","MAG_DEF","PRECISION","CRITICAL","DISCOVERY","MIRACLE","INTIMIDATION","CONQUEST","RACE","DODGE","STEALTH","DETECTION","ATTACK_TOTAL"] },
  { type: "STAT_BONUS", label: "Estadística +", mode: "bonus", targets: ["STR","AGI","CON","INT","WIS","CHA","SPI","LCK","HP","MANA","PHYS_ATK","MAGIC_ATK","DEF","MAG_DEF","PRECISION","CRITICAL","DISCOVERY","MIRACLE","INTIMIDATION","CONQUEST","RACE","DODGE","STEALTH","DETECTION","ATTACK_TOTAL"] },
  { type: "RESOURCE_BONUS", label: "Recurso +", mode: "bonus", targets: ["HP","MANA","MONEY","KARMA","LEVEL_UP_POINTS"] },
  { type: "COMBAT_MULTIPLIER", label: "Combate ×", mode: "multiplier", targets: ["PHYS_ATK","MAGIC_ATK","ATTACK_TOTAL"] },
  { type: "EQUIPMENT_SLOT_CAP", label: "Límite de equipo +", mode: "bonus", targets: [] },
  { type: "NARRATIVE", label: "Narrativo", mode: "text", targets: ["OTHER"] },
  { type: "IGNORE_PHYS_DEF_MULTIPLIER", label: "Ignorar defensa física ×", mode: "multiplier", targets: [] },
  { type: "IGNORE_PHYS_DEF_BONUS", label: "Ignorar defensa física +", mode: "bonus", targets: [] },
  { type: "IGNORE_MAGIC_DEF_MULTIPLIER", label: "Ignorar defensa mágica ×", mode: "multiplier", targets: [] },
  { type: "IGNORE_MAGIC_DEF_BONUS", label: "Ignorar defensa mágica +", mode: "bonus", targets: [] },
  { type: "IGNORE_ALL_DEF_MULTIPLIER", label: "Ignorar defensas ×", mode: "multiplier", targets: [] },
  { type: "IGNORE_ALL_DEF_BONUS", label: "Ignorar defensas +", mode: "bonus", targets: [] },
  { type: "FINAL_DAMAGE_MULTIPLIER", label: "Daño final ocasionado ×", mode: "multiplier", targets: [] },
  { type: "FINAL_DAMAGE_BONUS", label: "Daño final ocasionado +", mode: "bonus", targets: [] },
  { type: "MAZE_UTILITY", label: "Capacidad de laberinto", mode: "special", targets: ["INVISIBILITY"] },
] as const;

export type SkillEffectType = typeof EFFECT_CATALOG[number]["type"];
export const EFFECT_TYPES = EFFECT_CATALOG.map(e => e.type) as readonly SkillEffectType[];
export const EFFECT_LABELS = Object.fromEntries(EFFECT_CATALOG.map(e => [e.type, e.label])) as Record<SkillEffectType, string>;
export const EFFECT_TARGETS = Object.fromEntries(EFFECT_CATALOG.map(e => [e.type, e.targets])) as unknown as Record<SkillEffectType, readonly string[]>;
