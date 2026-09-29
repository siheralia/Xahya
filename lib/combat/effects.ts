export const COMBAT_EFFECTS = {
  attack_multiplier_all: "attack_multiplier_all",
  damage_reduction_all: "damage_reduction_all",
} as const;

export type CombatEffect = {
  type: keyof typeof COMBAT_EFFECTS;
  value: number;
  source: string;
  expiresAt: string | null;
};

export function getCombatEffects(modifiers: Array<{
  stat: unknown;
  amount: unknown;
  source: unknown;
  expiresAt: unknown;
}>): CombatEffect[] {
  return modifiers
    .filter((modifier) =>
      Object.prototype.hasOwnProperty.call(
        COMBAT_EFFECTS,
        String(modifier.stat),
      ),
    )
    .map((modifier) => ({
      type: String(modifier.stat) as CombatEffect["type"],
      value: Number(modifier.amount),
      source: String(modifier.source),
      expiresAt: modifier.expiresAt == null ? null : String(modifier.expiresAt),
    }));
}
