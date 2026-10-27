/**
 * Pricing adjustments for verified effect duration.
 * Restrictions are intentionally not discounted until the runtime enforces them.
 * Instantaneous and persistent crafting operations are separate categories.
 */
export type DurationPricing = {
  instant: number;
  oneTurn: number;
  perExtraTurn: number;
  maxTurns: number;
};
export const DEFAULT_DURATION_PRICING: DurationPricing = {
  instant: 1, oneTurn: 1, perExtraTurn: 0.25, maxTurns: 20,
};
export type EffectDuration = { kind: "INSTANT" } | { kind: "TURNS"; turns: number };
export function validateDurationPricing(p: DurationPricing): void {
  if (![p.instant,p.oneTurn,p.perExtraTurn].every(v => Number.isFinite(v) && v >= 0 && v <= 10) ||
    !Number.isSafeInteger(p.maxTurns) || p.maxTurns < 1 || p.maxTurns > 100) throw new Error("Reglas de duración inválidas");
}
export function durationPchCost(base: number, duration: EffectDuration, pricing: DurationPricing = DEFAULT_DURATION_PRICING): number {
  validateDurationPricing(pricing);
  if (!Number.isSafeInteger(base) || base < 0) throw new Error("Costo base inválido");
  if (duration.kind === "INSTANT") return Math.ceil(base * pricing.instant);
  if (duration.kind !== "TURNS" || !Number.isSafeInteger(duration.turns) || duration.turns < 1 || duration.turns > pricing.maxTurns) throw new Error("Duración inválida");
  return Math.ceil(base * (pricing.oneTurn + (duration.turns - 1) * pricing.perExtraTurn));
}
