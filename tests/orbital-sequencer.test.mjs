import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDegrees, orbitalPoint, crossedNote, crossedOrbitalNote, orbitalTurnAt, angleDistance } from '../lib/orbital-sequencer.mjs';

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

test('permite inicio retrasado independiente por circunferencia', () => {
  assert.equal(orbitalTurnAt(2, 3, 45, 12, 1), null);
  assert.equal(orbitalTurnAt(3, 3, 90, 12, 1), 0.25);
  assert.equal(orbitalTurnAt(6, 3, 90, 12, 1), 0.5);
  assert.equal(orbitalTurnAt(15, 3, 90, 12, 1), 1.25);
});

test('dos grupos pueden recorrer en sentidos opuestos y diferentes ritmos', () => {
  const interior = orbitalTurnAt(6, 0, 0, 12, 1);
  const exterior = orbitalTurnAt(6, 0, 90, 8, -1);
  assert.equal(interior, 0.5);
  assert.equal(exterior, -0.5);
  assert.equal(crossedOrbitalNote(0.40, interior, 162), true);
  assert.equal(crossedOrbitalNote(-0.40, exterior, 198), true);
});

test('detecta paso inverso por 0° y no emite notas antes del inicio', () => {
  assert.equal(crossedOrbitalNote(0.02, -0.02, 0), true);
  assert.equal(crossedOrbitalNote(-0.98, -1.02, 0), true);
  assert.equal(crossedOrbitalNote(0.02, -0.02, 180), false);
  assert.equal(crossedOrbitalNote(null, 0.2, 54), false);
  assert.equal(crossedOrbitalNote(0.2, null, 54), false);
});

test('cada anillo completa su vuelta a la misma duración aunque comience después', () => {
  const duration = 12;
  const startFirst = orbitalTurnAt(0, 0, 25, duration, 1);
  const finishFirst = orbitalTurnAt(12, 0, 25, duration, 1);
  const startSecond = orbitalTurnAt(3, 3, 300, duration, 1);
  const finishSecond = orbitalTurnAt(15, 3, 300, duration, 1);
  assert.ok(Math.abs((finishFirst - startFirst) - 1) < 1e-9);
  assert.ok(Math.abs((finishSecond - startSecond) - 1) < 1e-9);
});
