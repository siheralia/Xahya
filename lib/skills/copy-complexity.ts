import { calculateSkillPch, type EffectPricingMap } from "@/lib/skills/pch";

/**
 * Use the same compatibility complexity for search and for executing the copy.
 * Recorded PCH is a lower bound (legacy skills can predate current effect prices).
 */
export function copyComplexityPch(
  source: { pchCost?: number | null; effect?: unknown },
  pricing: EffectPricingMap,
): number {
  let complexity = Math.max(0, Number(source.pchCost ?? 0));
  try {
    if (Array.isArray(source.effect)) {
      complexity = Math.max(complexity, calculateSkillPch(source.effect, pricing));
    }
  } catch {
    // Legacy effects without prices retain their original recorded cost.
  }
  return complexity;
}
