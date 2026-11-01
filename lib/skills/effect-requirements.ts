export type EffectRequirement = { effect: string; element?: string };
export type SkillEffectDescriptor = { type?: string; target?: string; element?: string; capability?: string };
export type SkillWithEffects = { status: string; effect?: SkillEffectDescriptor[] | null };
export const CREATE_LIGHT: EffectRequirement = { effect: "CREATE", element: "LIGHT" };
export function validEffectRequirements(value: unknown): value is EffectRequirement[] {
  return Array.isArray(value) && value.length <= 10 && value.every((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const r = item as Record<string, unknown>;
    return typeof r.effect === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(r.effect)
      && (r.element === undefined || r.element === "" || (typeof r.element === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(r.element)));
  }) && new Set(value.map((r: EffectRequirement) => r.effect + ":" + (r.element || ""))).size === value.length;
}
export function providesEffect(skill: SkillWithEffects, requirement: EffectRequirement): boolean {
  return skill.status === "APPROVED" && Array.isArray(skill.effect) && skill.effect.some(e =>
    (String(e.capability ?? "").toUpperCase() === requirement.effect || String(e.type ?? "").toUpperCase() === requirement.effect)
    && (!requirement.element || String(e.element ?? "").toUpperCase() === requirement.element)
  );
}
export function meetsEffectRequirements(requirements: readonly EffectRequirement[], skills: readonly SkillWithEffects[]): boolean {
  return requirements.every(r => skills.some(s => providesEffect(s, r)));
}
/** Requirements are a tradeoff at skill creation: owning the effect is checked on activation, not purchase. */
export function effectRequirementDiscountPercent(requirements: readonly EffectRequirement[]): number {
  return Math.min(50, requirements.reduce((sum, r) => sum + (r.element ? 20 : 10), 0));
}

/** Effect-only: 10%; effect + element: 20%. Caps at 50% total. */
export function effectRequirementDiscount(pch: number, requirements: readonly EffectRequirement[]): number {
  if (!Number.isSafeInteger(pch) || pch < 0) throw new Error("Costo PCH inválido");
  if (!validEffectRequirements(requirements)) throw new Error("Requisitos por efecto inválidos.");
  const percentage = effectRequirementDiscountPercent(requirements);
  return pch === 0 ? 0 : Math.max(1, Math.ceil(pch * (100 - percentage) / 100));
}
