import { parseOrbitalScore } from "./orbital-score.mjs";
import { importOrbitalMidi } from "./orbital-midi.mjs";

/**
 * A track is now a real *instrument orbit*: multiple pitches and chord tones
 * can inhabit the same circle. Each note has an absolute occurrence within
 * the master phrase plus an inferred revolution and angular position.
 * Lap-scoping is essential: two different melodies in successive half-turns
 * must never become an accidental ostinato.
 */
export const CORONA_TITLE = "Corona de Cenizas — batalla orquestal";
export const CORONA_ASSET = "/music/corona-de-cenizas.mid.gz.b64";

export function normalizeOrbitAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

export function orbitPositionForNote(note, orbit) {
  const period = orbit.duration;
  const lap = Math.floor((note.start + 1e-9) / period);
  const fraction = (note.start - lap * period) / period;
  return {
    lap,
    angle: normalizeOrbitAngle(orbit.phase + orbit.direction * fraction * 360),
  };
}

export function orbitTimeForAngle(angle, orbit, lap = 0) {
  const fraction = normalizeOrbitAngle(orbit.direction * (angle - orbit.phase)) / 360;
  return lap * orbit.duration + fraction * orbit.duration;
}

/** Update the music, not only its diagram. Preserve each note's angle and lap
 * and let the changed orbit speed/phase/direction reschedule its performance.
 * Reject any change that would silently drop notes beyond the master loop. */
export function moveInstrumentOrbit(track, newMotion, masterDuration) {
  if (!track?.orbit || !Number.isFinite(masterDuration)) return null;
  if (!Number.isFinite(newMotion.duration) || newMotion.duration < 2 ||
      newMotion.duration > 30 || !Number.isFinite(newMotion.phase) ||
      newMotion.phase < 0 || newMotion.phase > 359 ||
      ![1, -1].includes(newMotion.direction)) return null;
  const notes = track.notes.map((note) => {
    const position = orbitPositionForNote(note, track.orbit);
    const nextStart = Number(orbitTimeForAngle(position.angle, newMotion, position.lap).toFixed(5));
    return { ...note, start: nextStart };
  });
  if (notes.some((note) => note.start >= masterDuration || note.start < 0)) return null;
  return { ...track, orbit: { ...track.orbit, ...newMotion }, notes };
}

/** A complete MIDI track remains intact. This picks meaningful independent
 * motions; lap-aware notes sound only when their intended turn comes around.
 * Therefore this conversion is lossless and has no duplicate backing MIDI. */
export function orchestrateInstrumentOrbits(score) {
  const source = parseOrbitalScore(score);
  const master = source.groups[0].duration;
  const speed = (instrument) => {
    switch (instrument) {
      case "acoustic_bass":
      case "distortion_guitar": return master / 4;
      case "drumkit": return master / 8;
      case "cello":
      case "tremolo_strings":
      case "timpani":
      case "brass_section": return master / 2;
      default: return master;
    }
  };
  return parseOrbitalScore({
    ...source,
    title: CORONA_TITLE,
    tracks: source.tracks.map((track, i) => ({
      ...track,
      orbit: track.orbit ?? {
        duration: Math.max(2, speed(track.instrument)),
        direction: i % 2 === 0 ? 1 : -1,
        phase: 0,
        enabled: true,
      },
    })),
  });
}

let cached = null;

/** Decode the original approved MIDI on demand, exactly once. Browser-native
 * gzip is enough; no soundfont is downloaded until Play is pressed. */
export async function loadCoronaDefault(fetcher = fetch) {
  if (cached) return cached;
  const promise = (async () => {
    const response = await fetcher(CORONA_ASSET, { cache: "force-cache" });
    if (!response.ok) throw new Error("No se encontró la composición Corona de Cenizas.");
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Este navegador no puede descomprimir la partitura orquestal.");
    }
    const encoded = (await response.text()).trim();
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    const decoded = new Response(new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream("gzip")));
    const midi = await decoded.arrayBuffer();
    return orchestrateInstrumentOrbits(importOrbitalMidi(midi, CORONA_TITLE));
  })();
  cached = promise;
  try { return await promise; }
  catch (error) { cached = null; throw error; }
}
