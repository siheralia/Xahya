/** Five mana per base PCH is neutral. Higher mana lowers creation PCH, lower mana raises it. */
export function manaAdjustedPch(basePch: number, manaCost: number): number {
  if (!Number.isSafeInteger(basePch) || basePch < 0 || !Number.isSafeInteger(manaCost) || manaCost < 0) throw new Error("Invalid PCH or mana cost");
  if (basePch === 0) return 0;
  return Math.max(1, Math.ceil(2 * basePch - manaCost / 5));
}
