/**
 * Pure, declarative foundation for temporary statistic-copy effects.
 * No database writes, no arbitrary expressions, no combat dependency.
 */
export const BASIC_COPY_STATS = ["STR", "AGI", "CON", "INT", "WIS", "CHA", "SPI", "LCK"] as const;
export type BasicCopyStat = typeof BASIC_COPY_STATS[number];
export type CopyMode = "BASE" | "EFFECTIVE";
export type StatSnapshot = {
  base: number;
  /** Effective value without karma boosts, calculated by the authoritative stats pipeline. */
  effectiveWithoutKarma: number;
  /** Karma boost belonging to this character, never borrowed from the target. */
  ownKarmaBoost: number;
};
export type CopyEffect = {
  kind: "COPY_STAT";
  stat: BasicCopyStat;
  mode: CopyMode;
  targetCharacterId: string;
  expiresAt: string;
};
export function isBasicCopyStat(value: string): value is BasicCopyStat {
  return (BASIC_COPY_STATS as readonly string[]).includes(value);
}
/** Returns null for expired effects; never persists the copied statistic. */
export function resolveCopiedStat(
  effect: CopyEffect,
  target: StatSnapshot,
  recipient: StatSnapshot,
  now: Date,
): number | null {
  if (!isBasicCopyStat(effect.stat) || !effect.targetCharacterId.trim()) throw new Error("Objetivo o estadística inválida");
  const expiry = Date.parse(effect.expiresAt);
  if (!Number.isFinite(expiry)) throw new Error("Caducidad inválida");
  if (now.getTime() >= expiry) return null;
  for (const n of [target.base, target.effectiveWithoutKarma, recipient.ownKarmaBoost]) {
    if (!Number.isFinite(n)) throw new Error("Estadística no finita");
  }
  const copied = effect.mode === "BASE" ? target.base :
    effect.mode === "EFFECTIVE" ? target.effectiveWithoutKarma : NaN;
  if (!Number.isFinite(copied)) throw new Error("Modo de copia inválido");
  return copied + recipient.ownKarmaBoost;
}
