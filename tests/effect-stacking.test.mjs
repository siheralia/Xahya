import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/stats/effective.ts", import.meta.url), "utf8");

test("basic statistics use additive factor stacking", () => {
  assert.match(source, /itemFactors,\.\.\.perkFactors\]\.reduce\(\(sum:number,factor:number\)=>sum\+factor,0\)/);
});

test("derived statistics accumulate factors before applying once", () => {
  assert.match(source, /modifier\.factors\.reduce\(\(sum, value\) => sum \+ value, 0\)/);
  assert.match(source, /derived\[key\] = Number\(derived\[key\] \?\? 0\) \* factor \+ modifier\.bonus/);
});

test("derived items and perks share the same accumulator", () => {
  assert.match(source, /for \(const effect of validEffects\)/);
  assert.match(source, /for \(const effect of validPerks\)/);
  assert.match(source, /addDerived\(String\(effect\.type\)\.toUpperCase\(\)/);
  assert.match(source, /else addDerived\(type, target, amount\)/);
});

test("expected stacking rule: two and three are five", () => {
  const base = 20;
  const factors = [2, 3];
  const flatBonus = 4;
  assert.equal(base * factors.reduce((sum, factor) => sum + factor, 0) + flatBonus, 104);
});
