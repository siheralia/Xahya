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

/** Synthesized music only. AudioContext is constructed after a user interaction. */
export function playOrbitalSound(context, frequency, volume, glideToHz = null, glideSeconds = null) {
  const at = context.currentTime + 0.005;
  const glide = typeof glideToHz === "number" &&
    Number.isFinite(glideToHz) && glideToHz > 0 &&
    typeof glideSeconds === "number" && glideSeconds >= 0.1;
  const sustained = glide ? Math.min(3, glideSeconds) : 0.45;
  const envelope = context.createGain();
  const primary = context.createOscillator();
  const harmonic = context.createOscillator();
  const harmonicGain = context.createGain();
  primary.type = "triangle";
  harmonic.type = "sine";
  primary.frequency.setValueAtTime(frequency, at);
  harmonic.frequency.setValueAtTime(frequency * 2, at);
  if (glide) {
    primary.frequency.exponentialRampToValueAtTime(glideToHz, at + sustained);
    harmonic.frequency.exponentialRampToValueAtTime(glideToHz * 2, at + sustained);
  }
  harmonicGain.gain.value = 0.18;
  primary.connect(envelope);
  harmonic.connect(harmonicGain);
  harmonicGain.connect(envelope);
  envelope.connect(context.destination);
  const peak = Math.max(0.0001, Math.min(1, volume / 100) * 0.11);
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(peak, at + 0.018);
  envelope.gain.setValueAtTime(peak * 0.7, at + Math.max(0.03, sustained - 0.04));
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + sustained + 0.23);
  primary.start(at);
  harmonic.start(at);
  primary.stop(at + sustained + 0.25);
  harmonic.stop(at + sustained + 0.25);
  primary.onended = () => {
    primary.disconnect();
    harmonic.disconnect();
    harmonicGain.disconnect();
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
