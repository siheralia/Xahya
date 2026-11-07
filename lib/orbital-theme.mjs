import { RING_PITCHES, SCORE_FORMAT, SCORE_VERSION, parseOrbitalScore } from "./orbital-score.mjs";

/**
 * "Ascenso de Xahya": original theme composed for the orbital synthesizer.
 * 64 equal rhythmic slots, one 16-second loop, rising/falling lead and bass.
 * Slides are continuous pitch transitions, not prerecorded audio samples.
 */
const LEAD = [
  [1, "E5"], [3, "G5"], [5, "A5"], [7, "C6"],
  [9, "B5"], [11, "G5"], [13, "E5"], [15, "D5"],
  [17, "C5"], [19, "E5"], [21, "G5"], [23, "B5"],
  [25, "C6"], [27, "A5"], [29, "G5"], [31, "E5"],
  [33, "G5"], [35, "A5"], [37, "C6"], [39, "B5"],
  [41, "G5"], [43, "E5"], [45, "D5"], [47, "F#5"],
  [49, "A5"], [51, "G5"], [53, "E5"], [55, "C5"],
  [57, "D5"], [59, "E5"], [61, "G5"], [63, "C6"],
];

const BASS = [
  [2,"C4"],[6,"G4"],[10,"E4"],[14,"G4"],
  [18,"A4"],[22,"E4"],[26,"G4"],[30,"E4"],
  [34,"F4"],[38,"C4"],[42,"G4"],[46,"F4"],
  [50,"G4"],[54,"D4"],[58,"G4"],[62,"C4"],
];

const PULSE = [
  [4,"C5"],[12,"B4"],[20,"A4"],[28,"D5"],
  [36,"C5"],[44,"B4"],[52,"A4"],[60,"D5"],
];

const GLIDES = [
  [1,"E5","G5",0.43],
  [7,"C6","A5",0.66],
  [25,"C6","G5",0.64],
  [33,"G5","C6",0.67],
  [47,"F#5","G5",0.37],
  [49,"A5","E5",0.67],
  [59,"E5","C6",0.74],
];

export function createBattleThemeScore() {
  const angleForSlot = (slot) => slot * 360 / 64;
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
    groups: [{ duration: 16, direction: 1 }, { duration: 16, direction: 1 }],
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

