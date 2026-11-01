/**
 * Reusing an already approved technique reduces the cost of constructing a
 * dependent skill, without making it free or discounting unrelated skills.
 * Applied to the calculated final PCH, including range and speed.
 */
export const PREREQUISITE_DISCOUNT_PERCENT = 20;
export function prerequisiteAdjustedPch(pch: number, approvedPrerequisiteCount: number): number {
  if (!Number.isSafeInteger(pch) || pch < 0) throw new Error("Costo PCH inválido.");
  if (!Number.isSafeInteger(approvedPrerequisiteCount) || approvedPrerequisiteCount < 0)
    throw new Error("Cantidad de requisitos inválida.");
  if (approvedPrerequisiteCount === 0 || pch === 0) return pch;
  // One discount per technique; stacking requirements cannot game the price.
  return Math.max(1, Math.ceil(pch * (100 - PREREQUISITE_DISCOUNT_PERCENT) / 100));
}
