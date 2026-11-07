import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_TURN_SECONDS, createBattleThemeScore, pitchFrequency } from "../lib/orbital-theme.mjs";
import { createGoldenScore, parseOrbitalScore } from "../lib/orbital-score.mjs";
import {
  orbitalEventsBetween, orbitalPercussionBetween, elapsedSlideProgress, orbitalVoicePlan,
} from "../lib/orbital-playback.mjs";

function hear(score, seconds = 16) {
  const events = [];
  for (let ms = 0; ms < seconds * 1000; ms += 10) {
    events.push(...orbitalEventsBetween(score, ms / 1000, (ms + 10) / 1000)
      .map((event) => ({ ...event, time: (ms + 10) / 1000 })));
  }
  return events;
}

test("la partitura batalla tiene 16 órbitas, 3 velocidades y giros independientes", () => {
  const score = createBattleThemeScore();
  assert.equal(score.title, "Ascenso de Xahya — batalla");
  assert.equal(score.percussion, "battle");
  assert.equal(score.rings.length, 16);
  assert.equal(BATTLE_TURN_SECONDS, 8);
  assert.deepEqual(score.groups, [{ duration: 8, direction: 1 }, { duration: 8, direction: 1 }]);
  assert.deepEqual([...new Set(score.rings.filter((ring) => ring.enabled).map((ring) => ring.duration))].sort((a,b) => a-b), [4, 8, 16]);
  assert.deepEqual([...new Set(score.rings.filter((ring) => ring.enabled).map((ring) => ring.direction))].sort((a,b) => a-b), [-1, 1]);
  assert.equal(score.rings.reduce((sum, ring) => sum + ring.angles.length, 0), 70);
  assert.equal(score.rings.flatMap((ring) => ring.slides).length, 4);
});

test("el sonido repite exactamente la misma melodía cada 8 s aunque las órbitas varíen", () => {
  const score = createBattleThemeScore();
  const notes = hear(score, 16);
  const first = notes.filter((note) => note.time < 8.001);
  const second = notes.filter((note) => note.time >= 8.001);
  assert.equal(first.length, 71);
  assert.equal(second.length, 71);
  const voices = (items) => items.map(({ pitch, toPitch, duration }) => [pitch, toPitch, duration]);
  assert.deepEqual(voices(second), voices(first));
});

test("el final Si5 enlaza por semitono con el Do6 del comienzo", () => {
  const score = createBattleThemeScore();
  const events = hear(score, 16);
  const finish = events.find((event) => event.pitch === "B5" && event.toPitch === "C6" &&
    event.time > 7.8 && event.time < 8);
  assert.ok(finish, "Falta el enlace melódico al final de la vuelta");
  const opening = events.find((event) => event.pitch === "C6" && event.time > 8 && event.time < 8.3);
  assert.ok(opening, "La nueva vuelta no retoma el Do6");
  assert.ok(opening.time - finish.time < 0.3, "Hay un silencio largo entre vueltas");
  assert.ok(Math.abs(12 * Math.log2(pitchFrequency("C6") / pitchFrequency("B5")) - 1) < 0.001);
  assert.ok(events.find((event) => event.pitch === "E4" && event.time > 7.5 && event.time < 8));
  assert.ok(events.find((event) => event.pitch === "A4" && event.time > 8 && event.time < 8.3));
});

test("los tres glissandos audibles son breves y sólo recorren un semitono", () => {
  const events = hear(createBattleThemeScore(), 8);
  const slides = events.filter((event) => event.toPitch !== null);
  assert.equal(slides.length, 3);
  for (const event of slides) {
    assert.ok(event.duration <= 0.15);
    const steps = 12 * Math.log2(pitchFrequency(event.toPitch) / pitchFrequency(event.pitch));
    assert.ok(Math.abs(steps - 1) < 0.001);
  }
});

