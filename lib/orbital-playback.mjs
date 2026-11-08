import { orbitalTurnAt, crossedOrbitalNote } from "./orbital-sequencer.mjs";

/** Collect only the crossings that happened within this frame; never replay inactive time. */
export function orbitalEventsBetween(score, fromSeconds, toSeconds) {
  if (!score || !Array.isArray(score.rings) || fromSeconds >= toSeconds) return [];
  const result = [];
  for (const [index, ring] of score.rings.entries()) {
    if (!ring.enabled) continue;
    const group = score.groups[index < 4 ? 0 : 1];
    if (!group) continue;
    // Version 1 scores without per-ring motion inherit their old group.
    const duration = ring.duration ?? group.duration;
    const direction = ring.direction ?? group.direction;
    const fromTurn = orbitalTurnAt(
      Math.max(fromSeconds, ring.delay), ring.delay,
      ring.phase, duration, direction,
    );
    const toTurn = orbitalTurnAt(
      toSeconds, ring.delay, ring.phase, duration, direction,
    );
    const slides = new Map((ring.slides ?? []).map((slide) => [slide.angle, slide]));
    const lengths = new Map((ring.noteLengths ?? []).map((note) => [note.angle, note.duration]));
    for (const angle of ring.angles) {
      if (crossedOrbitalNote(fromTurn, toTurn, angle)) {
        const glide = slides.get(angle);
        result.push({
          pitch: ring.pitch, angle,
          instrument: ring.instrument ?? "synth",
          length: lengths.get(angle) ?? null,
          toPitch: glide?.toPitch ?? null,
          duration: glide?.duration ?? null,
        });
      }
    }
  }
  return result;
}

/**
 * Battle percussion is explicitly opt-in in the score and follows the
 * score's main 4/4 measure, independently of each orbit's rotation speed.
 * There are 32 eighth-note positions per 8-second default loop.
 */
export function orbitalPercussionBetween(score, fromSeconds, toSeconds) {
  if (score?.percussion !== "battle" || fromSeconds >= toSeconds) return [];
  const period = score.groups?.[0]?.duration;
  if (!Number.isFinite(period) || period <= 0) return [];
  const eighth = period / 32;
  const first = fromSeconds === 0 ? 0 : Math.floor(fromSeconds / eighth) + 1;
  const last = Math.floor((toSeconds + 1e-10) / eighth);
  const result = [];
  // Avoid a burst after hidden-tab catchup / malformed input.
  for (let tick = Math.max(0, first); tick <= last && result.length < 128; tick++) {
    const position = tick % 32;
    const time = tick * eighth;
    if (position % 4 === 0) result.push({ type: "kick", time });
    else if (position % 4 === 2) result.push({ type: "snare", time });
    if (position % 2 === 1) result.push({ type: "hat", time });
  }
  return result;
}

/** Small synthesized battle drums; local oscillators and filtered noise. */
export function playOrbitalPercussion(context, type, volume) {
  if (volume <= 0) return;
  const at = context.currentTime + 0.005;
  const level = Math.min(1, volume / 100);
  if (type === "kick") {
    const kick = context.createOscillator();
    const envelope = context.createGain();
    kick.type = "sine";
    kick.frequency.setValueAtTime(140, at);
    kick.frequency.exponentialRampToValueAtTime(52, at + 0.13);
    envelope.gain.setValueAtTime(Math.max(0.0001, 0.1 * level), at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.19);
    kick.connect(envelope);
    envelope.connect(context.destination);
    kick.start(at);
    kick.stop(at + 0.2);
    kick.onended = () => { kick.disconnect(); envelope.disconnect(); };
    return;
  }
  if (type !== "snare" && type !== "hat") return;
  const length = type === "hat" ? 0.045 : 0.12;
  const count = Math.ceil(context.sampleRate * length);
  const buffer = context.createBuffer(1, count, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < count; i++) samples[i] = Math.random() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  const color = context.createBiquadFilter();
  color.type = "highpass";
  color.frequency.setValueAtTime(type === "hat" ? 5100 : 1600, at);
  const gain = context.createGain();
  gain.gain.setValueAtTime(Math.max(0.0001, (type === "hat" ? 0.014 : 0.041) * level), at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  noise.connect(color);
  color.connect(gain);
  gain.connect(context.destination);
  noise.start(at);
  noise.stop(at + length);
  noise.onended = () => { noise.disconnect(); color.disconnect(); gain.disconnect(); };
}

/**
 * The playback engine deliberately separates a held tone from its final
 * portamento. Long, continuously sweeping intervals sounded unnatural:
 * a short, smooth pitch resolution feels closer to an instrumental legato.
 * This pure function also lets us test the envelope without a browser.
 */
export function orbitalVoicePlan(frequency, glideToHz = null, glideSeconds = null, noteLength = null) {
  const bass = frequency < 500;
  const gliding = Number.isFinite(glideToHz) && glideToHz > 0 &&
    Number.isFinite(glideSeconds) && glideSeconds >= 0.1;
  const hold = Number.isFinite(noteLength) && noteLength >= 0.05 && noteLength <= 30
    ? noteLength
    : gliding ? Math.min(3, glideSeconds) : (bass ? 0.23 : 0.17);
  const bend = gliding ? Math.min(0.14, Math.max(0.06, hold * 0.55)) : 0;
  return {
    bass, gliding, hold, bend,
    release: bass ? 0.14 : 0.11,
    cutoff: bass ? 1350 : 2100,
  };
}

/** Synthesized locally, no samples or media downloads, started only on user gesture. */
export function playOrbitalSound(context, frequency, volume, glideToHz = null, glideSeconds = null, noteLength = null) {
  const plan = orbitalVoicePlan(frequency, glideToHz, glideSeconds, noteLength);
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
  const configuredLength = ring.noteLengths?.find((item) => item.angle === slide.angle)?.duration;
  const hold = Number.isFinite(configuredLength) ? configuredLength : slide.duration;
  const bend = Number.isFinite(configuredLength)
    ? Math.min(0.14, Math.max(0.06, Math.min(hold, slide.duration)))
    : slide.duration;
  if (sinceHit < hold - bend || sinceHit > hold) return null;
  return (sinceHit - (hold - bend)) / bend;
}
