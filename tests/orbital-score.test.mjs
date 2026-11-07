import test from "node:test";
import assert from "node:assert/strict";
import { createGoldenScore, parseOrbitalScore, GOLDEN_PHRASES, RING_PITCHES } from "../lib/orbital-score.mjs";

test("registro ampliado incluye las notas más agudas y el Fa sostenido", () => {
  assert.equal(RING_PITCHES.length, 16);
  assert.deepEqual(RING_PITCHES.slice(-4), ["G5", "A5", "B5", "C6"]);
  assert.ok(RING_PITCHES.includes("F#5"));
});

test("partitura de ejemplo conserva todas las 53 notas en orden y sin colisiones", () => {
  const score = createGoldenScore();
  const total = GOLDEN_PHRASES.reduce((n, phrase) => n + phrase.length, 0);
  assert.equal(total, 53);
  assert.equal(score.rings.reduce((n, r) => n + r.angles.length, 0), total);
  assert.deepEqual(score.groups, [{ duration: 16, direction: 1 }, { duration: 16, direction: 1 }]);
  assert.ok(score.rings.find((r) => r.pitch === "F#5")?.angles.length === 2);
  const chronological = score.rings.flatMap((ring) => ring.angles.map((angle) => [angle, ring.pitch]))
    .sort((a, b) => a[0] - b[0]).map((entry) => entry[1]);
  const expected = GOLDEN_PHRASES.flat().map((pitch) =>
    ({ A: "A4", B: "B4", C: "C5", D: "D5", E: "E5", "F#": "F#5", G: "G5" })[pitch]);
  assert.deepEqual(chronological, expected);
});

test("partitura exportada e importada conserva el estado", () => {
  const score = createGoldenScore();
  const copy = parseOrbitalScore(JSON.parse(JSON.stringify(score)));
  assert.deepEqual(copy, score);
});

test("se permite importar una partitura antigua con menos anillos conocidos", () => {
  const sample = createGoldenScore();
  sample.rings = sample.rings.slice(0, 7);
  const restored = parseOrbitalScore(sample);
  assert.equal(restored.rings.length, 16);
  assert.equal(restored.rings[15].enabled, false);
});

test("rechaza archivos inválidos y ángulos fuera del anillo", () => {
  assert.throws(() => parseOrbitalScore({}), /compatible/);
  const sample = createGoldenScore();
  sample.rings[0].angles.push(360);
  assert.throws(() => parseOrbitalScore(sample), /inválidos/);
  sample.rings[0].angles.pop();
  sample.rings[0].delay = -1;
  assert.throws(() => parseOrbitalScore(sample), /inválidos/);
});
