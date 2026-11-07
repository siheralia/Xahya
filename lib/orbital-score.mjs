/** Portable score format for Xahya's orbital musical sequencer. */
export const SCORE_FORMAT = "xahya-orbital-score";
export const SCORE_VERSION = 1;

/** Chromatic exception F#5 is included for imported melodies. */
export const RING_PITCHES = Object.freeze([
  "C4", "D4", "E4", "F4", "G4", "A4", "B4",
  "C5", "D5", "E5", "F5", "F#5", "G5", "A5", "B5", "C6",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isInRange(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * Validate a portable score from file or localStorage. Missing lanes are silent,
 * allowing future exports to keep their pitch identities rather than relying on index.
 */
export function parseOrbitalScore(value) {
  if (!isRecord(value) || value.format !== SCORE_FORMAT || value.version !== SCORE_VERSION) {
    throw new Error("El archivo no es una partitura orbital compatible (versión 1).");
  }
  if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 120) {
    throw new Error("La partitura necesita un nombre válido de hasta 120 caracteres.");
  }
  if (!Array.isArray(value.groups) || value.groups.length !== 2 ||
      !value.groups.every((group) => isRecord(group) &&
        isInRange(group.duration, 2, 120) &&
        (group.direction === 1 || group.direction === -1))) {
    throw new Error("Los tiempos y sentidos de los dos grupos no son válidos.");
  }
  if (!Array.isArray(value.rings) || value.rings.length > RING_PITCHES.length) {
    throw new Error("La lista de circunferencias no es válida.");
  }
  const byPitch = new Map();
  for (const ring of value.rings) {
    if (!isRecord(ring) || typeof ring.pitch !== "string" ||
      !RING_PITCHES.includes(ring.pitch) || byPitch.has(ring.pitch) ||
      typeof ring.enabled !== "boolean" ||
      !isInRange(ring.phase, 0, 359.99999) ||
      !isInRange(ring.delay, 0, 30) ||
      !Array.isArray(ring.angles) || ring.angles.length > 256 ||
      !ring.angles.every((angle) => isInRange(angle, 0, 359.99999))) {
      throw new Error("Una circunferencia contiene notas o parámetros inválidos.");
    }
    byPitch.set(ring.pitch, ring);
  }
  return {
    format: SCORE_FORMAT,
    version: SCORE_VERSION,
    title: value.title.trim(),
    groups: value.groups.map((group) => ({ duration: group.duration, direction: group.direction })),
    rings: RING_PITCHES.map((pitch) => {
      const ring = byPitch.get(pitch);
      return ring
        ? { pitch, enabled: ring.enabled, phase: ring.phase, delay: ring.delay, angles: [...ring.angles] }
        : { pitch, enabled: false, phase: 0, delay: 0, angles: [] };
    }),
  };
}

export const GOLDEN_PHRASES = Object.freeze([
  ["G", "F#", "E", "E", "E", "B", "B", "D", "D", "A"],
  ["D", "D", "D", "D", "C", "C", "C", "B"],
  ["D", "D", "D", "D", "C", "C", "C", "B"],
  ["A", "B", "G", "E", "E", "G", "F#", "E", "D", "D", "A"],
  ["D", "D", "D", "D", "C", "C", "C", "B"],
  ["D", "D", "D", "D", "C", "C", "C", "B"],
]);

// Chosen high register for these user-supplied pitches; notes alone do not
// specify their actual octaves, meter, rests or duration.
const MELODY_PITCH_MAP = Object.freeze({
  A: "A4", B: "B4", C: "C5", D: "D5", E: "E5", "F#": "F#5", G: "G5",
});

/**
 * Arrange the supplied pitch sequence along a shared clockwise sweep:
 * one equally-spaced slot per note, two empty slots between phrases.
 * Using the same period, direction, phase and delay for both groups preserves
 * note order across every ring. Loop playback is intentional.
 */
export function createGoldenScore() {
  const notesCount = GOLDEN_PHRASES.reduce((total, phrase) => total + phrase.length, 0);
  const slots = notesCount + (GOLDEN_PHRASES.length - 1) * 2 + 2;
  const angles = new Map(RING_PITCHES.map((pitch) => [pitch, []]));
  let slot = 1;
  for (const [index, phrase] of GOLDEN_PHRASES.entries()) {
    for (const pitchName of phrase) {
      const pitch = MELODY_PITCH_MAP[pitchName];
      if (!pitch) throw new Error("Nota no reconocida: " + pitchName);
      angles.get(pitch).push(Number((slot * 360 / slots).toFixed(6)));
      slot += 1;
    }
    if (index < GOLDEN_PHRASES.length - 1) slot += 2;
  }
  return parseOrbitalScore({
    format: SCORE_FORMAT,
    version: SCORE_VERSION,
    title: "Golden — melodía proporcionada",
    groups: [{ duration: 16, direction: 1 }, { duration: 16, direction: 1 }],
    rings: RING_PITCHES.map((pitch) => ({
      pitch,
      enabled: angles.get(pitch).length > 0,
      phase: 0,
      delay: 0,
      angles: angles.get(pitch),
    })),
  });
}
