import test from "node:test";
import assert from "node:assert/strict";
import {
  CRITICAL_HP_FRACTION, CRITICAL_TEMPO_MULTIPLIER,
  hasCriticalCombatHealth, easeCombatTempo,
} from "../lib/combat/music-tempo.mjs";

test("la fase crítica se activa al llegar exactamente a 1/5 de HP de cualquier luchador", () => {
  const player = { hp: 100, maxHp: 100 };
  const enemy = { hp: 20, maxHp: 100 };
  assert.equal(CRITICAL_HP_FRACTION, .2);
  assert.equal(CRITICAL_TEMPO_MULTIPLIER, 1.3);
  assert.equal(hasCriticalCombatHealth([player, enemy]), true);
  assert.equal(hasCriticalCombatHealth([enemy, player]), true);
  assert.equal(hasCriticalCombatHealth([{ hp: 4, maxHp: 20 }, player]), true);
  assert.equal(hasCriticalCombatHealth([{ hp: 21, maxHp: 100 }, player]), false);
});

test("curar sobre 20% restaura la música sin dejarla en fase crítica", () => {
  const player = { hp: 100, maxHp: 100 };
  const opponent = { hp: 12, maxHp: 60 };
  assert.equal(hasCriticalCombatHealth([player, opponent]), true);
  opponent.hp = 13;
  assert.equal(hasCriticalCombatHealth([player, opponent]), false);
  opponent.hp = 1;
  assert.equal(hasCriticalCombatHealth([player, opponent]), true);
});

test("HP nulos, combatientes muertos o estados inválidos no activan música crítica", () => {
  assert.equal(hasCriticalCombatHealth(undefined), false);
  assert.equal(hasCriticalCombatHealth([]), false);
  assert.equal(hasCriticalCombatHealth([{ hp: 0, maxHp: 100 }]), false);
  assert.equal(hasCriticalCombatHealth([{ hp: -2, maxHp: 100 }]), false);
  assert.equal(hasCriticalCombatHealth([{ hp: 10, maxHp: 0 }]), false);
  assert.equal(hasCriticalCombatHealth([{ hp: NaN, maxHp: 100 }]), false);
  assert.equal(hasCriticalCombatHealth([{ hp: 10, maxHp: Infinity }]), false);
});

test("el tempo se acerca gradualmente a 1,3 y regresa a 1 sin reiniciar la fase", () => {
  let tempo = 1;
  for (let frame = 0; frame < 60; frame++) {
    const next = easeCombatTempo(tempo, 1.3, 1 / 60);
    assert.ok(next >= tempo && next <= 1.3);
    tempo = next;
  }
  assert.ok(tempo > 1.28 && tempo < 1.3);
  const acceleratedTime = 10 + .1 * tempo;
  assert.ok(acceleratedTime > 10.1);
  for (let frame = 0; frame < 60; frame++) tempo = easeCombatTempo(tempo, 1, 1 / 60);
  assert.ok(tempo > 1 && tempo < 1.01);
  assert.equal(easeCombatTempo(1, 1.3, 0), 1);
  assert.equal(easeCombatTempo(1, 1.3, -5), 1);
});
