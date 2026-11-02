/** Passive skill conditions must be defined before a skill can be submitted or approved. */
export const PASSIVE_CONDITION_REQUIRED_MESSAGE = "Indica cuándo se activa esta habilidad pasiva. La condición es obligatoria.";

export function isPassiveConditionMissing(category: unknown, condition: unknown): boolean {
  return category === "PASSIVE" && (typeof condition !== "string" || condition.trim().length === 0);
}
