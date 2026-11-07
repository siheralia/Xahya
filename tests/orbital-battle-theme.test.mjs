import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_TURN_SECONDS, createBattleThemeScore, pitchFrequency } from "../lib/orbital-theme.mjs";
import { parseOrbitalScore } from "../lib/orbital-score.mjs";
import { orbitalEventsBetween, elapsedSlideProgress, orbitalVoicePlan } from "../lib/orbital-playback.mjs";

test("Ascenso de Xahya es una partitura completa y de dos recorridos", () => {
  const score = createBattleThemeScore();
  assert.equal(score.title, "Ascenso de Xahya — batalla");
  assert.equal(score.rings.length, 16);
  assert.deepEqual(score.groups, [{ duration: 8, direction: 1 }, { duration: 8, direction: 1 }]);
  assert.equal(score.rings.reduce((sum, ring) => sum + ring.angles.length, 0), 64);
  assert.equal(score.rings.flatMap((ring) => ring.slides).length, 3);
});

test("melodía aventurera original a mayor velocidad sube, baja y conecta semitonos", () => {
  const score = createBattleThemeScore();
  const notes = [];
  for (let ms = 0; ms < BATTLE_TURN_SECONDS * 1000; ms += 10) {
    const events = orbitalEventsBetween(score, ms / 1000, (ms + 10) / 1000);
    notes.push(...events.map((event) => ({ ...event, ms })));
  }
  const ascending = notes.some((a, i) => i > 0 && pitchFrequency(a.pitch) > pitchFrequency(notes[i - 1].pitch));
  const descending = notes.some((a, i) => i > 0 && pitchFrequency(a.pitch) < pitchFrequency(notes[i - 1].pitch));
  assert.ok(ascending);
  assert.ok(descending);
  assert.equal(notes.length, 64);
  assert.equal(notes.filter((event) => event.toPitch !== null).length, 3);
  for (const event of notes.filter((note) => note.toPitch)) {
    const semitones = 12 * Math.log2(pitchFrequency(event.toPitch) / pitchFrequency(event.pitch));
    assert.ok(Math.abs(semitones - 1) < 0.001, "El deslizamiento debe ser un semitono");
    assert.ok(event.duration <= 0.15);
  }
});

test("una nota sostenida recorre de 0 a 100% durante el glissando", () => {
  const score = createBattleThemeScore();
  const ring = score.rings.find((candidate) => candidate.pitch === "B5");
  const slide = ring.slides.find((candidate) => candidate.angle === 39.375);
  assert.ok(slide);
  const group = score.groups[1];
  const start = 7 / 64 * BATTLE_TURN_SECONDS;
  const from = elapsedSlideProgress(start, ring, group, slide);
  const middle = elapsedSlideProgress(start + slide.duration / 2, ring, group, slide);
  const after = elapsedSlideProgress(start + slide.duration + 0.05, ring, group, slide);
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


test("los barridos largos se convierten en legato breve al final del sonido", () => {
  const short = orbitalVoicePlan(pitchFrequency("B5"), pitchFrequency("C6"), 0.14);
  assert.equal(short.gliding, true);
  assert.ok(short.bend > 0 && short.bend <= 0.14);
  assert.equal(short.hold, 0.14);
  const long = orbitalVoicePlan(pitchFrequency("E5"), pitchFrequency("F5"), 2.5);
  assert.equal(long.hold, 2.5);
  assert.ok(long.bend <= 0.14);
  assert.ok(long.hold - long.bend > 2.3);
  const plain = orbitalVoicePlan(pitchFrequency("C4"));
  assert.equal(plain.gliding, false);
  assert.equal(plain.bass, true);
  assert.ok(plain.hold < 0.3);
});

test("el tema mantiene una progresión armónica clara por secciones", () => {
  const score = createBattleThemeScore();
  const expectedBass = ["A4", "F4", "G4", "E4"];
  for (const [part, pitch] of expectedBass.entries()) {
    const angle = ((part * 16 + 1) / 64) * 360;
    const ring = score.rings.find((lane) => lane.pitch === pitch);
    assert.ok(ring.angles.includes(angle), "Falta el bajo del acorde " + part);
  }
  assert.deepEqual(score.rings.flatMap((lane) =>
    lane.slides.map((slide) => lane.pitch + ">" + slide.toPitch)).sort(),
    ["B5>C6", "E5>F5", "F#5>G5"].sort());
});
