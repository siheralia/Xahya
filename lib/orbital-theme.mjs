import { RING_PITCHES, SCORE_FORMAT, SCORE_VERSION, parseOrbitalScore } from "./orbital-score.mjs";

/**
 * "Corazón del Abismo" — original 160 BPM boss-battle theme for Xahya.
 *
 * Eight bars in 4/4, 12 seconds per loop. Modal tension (E Phrygian /
 * minor with F-natural), angular melodic leaps, emphatic rock backbeat and
 * a sub-octave pedal: energetic and dark without reproducing any existing riff.
 *
 * Individual orbits retain independent rotation: 12s for most, 6s for F#5.
 * The F#5 tension strike naturally repeats halfway around the 12s phrase.
 */
export const BATTLE_TURN_SECONDS = 12;
const SLOTS_PER_TURN = 128;
const SLOT_SECONDS = BATTLE_TURN_SECONDS / SLOTS_PER_TURN;

// Original eight-bar boss motif: 6 attacks per bar, many wider leaps and rests.
// Sixteenth-grid positions make it lively without a constant stepwise run.
const LEAD = [
  [1,"E5"],[3,"G5"],[5,"F5"],[8,"B5"],[11,"G5"],[14,"D5"],
  [17,"E5"],[19,"B5"],[23,"G5"],[25,"F5"],[28,"E5"],[30,"D5"],
  [33,"F5"],[35,"A5"],[38,"C6"],[42,"B5"],[45,"A5"],[47,"F5"],
  [49,"D5"],[51,"F5"],[53,"A5"],[56,"C6"],[60,"B5"],[63,"G5"],
  [65,"E5"],[67,"G5"],[70,"B5"],[73,"G5"],[75,"F5"],[78,"E5"],
  [81,"C6"],[83,"B5"],[86,"G5"],[89,"F5"],[92,"E5"],[95,"G5"],
  [97,"A5"],[99,"C6"],[102,"B5"],[105,"A5"],[109,"F5"],[111,"E5"],
  [113,"G5"],[115,"B5"],[118,"D5"],[120,"F5"],[123,"E5"],[127,"F5"],
];

// Bass roots attack on all four strong beats per bar, with two fifth accents.
// The bass instrument adds a sub-octave oscillator, as in a driving rock score.
const PROGRESSION = [
  ["E4","B4"],["E4","B4"],["F4","C4"],["D4","A4"],
  ["E4","B4"],["C4","G4"],["F4","C4"],["E4","B4"],
];
const BASS = PROGRESSION.flatMap(([root, fifth], bar) => {
  const start = bar * 16;
  return [
    [start + 1, root],[start + 5, root],[start + 7, fifth],
    [start + 9, root],[start + 13, root],[start + 15, fifth],
  ];
});

// Dark held chord colour, deliberately *not* another ticking eighth-note run.
const STRINGS = [[4,"C5"],[36,"C5"],[68,"C5"],[100,"C5"]];
const STINGERS = [[59,"F#5"]]; // Its 6s orbit also strikes at position 123.
const GLIDES = [[127,"F5","E5",0.14]]; // Connects directly to next E5 opening.

const BASS_RINGS = new Set(["C4","D4","E4","F4","G4","A4","B4"]);
const STRING_RINGS = new Set(["C5","F#5"]);
const RING_TIMING = Object.freeze({
  "F#5": { duration: 6, direction: -1 },
  C4: { duration: 12, direction: -1 },
  D4: { duration: 12, direction: -1 },
  F4: { duration: 12, direction: -1 },
  A4: { duration: 12, direction: -1 },
  C5: { duration: 12, direction: -1 },
  F5: { duration: 12, direction: -1 },
  B5: { duration: 12, direction: -1 },
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
  for (const [slot, pitch] of [...LEAD, ...BASS, ...STRINGS, ...STINGERS]) {
    if (!notes.has(pitch)) throw new Error("Nota del jefe desconocida: " + pitch);
    notes.get(pitch).push(angleAtSlot(slot, pitch));
  }
  for (const [slot, pitch, toPitch, duration] of GLIDES) {
    const angle = angleAtSlot(slot, pitch);
    if (!notes.get(pitch)?.includes(angle)) throw new Error("La nota del deslizamiento no existe.");
    glides.get(pitch).push({ angle, toPitch, duration });
  }

  return parseOrbitalScore({
    format: SCORE_FORMAT,
    version: SCORE_VERSION,
    title: "Corazón del Abismo — jefe",
    percussion: "boss",
    groups: [
      { duration: BATTLE_TURN_SECONDS, direction: 1 },
      { duration: BATTLE_TURN_SECONDS, direction: 1 },
    ],
    rings: RING_PITCHES.map((pitch) => ({
      pitch,
      enabled: notes.get(pitch).length > 0,
      phase: 0,
      delay: 0,
      duration: setting(pitch).duration,
      direction: setting(pitch).direction,
      instrument: BASS_RINGS.has(pitch) ? "bass" :
        STRING_RINGS.has(pitch) ? "strings" : "pulse",
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

