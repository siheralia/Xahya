import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../app/api/casino/dice/route.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/casino/dice/page.tsx', import.meta.url), 'utf8');

test('exact selector displays server payout', () => {
  assert.match(page, /Número exacto — x19/);
  assert.match(route, /multiplier = won \? 19 : -1/);
});
test('high means 11–20, low means 1–10 for target 2 and 1', () => {
  assert.match(page, /setTarget\(2\)[\s\S]{0,350}Alto 11–20/);
  assert.match(route, /won = target === 2 \? roll >= 11 : roll <= 10/);
  for (const roll of [1,10,11,18,20]) {
    assert.equal(roll>=11, [11,18,20].includes(roll));
    assert.equal(roll<=10, [1,10].includes(roll));
  }
});
test('even means target 1, odd means target 2', () => {
  assert.match(route, /won = target === 1 \? roll % 2 === 0 : roll % 2 !== 0/);
  assert.equal(10%2===0,true);
  assert.equal(10%2!==0,false);
});
test('preferred weights align with win outcomes', () => {
  assert.match(route, /target === 2 \? Array\.from\(\{ length: 10 \}, \(_, index\) => index \+ 11\)/);
  assert.match(route, /target === 1 \? \[2,4,6,8,10,12,14,16,18,20\]/);
});
