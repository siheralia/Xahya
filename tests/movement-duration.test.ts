import { describe, expect, it } from "vitest";
import { durationPchCost } from "../lib/effects/duration-pricing";
describe("movement durations", () => {
  it("prices three movements below one turn", () => expect(durationPchCost(10,{kind:"MOVEMENTS",movements:3})).toBeLessThan(durationPchCost(10,{kind:"TURNS",turns:1})));
  it("rejects zero movements", () => expect(()=>durationPchCost(10,{kind:"MOVEMENTS",movements:0})).toThrow());
});
