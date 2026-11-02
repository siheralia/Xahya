/** Tipos de enfrentamiento del combate, compartidos entre acciones básicas y habilidades. */
export const COMBAT_ATTACK_TYPE_OPTIONS = [
  { value: "CUT", label: "Corte" },
  { value: "BLUNT", label: "Contundente" },
  { value: "PIERCE", label: "Penetración" },
] as const;

export const COMBAT_DEFENSE_TYPE_OPTIONS = [
  { value: "CONCENTRATED", label: "Concentrada" },
  { value: "DISPERSED", label: "Dispersa" },
  { value: "SOLID", label: "Sólida" },
] as const;

export type CombatAttackType = (typeof COMBAT_ATTACK_TYPE_OPTIONS)[number]["value"];
export type CombatDefenseType = (typeof COMBAT_DEFENSE_TYPE_OPTIONS)[number]["value"];

const attackTypes = new Set<string>(COMBAT_ATTACK_TYPE_OPTIONS.map(option => option.value));
const defenseTypes = new Set<string>(COMBAT_DEFENSE_TYPE_OPTIONS.map(option => option.value));

/** Una habilidad puede tener ataque, defensa, ambos o ninguno. No hereda el básico. */
export function validateSkillCombatTypes(input: { attackType?: unknown; defenseType?: unknown } | null | undefined): string | null {
  if (!input) return null;
  const attack = input.attackType;
  const defense = input.defenseType;
  if (attack !== undefined && attack !== null && attack !== "" && (typeof attack !== "string" || !attackTypes.has(attack)))
    return "Tipo de ataque inválido.";
  if (defense !== undefined && defense !== null && defense !== "" && (typeof defense !== "string" || !defenseTypes.has(defense)))
    return "Tipo de defensa inválido.";
  return null;
}

/** Convierte la opción «No aplica» en NULL; deja los códigos canónicos intactos. */
export function normalizeSkillCombatType(value: unknown): string | null {
  return value === undefined || value === null || value === "" ? null : String(value);
}
