import test from "node:test";
import assert from "node:assert/strict";
import { BATTLE_TURN_SECONDS, createBattleThemeScore, pitchFrequency } from "../lib/orbital-theme.mjs";
import { createGoldenScore, parseOrbitalScore } from "../lib/orbital-score.mjs";
import {
  orbitalEventsBetween, orbitalPercussionBetween, elapsedSlideProgress, orbitalVoicePlan,
} from "../lib/orbital-playback.mjs";

function hear(score, seconds = 24) {
  const events = [];
  for (let ms = 0; ms < seconds * 1000; ms += 10) {
    events.push(...orbitalEventsBetween(score, ms / 1000, (ms + 10) / 1000)
      .map((event) => ({ ...event, time: (ms + 10) / 1000 })));
  }
  return events;
}

test("Corazón del Abismo es una melodía de jefe ORIGINAL a 160 BPM", () => {
  const score = createBattleThemeScore();
  assert.equal(score.title, "Corazón del Abismo — jefe");
  assert.equal(score.percussion, "boss");
  assert.equal(BATTLE_TURN_SECONDS, 12);
  assert.equal(score.rings.length, 16);
  assert.deepEqual(score.groups, [{ duration: 12, direction: 1 }, { duration: 12, direction: 1 }]);
  assert.deepEqual([...new Set(score.rings.filter(r => r.enabled).map(r => r.duration))].sort((a,b) => a-b), [6, 12]);
  assert.deepEqual([...new Set(score.rings.filter(r => r.enabled).map(r => r.direction))].sort((a,b) => a-b), [-1, 1]);
  assert.equal(score.rings.reduce((sum, ring) => sum + ring.angles.length, 0), 101);
  assert.equal(score.rings.flatMap(r => r.slides).length, 1);
  assert.deepEqual(score.rings.filter(r => r.instrument === "bass").map(r => r.pitch),
    ["C4","D4","E4","F4","G4","A4","B4"]);
  assert.deepEqual(score.rings.filter(r => r.instrument === "strings").map(r => r.pitch),
    ["C5","F#5"]);
  assert.deepEqual(score.rings.filter(r => r.instrument === "pulse").map(r => r.pitch),
    ["D5","E5","F5","G5","A5","B5","C6"]);
});

test("la melodía y la batería repiten idénticas sus ocho compases cada 12 segundos", () => {
  const score = createBattleThemeScore();
  const events = hear(score);
  const first = events.filter(e => e.time <= 12);
  const second = events.filter(e => e.time > 12);
  assert.equal(first.length, 102);
  assert.equal(second.length, 102);
  const signatures = items => items.map(({ pitch, instrument, angle, toPitch }) =>
    [pitch, instrument, angle, toPitch]);
  assert.deepEqual(signatures(first), signatures(second));
  const drums = orbitalPercussionBetween(score, 0, 24.01);
  const one = drums.filter(e => e.time < 12);
  const two = drums.filter(e => e.time >= 12 && e.time < 24);
  assert.deepEqual(one.map(e => [e.type, e.time]), two.map(e => [e.type, e.time - 12]));
});

test("melodía rápida con saltos, repeticiones intencionales y cambios de registro", () => {
  const score = createBattleThemeScore();
  const leadPitches = new Set(["D5","E5","F5","G5","A5","B5","C6"]);
  const lead = hear(score, 12).filter(event => leadPitches.has(event.pitch));
  assert.equal(lead.length, 48);
  assert.ok(lead.some(event => event.pitch === "C6"));
  assert.ok(lead.some(event => event.pitch === "D5"));
  assert.ok(lead.some(event => event.pitch === "F5"));
  assert.ok(lead.every(event => event.instrument === "pulse"));
  const ticks = lead.map(event => Math.round(event.time / (12/128)));
  assert.ok(ticks.some((tick,i) => i && tick - ticks[i-1] === 2), "Hay ataques rápidos");
  assert.ok(ticks.some((tick,i) => i && tick - ticks[i-1] >= 4), "Hay respiraciones");
});

test("el último Fa5 resuelve por semitono al Mi5 de la nueva vuelta", () => {
  const score = createBattleThemeScore();
  const events = hear(score, 24);
  const ending = events.find(e => e.pitch === "F5" && e.toPitch === "E5" &&
    e.time > 11.8 && e.time < 12);
  const opening = events.find(e => e.pitch === "E5" && e.time > 12 && e.time < 12.25);
  assert.ok(ending);
  assert.ok(opening);
  const plan = orbitalVoicePlan(pitchFrequency("F5"), pitchFrequency("E5"), .14, "pulse");
  assert.equal(plan.gliding, true);
  assert.ok(plan.hold > plan.bend);
  assert.ok(opening.time - ending.time < plan.hold + 0.03);
  const steps = 12 * Math.log2(pitchFrequency("F5") / pitchFrequency("E5"));
  assert.ok(Math.abs(steps - 1) < 0.0001);
  const ring = score.rings.find(r => r.pitch === "F5");
  const slide = ring.slides[0];
  assert.equal(elapsedSlideProgress(11.92, ring, {
    duration: ring.duration, direction: ring.direction,
  }, slide), null);
  assert.ok(Math.abs(elapsedSlideProgress(12.03625, ring, {
    duration: ring.duration, direction: ring.direction,
  }, slide) - 0.5) < 0.0001);
});

