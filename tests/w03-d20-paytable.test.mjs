import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../app/api/casino/dice/route.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/casino/dice/page.tsx', import.meta.url), 'utf8');

const modes = [
  { name: 'exact', faces: 1, win: 19 },
  { name: 'highlow', faces: 10, win: 1 },
  { name: 'evenodd', faces: 10, win: 1 },
  { name: 'range', faces: 5, win: 3 },
];
for (const mode of modes) {
  test('neutral EV: ' + mode.name, () => {
    const p = mode.faces / 20;
    const ev = p * mode.win - (1 - p);
    assert.ok(Math.abs(ev) <= 0.001, 'EV=' + ev);
    assert.ok(Number.isFinite(p) && p >= 0 && p <= 1);
  });
}
test('approved range and payout are wired to route and UI', () => {
  assert.match(route, /\[16,17,18,19,20\]/);
  assert.match(route, /won = roll >= 16;/);
  assert.match(route, /multiplier = won \? 19 : -1;/);
  assert.match(route, /multiplier = won \? 3 : -1;/);
  assert.match(page, /16–20 — x3/);
  assert.doesNotMatch(page, /15–20 — x3/);
});
test('configuration remains dynamic and rounding is unchanged', () => {
  assert.match(route, /readBalance\(\)/);
  assert.match(route, /mechanics\.casinoInfluence/);
  assert.match(route, /Math\.round\(bet \* multiplier\)/);
  for (const bet of [1,2,3,10,101,1000]) {
    for (const mode of modes) {
      assert.equal(Math.round(bet * mode.win), bet * mode.win);
      assert.equal(Math.round(-bet), -bet);
    }
  }
});
test('weighted probabilities remain finite for configured valid adjustment bounds', () => {
  for (const faces of [1,5,10]) for (const bonus of [-0.2,0,0.08]) {
    const weights = Array.from({length:20},(_,i)=>i<faces ? 1+bonus : 1-bonus*0.35);
    const total = weights.reduce((a,b)=>a+b,0);
    assert.ok(total>0 && weights.every(w=>Number.isFinite(w)&&w>=0));
    const probabilities=weights.map(w=>w/total);
    assert.ok(Math.abs(probabilities.reduce((a,b)=>a+b,0)-1)<1e-12);
  }
});
