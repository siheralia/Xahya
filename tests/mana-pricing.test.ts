import { describe, expect, it } from "vitest";
import { manaAdjustedPch } from "../lib/skills/mana-pricing";
describe("mana-adjusted PCH", () => {
  it("keeps neutral mana at five per PCH", () => expect(manaAdjustedPch(10, 50)).toBe(10));
  it("increases PCH for low mana", () => expect(manaAdjustedPch(10, 10)).toBe(18));
  it("reduces PCH for high mana without reaching zero", () => expect(manaAdjustedPch(10, 100)).toBe(1));
  it("rejects invalid inputs", () => expect(() => manaAdjustedPch(10, -1)).toThrow());
});
