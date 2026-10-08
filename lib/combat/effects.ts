export const COMBAT_EFFECTS = {
  attack_multiplier_all: "attack_multiplier_all",
  damage_reduction_all: "damage_reduction_all",
  damage_reduction_physical: "damage_reduction_physical",
  damage_reduction_magical: "damage_reduction_magical",
  damage_increase_all: "damage_increase_all",
  damage_increase_physical: "damage_increase_physical",
  damage_increase_magical: "damage_increase_magical",
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
