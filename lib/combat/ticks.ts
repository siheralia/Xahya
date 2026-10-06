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
