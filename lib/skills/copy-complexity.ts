import { calculateSkillPch, type EffectPricingMap } from "@/lib/skills/pch";

/** Higher than the largest legal COPY_SKILL / STEAL_SKILL capacity (1,000,000).
 * Fails closed when a legacy admin-created modular skill lacks an audited review.
 */
export const UNPRICED_MODULAR_COPY_COMPLEXITY = 1_000_001;

/** Use the same price for discovery, copy requests, copy approval and theft.
 * Recorded PCH is the authoritative reviewed total, but it cannot be lower
 * than the independently reviewed modular bases plus any ordinary effects.
 * Legacy modular rows with missing reviews must not appear to cost zero.
 */
export function copyComplexityPch(
  source: { pchCost?: number | null; effect?: unknown },
  pricing: EffectPricingMap,
): number {
  const recorded = Number(source.pchCost ?? 0);
  const complexity = Number.isSafeInteger(recorded) && recorded >= 0 ? recorded : 0;
  if (!Array.isArray(source.effect)) return complexity;

  const composed = source.effect.filter((entry: unknown) =>
    !!entry && typeof entry === "object" && !Array.isArray(entry) &&
    (entry as { type?: unknown }).type === "COMPOSED"
  ) as Array<{ reviewedPch?: unknown }>;

  if (composed.length) {
    // Unlike an ordinary legacy effect, a composed effect has no generic
    // calculateSkillPch price. Its provisional editor deposit is NOT a review.
    if (complexity === 0 || composed.some(entry =>
      !Number.isSafeInteger(entry.reviewedPch) ||
      Number(entry.reviewedPch) < 1 || Number(entry.reviewedPch) > 100000
    )) return UNPRICED_MODULAR_COPY_COMPLEXITY;

    try {
      const ordinary = source.effect.filter((entry: unknown) =>
        !!entry && typeof entry === "object" &&
        (entry as { type?: unknown }).type !== "COMPOSED"
      );
      const base = composed.reduce((sum, entry) => sum + Number(entry.reviewedPch), 0);
      return Math.max(complexity, base + calculateSkillPch(ordinary, pricing));
    } catch {
      // Unknown additional mechanics also fail closed, rather than becoming free.
      return UNPRICED_MODULAR_COPY_COMPLEXITY;
    }
  }

  try {
    return Math.max(complexity, calculateSkillPch(source.effect, pricing));
  } catch {
    // Non-modular legacy effects without prices retain their recorded PCH.
    return complexity;
  }
}
