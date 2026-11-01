/** A skill may require an effect and element, never a specific source skill. */
export type EffectRequirement = { effect: string; element: string };
export type SkillEffectDescriptor = { type?: string; target?: string; element?: string; capability?: string };
export type SkillWithEffects = { status: string; effect?: SkillEffectDescriptor[] | null };
export const CREATE_LIGHT: EffectRequirement = { effect: "CREATE", element: "LIGHT" };

export function providesEffect(skill: SkillWithEffects, requirement: EffectRequirement): boolean {
  if (skill.status !== "APPROVED" || !Array.isArray(skill.effect)) return false;
  return skill.effect.some(effect =>
    String(effect.element ?? "").toUpperCase() === requirement.element.toUpperCase()
    && (String(effect.capability ?? "").toUpperCase() === requirement.effect.toUpperCase()
      || String(effect.type ?? "").toUpperCase() === requirement.effect.toUpperCase())
  );
}
export function meetsEffectRequirements(
  requirements: readonly EffectRequirement[],
  skills: readonly SkillWithEffects[],
): boolean {
  return requirements.every(requirement => skills.some(skill => providesEffect(skill, requirement)));
}
