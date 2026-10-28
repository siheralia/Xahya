import test from "node:test";
import assert from "node:assert/strict";
import { durationPchCost } from "./duration-pricing";

test("three-turn buff costs more than one-turn buff", () => {
  assert.equal(durationPchCost(10, { kind: "TURNS", turns: 1 }), 10);
  assert.equal(durationPchCost(10, { kind: "TURNS", turns: 3 }), 15);
});
test("instant effects retain the base price by default", () => {
  assert.equal(durationPchCost(10, { kind: "INSTANT" }), 10);
});
test("invalid duration and pricing are rejected", () => {
  assert.throws(() => durationPchCost(10, { kind: "TURNS", turns: 0 }));
  assert.throws(() => durationPchCost(10, { kind: "TURNS", turns: 999 }));
  assert.throws(() => durationPchCost(10, { kind: "INSTANT" }, { instant: -1, oneTurn: 1, perExtraTurn: 0.25, maxTurns: 20 }));
});
