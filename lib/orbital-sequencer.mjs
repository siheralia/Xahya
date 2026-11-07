/** Normalize an angle to [0, 360), measured clockwise from the top. */
export function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

/** Position on an SVG ring, with angle 0 at the top. */
export function orbitalPoint(radius, degrees, center = 320) {
  const radians = (normalizeDegrees(degrees) - 90) * Math.PI / 180;
  return {
    x: center + Math.cos(radians) * radius,
    y: center + Math.sin(radians) * radius,
  };
}

/**
 * Detects a note crossing between two *unwrapped* revolutions.
 * A one-turn head has value 1; both arguments may include a phase offset.
 * This correctly detects crossings at the 0°/360° boundary.
 */
export function crossedNote(previousTurn, currentTurn, noteDegrees) {
  if (!Number.isFinite(previousTurn) || !Number.isFinite(currentTurn) || currentTurn <= previousTurn) return false;
  const noteTurn = normalizeDegrees(noteDegrees) / 360;
  return Math.floor(currentTurn - noteTurn) > Math.floor(previousTurn - noteTurn);
}

/** Shortest unsigned angle difference, in degrees. */
export function angleDistance(a, b) {
  const delta = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return Math.min(delta, 360 - delta);
}
