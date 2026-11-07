import { RING_PITCHES, SCORE_FORMAT, SCORE_VERSION, parseOrbitalScore } from "./orbital-score.mjs";

/**
 * Original Xahya dark-fantasy battle theme. The final B5 portamento lands on
 * the opening C6 after the loop boundary; E in the final bass resolves to A.
 * 8 seconds = four 4/4 bars at 120 BPM, arranged Am | G | F | Em.
 * Syncopated lead figures, bass fifths, and a battle drum keep it urgent.
 *
 * The score also demonstrates *real* independent orbital motion:
 * D4 revolves in 4 s, F#5 in 16 s; other rings use 8 s, many counterclockwise.
 * Notes on these lanes are mapped to their occurrence times so the music
 * repeats coherently every 8 s despite the varied rotation speeds.
 */
export const BATTLE_TURN_SECONDS = 8;
const SLOTS_PER_TURN = 64;
const SLOT_SECONDS = BATTLE_TURN_SECONDS / SLOTS_PER_TURN;

const LEAD = [
  // A minor: percussive heroic call, interrupted by jumps and syncopation.
  [1,"C6"],[3,"A5"],[4,"E5"],[7,"A5"],[9,"C6"],[10,"B5"],[13,"A5"],[15,"G5"],
  // G: descend into the lower register, then set up a semitone resolution.
  [17,"G5"],[19,"D5"],[20,"G5"],[23,"B5"],[25,"A5"],[27,"G5"],[29,"D5"],[31,"E5"],
  // F: martial answering phrase, briefly sharpening F before the Em entry.
  [33,"F5"],[35,"C5"],[36,"F5"],[39,"A5"],[41,"C6"],[42,"A5"],[45,"F5"],[47,"F#5"],
  // Em: rising pickup B -> C connects directly to the loop's opening.
  [49,"G5"],[51,"E5"],[52,"B5"],[55,"G5"],[57,"E5"],[59,"G5"],[61,"A5"],[63,"B5"],
];

const BASS = [
  [1,"A4"],[3,"E4"],[6,"A4"],[10,"E4"],[14,"A4"],
  [17,"G4"],[21,"G4"],[25,"G4"],[29,"G4"],
  [33,"F4"],[35,"C4"],[38,"F4"],[42,"C4"],[46,"F4"],
  [49,"E4"],[51,"B4"],[54,"E4"],[58,"B4"],[62,"E4"],
  // The fast D4 orbit forms a recurring, slightly tense pedal.
  [8,"D4"],[24,"D4"],
];

const PULSE = [
  [2,"E5"],[6,"C5"],[10,"E5"],[14,"C5"],
  [18,"B4"],[22,"D5"],[26,"B4"],[30,"D5"],
  [34,"A4"],[38,"C5"],[42,"A4"],[46,"C5"],
  [50,"B4"],[54,"E5"],[58,"D5"],[62,"E5"],
];

// These three 140 ms semitone resolutions lead INTO the next phrase;
// the last one bridges the end of the circle into the beginning.
const GLIDES = [
  [31,"E5","F5",0.14],
  [47,"F#5","G5",0.14],
  [63,"B5","C6",0.14],
];

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
    percussion: "battle",
    groups: [{ duration: BATTLE_TURN_SECONDS, direction: 1 }, { duration: BATTLE_TURN_SECONDS, direction: 1 }],
    rings: RING_PITCHES.map((pitch) => ({
      pitch,
      enabled: notes.get(pitch).length > 0,
      phase: 0,
      delay: 0,
      duration: setting(pitch).duration,
      direction: setting(pitch).direction,
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

