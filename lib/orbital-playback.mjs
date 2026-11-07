import { orbitalTurnAt, crossedOrbitalNote } from "./orbital-sequencer.mjs";

/** Collect only the crossings that happened within this frame; never replay inactive time. */
export function orbitalEventsBetween(score, fromSeconds, toSeconds) {
  if (!score || !Array.isArray(score.rings) || fromSeconds >= toSeconds) return [];
  const result = [];
  for (const [index, ring] of score.rings.entries()) {
    if (!ring.enabled) continue;
    const group = score.groups[index < 4 ? 0 : 1];
    if (!group) continue;
    const fromTurn = orbitalTurnAt(
      Math.max(fromSeconds, ring.delay), ring.delay,
      ring.phase, group.duration, group.direction,
    );
    const toTurn = orbitalTurnAt(
      toSeconds, ring.delay, ring.phase, group.duration, group.direction,
    );
    const slides = new Map((ring.slides ?? []).map((slide) => [slide.angle, slide]));
    for (const angle of ring.angles) {
      if (crossedOrbitalNote(fromTurn, toTurn, angle)) {
        const glide = slides.get(angle);
        result.push({
          pitch: ring.pitch, angle,
          toPitch: glide?.toPitch ?? null,
          duration: glide?.duration ?? null,
        });
      }
    }
  }
  return result;
}

/**
 * The playback engine deliberately separates a held tone from its final
 * portamento. Long, continuously sweeping intervals sounded unnatural:
 * a short, smooth pitch resolution feels closer to an instrumental legato.
 * This pure function also lets us test the envelope without a browser.
 */
export function orbitalVoicePlan(frequency, glideToHz = null, glideSeconds = null) {
  const bass = frequency < 500;
  const gliding = Number.isFinite(glideToHz) && glideToHz > 0 &&
    Number.isFinite(glideSeconds) && glideSeconds >= 0.1;
  const hold = gliding ? Math.min(3, glideSeconds) : (bass ? 0.23 : 0.17);
  const bend = gliding ? Math.min(0.14, Math.max(0.06, hold * 0.55)) : 0;
  return {
    bass, gliding, hold, bend,
    release: bass ? 0.14 : 0.11,
    cutoff: bass ? 1350 : 2100,
  };
}

/** Synthesized locally, no samples or media downloads, started only on user gesture. */
export function playOrbitalSound(context, frequency, volume, glideToHz = null, glideSeconds = null) {
  const plan = orbitalVoicePlan(frequency, glideToHz, glideSeconds);
  const at = context.currentTime + 0.005;
  const primary = context.createOscillator();
  const overtone = context.createOscillator();
  const overtoneLevel = context.createGain();
  const color = context.createBiquadFilter();
  const envelope = context.createGain();

  // Warm lower register and slightly brassy upper register. A low-pass filter
  // removes the brittle high harmonics of a bare saw wave.
  primary.type = plan.bass ? "sine" : "sawtooth";
  overtone.type = plan.bass ? "triangle" : "sine";
  color.type = "lowpass";
  color.frequency.setValueAtTime(plan.cutoff, at);
  color.Q.value = 0.5;
  overtoneLevel.gain.value = plan.bass ? 0.16 : 0.09;

  const overtoneFactor = plan.bass ? 0.5 : 2;
  primary.frequency.setValueAtTime(frequency, at);
  overtone.frequency.setValueAtTime(frequency * overtoneFactor, at);

  if (plan.gliding) {
    const bendAt = at + plan.hold - plan.bend;
    const midway = Math.sqrt(frequency * glideToHz);
    // Sustain first, then execute a short legato transition through the
    // geometric midpoint; large leaps therefore don't turn into sirens.
    primary.frequency.setValueAtTime(frequency, bendAt);
    primary.frequency.exponentialRampToValueAtTime(midway, bendAt + plan.bend / 2);
    primary.frequency.exponentialRampToValueAtTime(glideToHz, at + plan.hold);
    overtone.frequency.setValueAtTime(frequency * overtoneFactor, bendAt);
    overtone.frequency.exponentialRampToValueAtTime(midway * overtoneFactor, bendAt + plan.bend / 2);
    overtone.frequency.exponentialRampToValueAtTime(glideToHz * overtoneFactor, at + plan.hold);
  }

  primary.connect(color);
  overtone.connect(overtoneLevel);
  overtoneLevel.connect(color);
  color.connect(envelope);
  envelope.connect(context.destination);

  const peak = Math.max(0.0001, Math.min(1, volume / 100) * (plan.bass ? 0.095 : 0.067));
  const attack = Math.min(0.012, plan.hold * 0.25);
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(peak, at + attack);
  envelope.gain.exponentialRampToValueAtTime(peak * 0.75, at + Math.min(0.07, plan.hold * 0.6));
  envelope.gain.linearRampToValueAtTime(peak * 0.55, at + plan.hold);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + plan.hold + plan.release);

  primary.start(at);
  overtone.start(at);
  primary.stop(at + plan.hold + plan.release + 0.015);
  overtone.stop(at + plan.hold + plan.release + 0.015);
  primary.onended = () => {
    primary.disconnect();
    overtone.disconnect();
    overtoneLevel.disconnect();
    color.disconnect();
    envelope.disconnect();
  };
}

/** Canvas visuals can draw current moving slide without relying on audio clocks. */
export function elapsedSlideProgress(elapsedSeconds, ring, group, slide) {
  if (!ring.enabled || elapsedSeconds < ring.delay) return null;
  let advanceDegrees = group.direction === 1
    ? ((slide.angle - ring.phase + 360) % 360)
    : ((ring.phase - slide.angle + 360) % 360);
  let firstHit = advanceDegrees / 360 * group.duration;
  if (firstHit < 0.000001) firstHit = group.duration;
  const local = elapsedSeconds - ring.delay - firstHit;
  if (local < 0) return null;
  const sinceHit = local % group.duration;
  if (sinceHit < 0 || sinceHit > slide.duration) return null;
  return sinceHit / slide.duration;
}
