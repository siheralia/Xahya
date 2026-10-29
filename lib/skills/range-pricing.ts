/** Five metres is neutral. Each additional metre adds one PCH; shorter reach discounts one. */
export const DEFAULT_SKILL_RANGE_METERS = 5;
export function rangePchAdjustment(metres: number): number {
  if (!Number.isSafeInteger(metres) || metres < 0 || metres > 100) throw new Error("La distancia debe ser un entero entre 0 y 100 metros.");
  return metres - DEFAULT_SKILL_RANGE_METERS;
}
export function applyRangePch(basePch: number, metres: number): number {
  if (!Number.isSafeInteger(basePch) || basePch < 0) throw new Error("PCH base inválido.");
  return basePch === 0 ? 0 : Math.max(1, basePch + rangePchAdjustment(metres));
}
