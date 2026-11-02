import { durationPchCost, type DurationPricing } from "@/lib/effects/duration-pricing";
import { effectPchCost, type EffectPricingMap, type PricedEffect } from "@/lib/skills/pch";

export type ConfiguredSkillEffect = PricedEffect & {
  durationTurns?: number;
  durationMovements?: number;
};
export type PricedNarrativeCard = { id: string | number; pch?: number };

/**
 * Same per-effect pricing for the character editor and skill management.
 * Managed narrative cards already carry their complete PCH price; do not
 * price them again as an ordinary NARRATIVE effect or add elemental PCH.
 * Non-card effects use configured effect pricing and every effect uses
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
    ? (narrativeCards.find(card => String(card.id) === cardId)?.pch ?? 0)
    : effectPchCost(effect, effectPricing);
  const duration = effect.durationMovements
    ? { kind: "MOVEMENTS" as const, movements: effect.durationMovements }
    : effect.durationTurns
      ? { kind: "TURNS" as const, turns: effect.durationTurns }
      : { kind: "INSTANT" as const };
  return durationPchCost(base, duration, durationPricing);
}
