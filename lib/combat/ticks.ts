export type CombatAttackType = "CUT" | "BLUNT" | "PIERCE";

export const COMBAT_TICKS_PER_TURN = 100;

const ATTACK_TYPE_SPEED_MODIFIER: Record<CombatAttackType, number> = {
  CUT: 1,
  BLUNT: 1.15,
  PIERCE: 0.85,
};

/**
 * Provisional combat timing:
 * - AGI is the only base speed stat.
 * - A turn contains 100 combat ticks.
 * - 100 AGI takes 10 ticks for a neutral action.
 * - Higher AGI means fewer ticks; lower AGI means more.
 *
 * Formula: ceil((1000 / AGI) × speedModifier)
 *
 * Attack type only changes the action's relative speed:
 * CUT = 1.00, BLUNT = 1.15, PIERCE = 0.85.
 *
 * This is intentionally isolated so the formula can be changed later
 * without touching the combat UI or individual skills.
 */
export function calculateActionTicks(
  agility: number,
  speedModifier = 1,
): number {
  const safeAgility = Math.max(1, Number.isFinite(agility) ? agility : 1);
  const safeModifier = Math.max(0.05, Number.isFinite(speedModifier) ? speedModifier : 1);
  return Math.max(1, Math.ceil((1000 / safeAgility) * safeModifier));
}

export function calculateAttackTicks(
  agility: number,
  attackType: CombatAttackType = "CUT",
): number {
  return calculateActionTicks(agility, ATTACK_TYPE_SPEED_MODIFIER[attackType]);
}

export function getAttackTypeSpeedModifier(attackType: CombatAttackType): number {
  return ATTACK_TYPE_SPEED_MODIFIER[attackType];
}

export const SKILL_TICK_INTERVAL_MS = 1000;
export const SKILL_TICKS_PER_TURN = COMBAT_TICKS_PER_TURN;
export const MAX_SKILL_CATCHUP_TICKS = 1000;

export function elapsedSkillTicks(lastTickAt: Date | string | null, now = Date.now()): number {
  if (!lastTickAt) return 0;
  const elapsedMs = Math.max(0, now - new Date(String(lastTickAt)).getTime());
  return Math.min(MAX_SKILL_CATCHUP_TICKS, Math.floor(elapsedMs / SKILL_TICK_INTERVAL_MS));
}

export async function advanceCharacterSkillTicks(tx: any, characterId: number, now = new Date()) {
  const State = (tx.orm.public as any).CharacterSkillState;
  const Skill = (tx.orm.public as any).Skill;
  if (!State || !Skill) return [];
  const states = await State.where({ characterId, active: true }).all();
  const skills = await Skill.where({ characterId }).all();
  const results: any[] = [];
  const nowMs = now.getTime();

  for (const state of states) {
    const skill = skills.find((candidate: any) => Number(candidate.id) === Number(state.skillId));
    if (!skill || String(skill.status) !== "APPROVED") continue;
    const ticks = elapsedSkillTicks(state.lastTickAt, nowMs);
    if (ticks <= 0) continue;
    const perTick = Math.max(0, Number(skill.accumulationPerTick ?? 0));
    const added = ticks * perTick;
    const lastMs = new Date(String(state.lastTickAt)).getTime() + ticks * SKILL_TICK_INTERVAL_MS;
    const updated = await State.where({ id: Number(state.id) }).update({
      accumulations: Number(state.accumulations ?? 0) + added,
      totalTicks: Number(state.totalTicks ?? 0) + ticks,
      lastTickAt: new Date(lastMs),
      updatedAt: now,
    });
    results.push({ skillId: Number(state.skillId), ticks, added, state: updated });
  }
  return results;
}
