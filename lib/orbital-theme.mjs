import { RING_PITCHES, SCORE_FORMAT, SCORE_VERSION, parseOrbitalScore } from "./orbital-score.mjs";

/**
 * "Ascenso de Xahya" — an original adventure/battle theme in A minor.
 * Four harmonic sections: Am | F | G | Em, with a new 8-second loop.
 * Lead rises and falls in a heroic call-and-response; bass and chord tones
 * punctuate the same pulse. No existing game melody is reproduced.
 *
 * 64 angular slots, spaced at 125 ms. Each chord occupies 16 slots (2 s);
 * moving voices share a clock so the harmony stays aligned in both groups.
 * Glides are short neighboring-note portamentos, never long pitch sweeps.
 */
export const BATTLE_TURN_SECONDS = 8;
const SLOTS_PER_TURN = 64;

const LEAD = [
  // Am: daring climb, then answer with a descending motif.
  [1,"E5"],[3,"G5"],[5,"A5"],[7,"B5"],[9,"C6"],[11,"B5"],[13,"A5"],[15,"G5"],
  // F: descending shape that rises again toward the high tonic.
  [17,"A5"],[19,"G5"],[21,"F5"],[23,"E5"],[25,"F5"],[27,"A5"],[29,"C6"],[31,"A5"],
  // G: bright lift, leading tone F# resolves upward into G.
  [33,"B5"],[35,"C6"],[37,"B5"],[39,"A5"],[41,"G5"],[43,"F#5"],[45,"G5"],[47,"D5"],
  // Em: rally and cadence, resolving the loop naturally back to E.
  [49,"E5"],[51,"G5"],[53,"B5"],[55,"C6"],[57,"B5"],[59,"A5"],[61,"G5"],[63,"E5"],
];

const BASS = [
  [1,"A4"],[5,"E4"],[9,"A4"],[13,"E4"],
  [17,"F4"],[21,"C4"],[25,"F4"],[29,"C4"],
  [33,"G4"],[37,"D4"],[41,"G4"],[45,"D4"],
  [49,"E4"],[53,"B4"],[57,"E4"],[61,"B4"],
];

// A second voice highlights chord tones and rhythmic accents rather than
// selecting arbitrary notes. It intentionally shares ticks with the melody.
const PULSE = [
  [3,"C5"],[7,"E5"],[11,"C5"],[15,"E5"],
  [19,"C5"],[23,"A4"],[27,"C5"],[31,"A4"],
  [35,"D5"],[39,"B4"],[43,"D5"],[47,"B4"],
  [51,"E5"],[55,"E5"],[59,"E5"],[63,"B4"],
];

// Small semitone resolutions are ornamentation; full melodic intervals are
// played as separate notes. The audio engine performs each bend only at the end.
const GLIDES = [
  [7,"B5","C6",0.14],
  [23,"E5","F5",0.14],
  [43,"F#5","G5",0.14],
];

export function createBattleThemeScore() {
  const angleForSlot = (slot) => slot * 360 / SLOTS_PER_TURN;
  const noteAngles = new Map(RING_PITCHES.map((pitch) => [pitch, []]));
  for (const [slot, pitch] of [...LEAD, ...BASS, ...PULSE]) {
    if (!noteAngles.has(pitch)) throw new Error("Nota de batalla desconocida");
    noteAngles.get(pitch).push(angleForSlot(slot));
  }
  const slides = new Map(RING_PITCHES.map((pitch) => [pitch, []]));
  for (const [slot, pitch, toPitch, duration] of GLIDES) {
    if (!noteAngles.get(pitch)?.includes(angleForSlot(slot))) {
      throw new Error("Un deslizamiento debe empezar en una nota existente");
    }
    slides.get(pitch).push({ angle: angleForSlot(slot), toPitch, duration });
  }
  return parseOrbitalScore({
    format: SCORE_FORMAT,
    version: SCORE_VERSION,
    title: "Ascenso de Xahya — batalla",
    groups: [{ duration: BATTLE_TURN_SECONDS, direction: 1 }, { duration: BATTLE_TURN_SECONDS, direction: 1 }],
    rings: RING_PITCHES.map((pitch) => ({
      pitch,
      enabled: noteAngles.get(pitch).length > 0,
      phase: 0, delay: 0,
      angles: noteAngles.get(pitch),
      slides: slides.get(pitch),
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

