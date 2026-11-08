export const CRITICAL_HP_FRACTION: number;
export const CRITICAL_TEMPO_MULTIPLIER: number;
export function hasCriticalCombatHealth(fighters: ReadonlyArray<{ hp: number; maxHp: number } | null | undefined> | null | undefined): boolean;
export function easeCombatTempo(current: number, target: number, deltaSeconds: number): number;
