/** Client-only soundtrack rules. Never affect combat turns or resource costs. */
export const CRITICAL_HP_FRACTION = 0.2;
export const CRITICAL_TEMPO_MULTIPLIER = 1.3;

/** Trigger when at least one living combatant is at or below one fifth HP.
 * Dead fighters and invalid health snapshots must not keep the music rushed.
 */
export function hasCriticalCombatHealth(fighters) {
  return Array.isArray(fighters) && fighters.some((fighter) =>
    Number.isFinite(fighter?.hp) &&
    Number.isFinite(fighter?.maxHp) &&
    fighter.maxHp > 0 &&
    fighter.hp > 0 &&
    fighter.hp <= fighter.maxHp * CRITICAL_HP_FRACTION);
}

/** Ease between normal and urgent tempo without resetting the song clock. */
export function easeCombatTempo(current, target, deltaSeconds) {
  if (!Number.isFinite(target) || target <= 0) return 1;
  if (!Number.isFinite(current) || current <= 0) return target;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current;
  const amount = 1 - Math.exp(-Math.min(deltaSeconds, 0.2) / 0.28);
  return current + (target - current) * amount;
}