test("el anillo Fa#5 de 6 s repite el golpe cromático dos veces por vuelta", () => {
  const score = createBattleThemeScore();
  const ring = score.rings.find(r => r.pitch === "F#5");
  assert.equal(ring.duration, 6);
  assert.equal(ring.angles.length, 1);
  const events = hear(score, 12).filter(e => e.pitch === "F#5");
  assert.equal(events.length, 2);
  assert.ok(Math.abs(events[1].time - events[0].time - 6) < 0.011);
});

test("batería rock: caja en beats 2/4, bajo y bombo en pulsos fuertes", () => {
  const score = createBattleThemeScore();
  const first = orbitalPercussionBetween(score, 0, 0.19);
  assert.deepEqual(first.map(e => e.type), ["kick","hat","cymbal"]);
  const drums = orbitalPercussionBetween(score, 0, 12);
  const byType = type => drums.filter(e => e.type === type);
  assert.equal(byType("kick").length, 19);
  assert.equal(byType("snare").length, 16);
  assert.equal(byType("hat").length, 17);
  assert.equal(byType("cymbal").length, 3);
  assert.deepEqual(byType("snare").slice(0,4).map(e => e.time), [0.375,1.125,1.875,2.625]);
  assert.ok(drums.every(e => e.type !== "timpani"));
  const old = structuredClone(score);
  old.percussion = "battle";
  assert.deepEqual(orbitalPercussionBetween(old, 0, .38).map(e => e.type), ["kick","hat"]);
  old.percussion = "none";
  assert.deepEqual(orbitalPercussionBetween(old, 0,12), []);
});

test("pulse: síntesis cortante con notas breves pero no pulsos robóticos continuos", () => {
  const pulse = orbitalVoicePlan(pitchFrequency("E5"), null, null, "pulse");
  const synth = orbitalVoicePlan(pitchFrequency("E5"));
  const bass = orbitalVoicePlan(pitchFrequency("E4"), null, null, "bass");
  const bowed = orbitalVoicePlan(pitchFrequency("C5"), null, null, "strings");
  assert.equal(pulse.pulse, true);
  assert.equal(pulse.hold, .15);
  assert.equal(pulse.release, .075);
  assert.ok(pulse.hold < bowed.hold);
  assert.ok(bass.deepBass);
  assert.ok(bass.hold > synth.hold);
});

test("JSON v1 conserva los nuevos instrumentos y rechaza valores extraños", () => {
  const score = createBattleThemeScore();
  assert.deepEqual(parseOrbitalScore(structuredClone(score)), score);
  const broken = structuredClone(score);
  broken.rings[0].instrument = "noise";
  assert.throws(() => parseOrbitalScore(broken), /inválidos/);
  broken.rings[0].instrument = "bass";
  broken.percussion = "unsupported";
  assert.throws(() => parseOrbitalScore(broken), /percusión/);
  broken.percussion = "boss";
  broken.rings[0].angles.push(broken.rings[0].angles[0]);
  assert.throws(() => parseOrbitalScore(broken), /inválidos/);
});

test("los archivos viejos siguen cargando con instrumento synth y sin percusión", () => {
  const old = createGoldenScore();
  delete old.percussion;
  old.rings.forEach(r => {
    delete r.duration; delete r.direction; delete r.instrument; delete r.slides;
  });
  const loaded = parseOrbitalScore(old);
  assert.equal(loaded.percussion, "none");
  assert.ok(loaded.rings.every(r => r.instrument === "synth"));
  assert.ok(loaded.rings.every(r => r.duration === 16));
});

test("cada órbita conserva la dirección/velocidad y sus efectos en silencio", () => {
  const score = createBattleThemeScore();
  const silent = structuredClone(score);
  silent.rings.forEach(r => { r.enabled = false; });
  silent.percussion = "none";
  assert.deepEqual(orbitalEventsBetween(silent, 0, 12), []);
  assert.deepEqual(orbitalPercussionBetween(silent, 0, 12), []);
  assert.ok(score.rings.some(r => r.direction === -1));
});
