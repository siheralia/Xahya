import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDegrees, orbitalPoint, crossedNote, angleDistance } from '../lib/orbital-sequencer.mjs';

test('normaliza ángulos y puntos de una circunferencia', () => {
  assert.equal(normalizeDegrees(-10), 350);
  assert.equal(normalizeDegrees(725), 5);
  const top = orbitalPoint(100, 0);
  assert.ok(Math.abs(top.x - 320) < 1e-9);
  assert.ok(Math.abs(top.y - 220) < 1e-9);
  const right = orbitalPoint(100, 90);
  assert.ok(Math.abs(right.x - 420) < 1e-9);
  assert.ok(Math.abs(right.y - 320) < 1e-9);
});

test('detecta notas cruzadas, incluido el punto cero y las vueltas siguientes', () => {
  assert.equal(crossedNote(0.10, 0.20, 54), true);
  assert.equal(crossedNote(0.10, 0.12, 54), false);
  assert.equal(crossedNote(0.98, 1.01, 0), true);
  assert.equal(crossedNote(1.98, 2.01, 0), true);
  assert.equal(crossedNote(0.98, 1.01, 90), false);
  assert.equal(crossedNote(0.75, 0.74, 270), false);
});

test('el desfase no altera el tiempo de revolución', () => {
  const elapsed = 3;
  const secondsPerTurn = 12;
  const first = 0 / 360 + elapsed / secondsPerTurn;
  const second = 90 / 360 + elapsed / secondsPerTurn;
  assert.equal(second - first, 0.25);
  assert.equal(angleDistance(358, 2), 4);
});
