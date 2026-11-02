import { durationPchCost, type DurationPricing } from "@/lib/effects/duration-pricing";
import { effectPchCost, elementPchCost, type EffectPricingMap, type PricedEffect } from "@/lib/skills/pch";

export type ConfiguredSkillEffect = PricedEffect & {
  durationTurns?: number;
  durationMovements?: number;
};
export type PricedNarrativeCard = { id: string | number; pch?: number };

/**
 * Same per-effect pricing for the character editor and skill management.
 * Managed narrative cards define their base PCH price. Add any elemental
 * surcharge exactly once, as with non-card effects. Do not replace the
 * card price with the ordinary NARRATIVE base. Every effect also uses
 * configured duration pricing, matching the skill submission API.
 */
export function configuredSkillEffectPch(
  effect: ConfiguredSkillEffect,
  narrativeCards: readonly PricedNarrativeCard[],
  effectPricing: EffectPricingMap,
  durationPricing: DurationPricing,
): number {
  const cardId = effect.type === "NARRATIVE" && effect.target?.startsWith("CARD:")
    ? effect.target.slice("CARD:".length) : null;
  const base = cardId !== null
    ? (narrativeCards.find(card => String(card.id) === cardId)?.pch ?? 0) + elementPchCost(effect.element)
    : effectPchCost(effect, effectPricing);
  const duration = effect.durationMovements
    ? { kind: "MOVEMENTS" as const, movements: effect.durationMovements }
    : effect.durationTurns
      ? { kind: "TURNS" as const, turns: effect.durationTurns }
      : { kind: "INSTANT" as const };
  return durationPchCost(base, duration, durationPricing);
}
