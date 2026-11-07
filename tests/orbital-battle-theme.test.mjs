import test from "node:test";
import assert from "node:assert/strict";
import { createBattleThemeScore, pitchFrequency } from "../lib/orbital-theme.mjs";
import { parseOrbitalScore } from "../lib/orbital-score.mjs";
import { orbitalEventsBetween, elapsedSlideProgress } from "../lib/orbital-playback.mjs";

test("Ascenso de Xahya es una partitura completa y de dos recorridos", () => {
  const score = createBattleThemeScore();
  assert.equal(score.title, "Ascenso de Xahya — batalla");
  assert.equal(score.rings.length, 16);
  assert.deepEqual(score.groups, [{ duration: 16, direction: 1 }, { duration: 16, direction: 1 }]);
  assert.ok(score.rings.reduce((sum, ring) => sum + ring.angles.length, 0) > 45);
  assert.equal(score.rings.flatMap((ring) => ring.slides).length, 7);
});

test("melodía épica original tiene subidas, bajadas y siete glissandos", () => {
  const score = createBattleThemeScore();
  const notes = [];
  for (let ms = 0; ms < 16000; ms += 10) {
    const events = orbitalEventsBetween(score, ms / 1000, (ms + 10) / 1000);
    notes.push(...events.map((event) => ({ ...event, ms })));
  }
  const ascending = notes.some((a, i) => i > 0 && pitchFrequency(a.pitch) > pitchFrequency(notes[i - 1].pitch));
  const descending = notes.some((a, i) => i > 0 && pitchFrequency(a.pitch) < pitchFrequency(notes[i - 1].pitch));
  assert.ok(ascending);
  assert.ok(descending);
  assert.equal(notes.filter((event) => event.toPitch !== null).length, 7);
});

test("una nota sostenida recorre de 0 a 100% durante el glissando", () => {
  const score = createBattleThemeScore();
  const ring = score.rings.find((candidate) => candidate.pitch === "E5");
  const slide = ring.slides.find((candidate) => candidate.angle === 5.625);
  assert.ok(slide);
  const group = score.groups[1];
  const from = elapsedSlideProgress(0.25, ring, group, slide);
  const middle = elapsedSlideProgress(0.25 + slide.duration / 2, ring, group, slide);
  const after = elapsedSlideProgress(0.25 + slide.duration + 0.05, ring, group, slide);
  assert.ok(from !== null && Math.abs(from) < 0.00001);
  assert.ok(middle !== null && Math.abs(middle - 0.5) < 0.00001);
  assert.equal(after, null);
});

test("la importación conserva los deslizamientos y acepta partituras anteriores", () => {
  const score = createBattleThemeScore();
  assert.deepEqual(parseOrbitalScore(JSON.parse(JSON.stringify(score))), score);
  const old = JSON.parse(JSON.stringify(score));
  old.rings.forEach((ring) => delete ring.slides);
  const restored = parseOrbitalScore(old);
  assert.ok(restored.rings.every((ring) => ring.slides.length === 0));
});

test("los deslizamientos inválidos se rechazan antes de guardarse en la cuenta", () => {
  const score = createBattleThemeScore();
  const invalid = JSON.parse(JSON.stringify(score));
  const slideRing = invalid.rings.find((ring) => ring.pitch === "E5");
  slideRing.slides[0].toPitch = "Z9";
  assert.throws(() => parseOrbitalScore(invalid), /inválidos/);
  slideRing.slides[0].toPitch = "G5";
  slideRing.slides[0].duration = 999;
  assert.throws(() => parseOrbitalScore(invalid), /inválidos/);
  slideRing.slides[0].duration = 0.43;
  slideRing.slides[0].angle = 1;
  assert.throws(() => parseOrbitalScore(invalid), /inválidos/);
});

test("el motor ignora un anillo apagado y todos los eventos dependen de la partitura", () => {
  const score = createBattleThemeScore();
  const before = orbitalEventsBetween(score, 0.25, 0.5);
  const changed = JSON.parse(JSON.stringify(score));
  changed.rings.forEach((ring) => { ring.enabled = false; });
  assert.ok(before.length > 0);
  assert.deepEqual(orbitalEventsBetween(changed, 0, 16), []);
});