test("el glissando que cierra el bucle sigue animándose a través del límite 8 s", () => {
  const score = createBattleThemeScore();
  const ring = score.rings.find((lane) => lane.pitch === "B5");
  const slide = ring.slides.find((item) => item.toPitch === "C6");
  const midpoint = elapsedSlideProgress(7.945, ring, {
    duration: ring.duration, direction: ring.direction,
  }, slide);
  assert.ok(Math.abs(midpoint - 0.5) < 0.00001);
  assert.equal(elapsedSlideProgress(8.03, ring, {
    duration: ring.duration, direction: ring.direction,
  }, slide), null);
});

test("la percusión añade ataque marcial y también conecta ambas vueltas", () => {
  const score = createBattleThemeScore();
  const first = orbitalPercussionBetween(score, 0, 0.26);
  assert.deepEqual(first.map((item) => item.type), ["kick", "hat"]);
  const boundary = orbitalPercussionBetween(score, 7.98, 8.01);
  assert.ok(boundary.some((item) => item.type === "kick" && item.time === 8));
  const silent = structuredClone(score);
  silent.percussion = "none";
  assert.deepEqual(orbitalPercussionBetween(silent, 0, 8), []);
});

test("el movimiento individual cambia el orden real de los disparos y no sólo el SVG", () => {
  const score = createGoldenScore();
  const baseline = hear(score, 1);
  const changed = structuredClone(score);
  const ring = changed.rings.find((lane) => lane.pitch === "G5");
  ring.duration = 4;
  ring.direction = -1;
  const altered = hear(changed, 1);
  assert.notDeepEqual(altered, baseline);
});

test("las partituras JSON previas heredan el movimiento de los dos grupos", () => {
  const old = structuredClone(createGoldenScore());
  delete old.percussion;
  old.rings.forEach((ring) => { delete ring.duration; delete ring.direction; });
  const loaded = parseOrbitalScore(old);
  assert.equal(loaded.percussion, "none");
  assert.deepEqual(loaded.rings.slice(0, 4).map((ring) => ring.duration), [16,16,16,16]);
  assert.ok(loaded.rings.every((ring) => ring.direction === 1));
  assert.deepEqual(parseOrbitalScore(structuredClone(loaded)), loaded);
});

test("guardar/exportar mantiene giros, duraciones, percusión y deslizamientos", () => {
  const score = createBattleThemeScore();
  assert.deepEqual(parseOrbitalScore(structuredClone(score)), score);
  const invalid = structuredClone(score);
  invalid.rings[0].duration = -1;
  assert.throws(() => parseOrbitalScore(invalid), /inválidos/);
  invalid.rings[0].duration = 8;
  invalid.rings[0].direction = 0;
  assert.throws(() => parseOrbitalScore(invalid), /inválidos/);
  invalid.rings[0].direction = -1;
  invalid.percussion = "sorpresa";
  assert.throws(() => parseOrbitalScore(invalid), /percusión/);
});

test("los deslizamientos inválidos siguen rechazándose", () => {
  const score = createBattleThemeScore();
  const invalid = structuredClone(score);
  const slide = invalid.rings.find((ring) => ring.pitch === "B5").slides[0];
  slide.toPitch = "Z9";
  assert.throws(() => parseOrbitalScore(invalid), /inválidos/);
  slide.toPitch = "C6";
  slide.duration = 999;
  assert.throws(() => parseOrbitalScore(invalid), /inválidos/);
});

test("el instrumento emplea legato breve, no barridos largos", () => {
  const short = orbitalVoicePlan(pitchFrequency("B5"), pitchFrequency("C6"), 0.14);
  assert.equal(short.gliding, true);
  assert.ok(short.bend <= 0.14);
  const long = orbitalVoicePlan(pitchFrequency("E5"), pitchFrequency("F5"), 2.5);
  assert.ok(long.hold - long.bend > 2.3);
  const plain = orbitalVoicePlan(pitchFrequency("C4"));
  assert.equal(plain.bass, true);
});

test("apagar las órbitas y desactivar la percusión produce silencio", () => {
  const silent = structuredClone(createBattleThemeScore());
  silent.percussion = "none";
  silent.rings.forEach((ring) => { ring.enabled = false; });
  assert.deepEqual(orbitalEventsBetween(silent, 0, 8), []);
  assert.deepEqual(orbitalPercussionBetween(silent, 0, 8), []);
});
