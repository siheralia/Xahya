import { RING_PITCHES, SCORE_FORMAT, SCORE_VERSION, parseOrbitalScore } from "./orbital-score.mjs";

/**
 * "Ascenso de Xahya" — original dark-fantasy battle theme, slow-phrased variant.
 * Four 4/4 bars at 120 BPM: Am | G | F | Em (8-second seamless loop).
 * A long, three-note bowed phrase per bar replaces the old busy 8-note runs.
 * Bass/chord accents emphasize chord changes, not repeating offbeat dance pulses.
 *
 * D4 circles in 4 s (its two appearances land on G and Em7);
 * F#5 circles in 16 s with two mirrored points to repeat the transition.
 * Every other active ring circles in 8 s. The emitted phrase repeats every 8 s.
 */
export const BATTLE_TURN_SECONDS = 8;
const SLOTS_PER_TURN = 64;
const SLOT_SECONDS = BATTLE_TURN_SECONDS / SLOTS_PER_TURN;

// A note every 625–875 ms instead of a stream of 125–250 ms notes.
const LEAD = [
  // Am: high, open question answered gently rather than a busy arpeggio.
  [1,"C6"],[7,"A5"],[13,"E5"],
  // G: descending then lifting, with long bow strokes.
  [17,"G5"],[23,"D5"],[29,"B5"],
  // F: melancholic falling figure with a semitone into the next harmony.
  [33,"A5"],[39,"F5"],[44,"F#5"],
  // Em: a rising pickup B5 -> C6 resolves directly into the next turn.
  [49,"G5"],[55,"E5"],[60,"B5"],
];

// Sparse, slow harmonic roots and fifths. D4 repeats under Em7 in the second half.
const BASS = [
  [1,"A4"],[9,"E4"],[9,"C4"],
  [17,"G4"],[25,"D4"],
  [33,"F4"],[41,"C4"],
  [49,"E4"],[57,"B4"],
];

// Two sustained harmonic supports per bar, rather than incessant syncopation.
const PULSE = [
  [1,"E5"],[9,"C5"],
  [17,"D5"],[25,"B4"],
  [33,"C5"],[41,"A4"],
  [49,"B4"],[57,"D5"],
];

const GLIDES = [
  [44,"F#5","G5",0.14],
  [60,"B5","C6",0.14],
];

// A few low-mid voices become bowed too, so the accompaniment breathes.
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
      instrument: STRING_RINGS.has(pitch) ? "strings" : "synth",
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

