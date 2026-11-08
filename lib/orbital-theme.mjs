import { RING_PITCHES, SCORE_FORMAT, SCORE_VERSION, parseOrbitalScore } from "./orbital-score.mjs";

/**
 * "Ascenso de Xahya" — original dark-fantasy battle theme, slow-phrased variant.
 * Four 4/4 bars at 120 BPM: Am | G | F | Em (8-second seamless loop).
 * Four spacious, dramatic bowed tones per bar form the main melody.
 * Deep octave bass ostinati emphasize strong beats, without dance-like offbeats.
 *
 * D4 circles in 4 s (its two appearances land on G and Em7);
 * F#5 circles in 16 s with two mirrored points to repeat the transition.
 * Every other active ring circles in 8 s. The emitted phrase repeats every 8 s.
 */
export const BATTLE_TURN_SECONDS = 8;
const SLOTS_PER_TURN = 64;
const SLOT_SECONDS = BATTLE_TURN_SECONDS / SLOTS_PER_TURN;

// A note every 625–875 ms instead of a stream of 125–250 ms notes.
// V6: four strong 4/4 bars at 120 BPM; heroic bowed strings above a
// low orchestral ostinato. The melody has room to sing without turning into
// the rapid stepwise notes of V3 or the empty gaps of V5.
const LEAD = [
  // A minor — call, upward answer and a firm landing.
  [1,"C6"],[6,"A5"],[11,"E5"],[14,"A5"],
  // G — widen the intervals, then climb back toward the climax.
  [17,"B5"],[22,"G5"],[27,"D5"],[30,"G5"],
  // F — high dramatic response with a short leading-tone resolution.
  [33,"C6"],[38,"A5"],[43,"F5"],[45,"F#5"],
  // Em — rise through the dominant, ending on a bowed B5 → C6.
  [49,"G5"],[54,"E5"],[59,"G5"],[61,"B5"],
];

// The root/fifth motor is on strong beats, not offbeat hats or dance kicks.
// D4 is the one 4-second ring: played on G at 2.5 s and Em at 6.5 s.
const BASS = [
  [1,"A4"],[5,"E4"],[9,"A4"],[13,"C4"],[16,"E4"],
  [17,"G4"],[20,"D4"],[24,"G4"],[28,"B4"],[31,"G4"],
  [33,"F4"],[37,"C4"],[41,"F4"],[45,"A4"],[47,"C4"],
  [49,"E4"],[53,"B4"],[57,"E4"],[61,"B4"],[63,"E4"],
];

// Held chord tones give the music width between bowed melodic phrases.
const PULSE = [
  [1,"E5"],[9,"C5"],
  [17,"D5"],[25,"B4"],
  [33,"C5"],[41,"A4"],
  [49,"B4"],[57,"D5"],
];

const GLIDES = [
  [45,"F#5","G5",0.14],
  [61,"B5","C6",0.14],
];

// Low-register circles have an additional sub-octave oscillator. Mid and high
// circles use bowed strings so the melodic motion is clear over the impact.
const BASS_RINGS = new Set(["C4", "D4", "E4", "F4", "G4", "A4"]);
const STRING_RINGS = new Set(["C5", "D5", "E5", "F5", "F#5", "G5", "A5", "B5", "C6"]);

const RING_TIMING = Object.freeze({
  D4: { duration: 4, direction: -1 },
  "F#5": { duration: 16, direction: -1 },
  C4: { duration: 8, direction: -1 },
  F4: { duration: 8, direction: -1 },
  A4: { duration: 8, direction: -1 },
  C5: { duration: 8, direction: -1 },
  E5: { duration: 8, direction: -1 },
  B5: { duration: 8, direction: -1 },
});

function setting(pitch) {
  return RING_TIMING[pitch] ?? { duration: BATTLE_TURN_SECONDS, direction: 1 };
}
function angleAtSlot(slot, pitch) {
  const { duration, direction } = setting(pitch);
  const signedTurns = direction * (slot * SLOT_SECONDS / duration);
  return Math.round(((signedTurns % 1 + 1) % 1) * 360 * 1e6) / 1e6;
}

export function createBattleThemeScore() {
  const notes = new Map(RING_PITCHES.map((pitch) => [pitch, []]));
  const glides = new Map(RING_PITCHES.map((pitch) => [pitch, []]));
  for (const [slot, pitch] of [...LEAD, ...BASS, ...PULSE]) {
    if (!notes.has(pitch)) throw new Error("Nota de batalla desconocida: " + pitch);
    notes.get(pitch).push(angleAtSlot(slot, pitch));
  }

  // Slow ring: two notes 180° apart make the same F# pickup sound every 8 s.
  const slowPitch = "F#5";
  for (const [slot, pitch] of LEAD.filter(([, name]) => name === slowPitch)) {
    notes.get(pitch).push(angleAtSlot(slot + SLOTS_PER_TURN, pitch));
  }

  for (const [slot, pitch, toPitch, duration] of GLIDES) {
    const angle = angleAtSlot(slot, pitch);
    if (!notes.get(pitch)?.includes(angle)) throw new Error("La nota del glissando no existe");
    glides.get(pitch).push({ angle, toPitch, duration });
    if (pitch === slowPitch) {
      glides.get(pitch).push({
        angle: angleAtSlot(slot + SLOTS_PER_TURN, pitch), toPitch, duration,
      });
    }
  }

  return parseOrbitalScore({
    format: SCORE_FORMAT,
    version: SCORE_VERSION,
    title: "Ascenso de Xahya — batalla",
    percussion: "orchestral",
    groups: [{ duration: BATTLE_TURN_SECONDS, direction: 1 }, { duration: BATTLE_TURN_SECONDS, direction: 1 }],
    rings: RING_PITCHES.map((pitch) => ({
      pitch,
      enabled: notes.get(pitch).length > 0,
      phase: 0,
      delay: 0,
      duration: setting(pitch).duration,
      direction: setting(pitch).direction,
      instrument: BASS_RINGS.has(pitch) ? "bass" : STRING_RINGS.has(pitch) ? "strings" : "synth",
      angles: notes.get(pitch).sort((a,b) => a-b),
      slides: glides.get(pitch),
    })),
  });
}

export function pitchFrequency(pitch) {
  const match = /^([A-G])(#?)([0-8])$/.exec(pitch);
  if (!match) throw new Error("Nota musical inválida");
  const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = (Number(match[3]) + 1) * 12 + semitones[match[1]] + (match[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

