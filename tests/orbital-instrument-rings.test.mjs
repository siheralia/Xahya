import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { importOrbitalMidi } from "../lib/orbital-midi.mjs";
import { parseOrbitalScore } from "../lib/orbital-score.mjs";
import { orchestralEventsBetween } from "../lib/orbital-orchestra.mjs";
import {
  CORONA_TITLE, loadCoronaDefault, moveInstrumentOrbit, normalizeOrbitAngle,
  orbitPositionForNote, orbitTimeForAngle, orchestrateInstrumentOrbits,
} from "../lib/orbital-instrument-rings.mjs";

const source = readFileSync("public/music/corona-de-cenizas.mid.gz.b64", "utf8").trim();
const midi = gunzipSync(Buffer.from(source, "base64"));
const original = importOrbitalMidi(midi, CORONA_TITLE);
const corona = orchestrateInstrumentOrbits(original);
const period = corona.groups[0].duration;
const allNotes = (score) => score.tracks.flatMap(track => track.notes);
function playByFrames(score, duration) {
  const events = [];
  const frames = Math.ceil(duration * 20);
  for (let index = 0; index < frames; index++) {
    const from = index / 20;
    const to = Math.min((index + 1) / 20, duration - .0001);
    if (from < to) events.push(...orchestralEventsBetween(score, from, to));
  }
  return events;
}

test("Corona pasa de MIDI oculto a doce órbitas con 587 notas originales", () => {
  assert.equal(corona.title, CORONA_TITLE);
  assert.equal(corona.tracks.length, 12);
  assert.equal(allNotes(corona).length, 587);
  assert.deepEqual(corona.tracks.map(t => t.notes), original.tracks.map(t => t.notes));
  assert.deepEqual(parseOrbitalScore(structuredClone(corona)), corona);
  const speeds = new Set(corona.tracks.map(t => Number(t.orbit.duration.toFixed(4))));
  assert.ok(speeds.size >= 4, "Orbits have different speeds");
  assert.ok(corona.tracks.every(t => t.orbit.enabled));
  assert.ok(corona.tracks.some(t => t.orbit.direction === -1));
  assert.ok(corona.tracks.some(t => t.orbit.direction === 1));
  const bass = corona.tracks.find(t => t.instrument === "acoustic_bass");
  const drums = corona.tracks.find(t => t.instrument === "drumkit");
  assert.ok(Math.abs(bass.orbit.duration * 4 - period) < .00001);
  assert.ok(Math.abs(drums.orbit.duration * 8 - period) < .00001);
});

test("Acordes simultáneos y vueltas distintas no duplican ni pierden ataques", () => {
  // The exact right boundary starts the next loop, so stop just before it.
  const first = playByFrames(original, period);
  const orbitEvents = playByFrames(corona, period);
  assert.equal(first.length, 587);
  assert.deepEqual(orbitEvents, first, "The new orbit score has exactly the same played notes");
  const second = orchestralEventsBetween(corona, period - .01, period + .3);
  assert.ok(second.some(e => e.time >= period));
  const strings = corona.tracks.find(t => t.name === "strings_pad");
  const chord = strings.notes.filter(n => n.start === 0);
  assert.equal(chord.length, 4);
  const silent = structuredClone(corona);
  silent.tracks[0].orbit.enabled = false;
  assert.equal(playByFrames(silent, period).length,
    587 - corona.tracks[0].notes.length);
});

test("Cada nota coincide con el cabezal de su órbita en su vuelta correcta", () => {
  for (const track of corona.tracks) {
    for (const note of track.notes) {
      const { lap, angle } = orbitPositionForNote(note, track.orbit);
      const timestamp = orbitTimeForAngle(angle, track.orbit, lap);
      assert.ok(Math.abs(note.start - timestamp) < .00001,
        track.name + " pitch " + note.pitch + " at " + note.start + ", got " + timestamp);
    }
  }
  assert.equal(normalizeOrbitAngle(-90), 270);
  assert.equal(normalizeOrbitAngle(450), 90);
});

test("Al acelerar un anillo cambian sus tiempos, conservando posiciones y vueltas", () => {
  const guitar = corona.tracks.find(track => track.instrument === "distortion_guitar");
  const oldPositions = guitar.notes.map(note => orbitPositionForNote(note, guitar.orbit));
  const faster = moveInstrumentOrbit(guitar, {
    ...guitar.orbit, duration: guitar.orbit.duration / 2,
  }, period);
  assert.ok(faster);
  assert.equal(faster.notes.length, guitar.notes.length);
  assert.notDeepEqual(faster.notes.map(n => n.start), guitar.notes.map(n => n.start));
  for (let i = 0; i < faster.notes.length; i++) {
    const actual = orbitPositionForNote(faster.notes[i], faster.orbit);
    assert.equal(actual.lap, oldPositions[i].lap);
    assert.ok(Math.abs(normalizeOrbitAngle(actual.angle - oldPositions[i].angle)) < .01 ||
      Math.abs(normalizeOrbitAngle(actual.angle - oldPositions[i].angle) - 360) < .01);
  }
  const impossible = moveInstrumentOrbit(guitar, {
    ...guitar.orbit, duration: 30,
  }, period);
  assert.equal(impossible, null, "No pitch silently vanishes past the loop");
});

test("La importación por defecto reconstruye Corona desde el recurso comprimido", async () => {
  const output = await loadCoronaDefault(async (path) => ({
    ok: path.endsWith(".b64"),
    text: async () => source,
  }));
  assert.equal(output.title, CORONA_TITLE);
  assert.equal(output.tracks.length, 12);
  assert.equal(allNotes(output).length, 587);
  assert.deepEqual(output, corona);
});

test("Un score previo sin parámetros de órbita conserva la versión anterior", () => {
  const old = structuredClone(original);
  for (const track of old.tracks) delete track.orbit;
  const loaded = parseOrbitalScore(old);
  assert.ok(loaded.tracks.every(t => t.orbit.duration === period));
  assert.ok(loaded.tracks.every(t => t.orbit.enabled));
});
