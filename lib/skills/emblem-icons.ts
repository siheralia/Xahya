/**
 * Narrative effect icons are stored on the individual narrative card (CARD:id),
 * not on the shared NARRATIVE type. Keep mechanical effect icons keyed by type.
 */
export type SkillEffectIconRef = { type: string; target?: string | null };
export type EffectIconDefinition = { type: string; icon: string };
export type NarrativeCardIconDefinition = { id: string; icon: string };

export function effectIconKey(effect: SkillEffectIconRef): string {
  return effect.type === "NARRATIVE" && typeof effect.target === "string" && effect.target.startsWith("CARD:")
    ? effect.target : effect.type;
}

export function catalogEffectIcons(
  effects: readonly EffectIconDefinition[],
  narrativeCards: readonly NarrativeCardIconDefinition[],
): Record<string,string> {
  return Object.fromEntries([
    ...effects.map(effect => [effect.type,effect.icon]),
    ...narrativeCards.map(card => [`CARD:${card.id}`,card.icon]),
  ]);
}

/** An explicit per-character override wins; then the latest managed catalog. */
export function resolveSkillEffectIcon(
  effect: SkillEffectIconRef,
  overrides: Readonly<Record<string,string>> | undefined,
  catalog: Readonly<Record<string,string>>,
): string | undefined {
  const key = effectIconKey(effect);
  return overrides?.[key] || catalog[key] || overrides?.[effect.type] || catalog[effect.type];
}
