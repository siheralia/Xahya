import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { importOrbitalMidi } from "../lib/orbital-midi.mjs";
import {
  ORCHESTRAL_INSTRUMENTS, createGoldenScore, parseOrbitalScore,
} from "../lib/orbital-score.mjs";
import { orbitalEventsBetween, orbitalVoicePlan } from "../lib/orbital-playback.mjs";
import {
  midiFromPitch, pitchFromMidi, orchestralEventsBetween,
} from "../lib/orbital-orchestra.mjs";

function coronaMidi() {
  const encoded = readFileSync("public/music/corona-de-cenizas.mid.gz.b64", "utf8");
  return gunzipSync(Buffer.from(encoded.trim(), "base64"));
}

test("Corona de Cenizas conserva sus 12 pistas orquestales y 587 notas del MIDI original", () => {
  const score = importOrbitalMidi(coronaMidi(), "Corona de Cenizas — orquestal");
  assert.equal(score.title, "Corona de Cenizas — orquestal");
  assert.equal(score.tracks.length, 12);
  assert.equal(score.tracks.reduce((sum, track) => sum + track.notes.length, 0), 587);
  assert.ok(score.groups[0].duration >= 27.8 && score.groups[0].duration <= 28);
  assert.ok(score.tracks.some(track => track.instrument === "violin"));
  assert.ok(score.tracks.some(track => track.instrument === "french_horn"));
  assert.ok(score.tracks.some(track => track.instrument === "choir_aahs"));
  assert.ok(score.tracks.some(track => track.instrument === "cello"));
  assert.ok(score.tracks.some(track => track.instrument === "drumkit"));
  assert.ok(score.tracks.some(track => track.notes.some(note => note.duration > 1)));
  assert.deepEqual(parseOrbitalScore(structuredClone(score)), score);
});

test("los acordes simultáneos no se aplanan en una sola nota", () => {
  const score = importOrbitalMidi(coronaMidi());
  const pad = score.tracks.find(track => track.name === "strings_pad");
  assert.ok(pad);
  assert.equal(pad.notes.filter(note => note.start === 0).length, 4);
  const now = orchestralEventsBetween(score, 0, .01);
  assert.ok(now.filter(event => event.instrument === "string_ensemble_1").length >= 4);
  assert.ok(now.filter(event => event.instrument === "cello").length >= 1);
  assert.ok(now.filter(event => event.instrument === "acoustic_bass").length >= 1);
  // Explicitly allow concurrent same-pitch voices from separate tracks.
  const chord = now.filter(event => event.pitch === 52);
  assert.ok(chord.length >= 2);
});

test("la duración real y la velocidad sobreviven al MIDI y al JSON", () => {
  const score = importOrbitalMidi(coronaMidi());
  const original = score.tracks[0].notes[0];
  assert.ok(original.duration > .2);
  assert.ok(original.velocity >= 1 && original.velocity <= 127);
  assert.ok(original.pitch >= 21 && original.pitch <= 108);
  assert.equal(parseOrbitalScore(score).tracks[0].notes[0].duration, original.duration);
  const old = createGoldenScore();
  assert.deepEqual(parseOrbitalScore(old), old);
  assert.deepEqual(old.tracks, []);
  assert.ok(old.rings.every(ring => ring.noteLengths.length === 0 && ring.instrument === "synth"));
});

test("el secuenciador repite pistas completas en cada período y respeta el inicio 0", () => {
  const score = importOrbitalMidi(coronaMidi());
  const period = score.groups[0].duration;
  const first = orchestralEventsBetween(score, 0, .1);
  const next = orchestralEventsBetween(score, period - .001, period + .1);
  assert.ok(first.length > 0);
  assert.deepEqual(
    next.map(({ trackIndex, instrument, pitch, duration, velocity }) =>
      [trackIndex, instrument, pitch, duration, velocity]),
    first.map(({ trackIndex, instrument, pitch, duration, velocity }) =>
      [trackIndex, instrument, pitch, duration, velocity]),
  );
  assert.ok(orchestralEventsBetween(score, 10, 10).length === 0);
});

test("una órbita antigua puede sostener una nota distinta sin alterar sus ángulos", () => {
  const old = createGoldenScore();
  const ring = old.rings.find(item => item.angles.length > 0);
  const angle = ring.angles[0];
  ring.noteLengths = [{ angle, duration: 2.5 }];
  ring.instrument = "violin";
  const score = parseOrbitalScore(old);
  const event = orbitalEventsBetween(score, 0, 16).find(note =>
    note.pitch === ring.pitch && note.angle === angle);
  assert.ok(event);
  assert.equal(event.length, 2.5);
  assert.equal(event.instrument, "violin");
  const untouched = orbitalEventsBetween(score, 0, 16).find(note => note.length === null);
  assert.ok(untouched);
});

test("rechaza duraciones, instrumentos y pistas imposibles", () => {
  const score = importOrbitalMidi(coronaMidi());
  assert.ok(ORCHESTRAL_INSTRUMENTS.includes("violin"));
  const invalid = structuredClone(score);
  invalid.tracks[0].notes[0].duration = -1;
  assert.throws(() => parseOrbitalScore(invalid), /inválidos/);
  invalid.tracks[0].notes[0].duration = 1;
  invalid.tracks[0].instrument = "peligroso";
  assert.throws(() => parseOrbitalScore(invalid), /inválidos/);
  const ringScore = createGoldenScore();
  const ring = ringScore.rings.find(item => item.angles.length);
  ring.noteLengths = [{ angle: ring.angles[0], duration: 31 }];
  assert.throws(() => parseOrbitalScore(ringScore), /inválidos/);
});

test("lector MIDI fail-closed ante cabeceras dañadas y archivos enormes", () => {
  assert.throws(() => importOrbitalMidi(new Uint8Array([1,2,3,4])), /MIDI/);
  assert.throws(() => importOrbitalMidi(new Uint8Array(1024 * 1024 + 1)), /1 MB/);
});

test("nombres y alturas MIDI estables en toda la orquesta", () => {
  assert.equal(midiFromPitch("C4"), 60);
  assert.equal(midiFromPitch("F#5"), 78);
  assert.equal(pitchFromMidi(69), "A4");
  assert.equal(pitchFromMidi(83), "B5");
  const short = orbitalVoicePlan(440, null, null, .12);
  assert.equal(short.hold, .12);
  const old = orbitalVoicePlan(440);
  assert.equal(old.hold, .23);
});
