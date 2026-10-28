/** Declarative conditions for written roleplay; not enforced by combat runtime yet. */
export const SKILL_CONDITIONS = ["NONE","LOW_HEALTH","NIGHT_ONLY","ONCE_PER_COMBAT","THREE_PER_COMBAT"] as const;
export type SkillCondition = typeof SKILL_CONDITIONS[number];
export type SkillTargetKind = "SELF" | "CHARACTER" | "OPPONENT" | "EXISTING_OBJECT";
export const SKILL_TARGET_KINDS: SkillTargetKind[] = ["SELF","CHARACTER","OPPONENT","EXISTING_OBJECT"];
export function validateSkillParameters(effect: {targetKind?:unknown; targetReference?:unknown; activationCondition?:unknown}): string | null {
  if (effect.targetKind !== undefined && !SKILL_TARGET_KINDS.includes(effect.targetKind as SkillTargetKind)) return "Tipo de objetivo inválido.";
  if (effect.activationCondition !== undefined && !SKILL_CONDITIONS.includes(effect.activationCondition as SkillCondition)) return "Condición de activación inválida.";
  if (effect.targetReference !== undefined && (typeof effect.targetReference !== "string" || effect.targetReference.length > 200)) return "Referencia de objetivo inválida.";
  if (effect.targetKind === "EXISTING_OBJECT" && !String(effect.targetReference ?? "").trim()) return "Indica el objeto existente al que se aplica el efecto.";
  return null;
}
/** No PCH discounts until the combat engine enforces conditions. */
export function conditionDiscountPch(): number { return 0; }
