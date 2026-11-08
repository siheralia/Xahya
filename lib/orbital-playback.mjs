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
    for (const angle of ring.angles) {
      if (crossedOrbitalNote(fromTurn, toTurn, angle)) {
        const glide = slides.get(angle);
        result.push({
          pitch: ring.pitch, angle,
          instrument: ring.instrument ?? "synth",
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
  if ((score?.percussion !== "battle" && score?.percussion !== "orchestral") ||
      fromSeconds >= toSeconds) return [];
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
    if (score.percussion === "orchestral") {
      // Long, sparse orchestral accents instead of the dance-like offbeat hats.
      if (position % 8 === 0) result.push({ type: "timpani", time });
      if (position % 16 === 0) result.push({ type: "cymbal", time });
    } else {
      if (position % 4 === 0) result.push({ type: "kick", time });
      else if (position % 4 === 2) result.push({ type: "snare", time });
      if (position % 2 === 1) result.push({ type: "hat", time });
    }
  }
  return result;
}

/** Small synthesized battle drums; local oscillators and filtered noise. */
export function playOrbitalPercussion(context, type, volume) {
  if (volume <= 0) return;
  const at = context.currentTime + 0.005;
  const level = Math.min(1, volume / 100);
  if (type === "kick" || type === "timpani") {
    const orchestral = type === "timpani";
    const length = orchestral ? 0.46 : 0.19;
    const kick = context.createOscillator();
    const envelope = context.createGain();
    kick.type = orchestral ? "triangle" : "sine";
    kick.frequency.setValueAtTime(orchestral ? 112 : 140, at);
    kick.frequency.exponentialRampToValueAtTime(orchestral ? 72 : 52, at + (orchestral ? 0.27 : 0.13));
    envelope.gain.setValueAtTime(Math.max(0.0001, (orchestral ? 0.11 : 0.1) * level), at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
    kick.connect(envelope);
    envelope.connect(context.destination);
    kick.start(at);
    kick.stop(at + length + 0.01);
    kick.onended = () => { kick.disconnect(); envelope.disconnect(); };
    return;
  }
  if (type !== "snare" && type !== "hat" && type !== "cymbal") return;
  const length = type === "cymbal" ? 0.55 : type === "hat" ? 0.045 : 0.12;
  const count = Math.ceil(context.sampleRate * length);
  const buffer = context.createBuffer(1, count, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < count; i++) samples[i] = Math.random() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  const color = context.createBiquadFilter();
  color.type = "highpass";
  color.frequency.setValueAtTime(type === "cymbal" ? 3500 : type === "hat" ? 5100 : 1600, at);
  const gain = context.createGain();
  gain.gain.setValueAtTime(Math.max(0.0001, (type === "cymbal" ? 0.017 : type === "hat" ? 0.014 : 0.041) * level), at);
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
export function orbitalVoicePlan(frequency, glideToHz = null, glideSeconds = null, instrument = "synth") {
  const bass = frequency < 500;
  const strings = instrument === "strings";
  const gliding = Number.isFinite(glideToHz) && glideToHz > 0 &&
    Number.isFinite(glideSeconds) && glideSeconds >= 0.1;
  const hold = gliding ? Math.min(3, glideSeconds) : (strings ? 0.38 : bass ? 0.23 : 0.17);
  const bend = gliding ? Math.min(0.14, Math.max(0.06, hold * 0.55)) : 0;
  return {
    bass, strings, gliding, hold, bend,
    release: strings ? 0.22 : bass ? 0.14 : 0.11,
    cutoff: strings ? 2550 : bass ? 1350 : 2100,
  };
}

/** Synthesized locally, no samples or media downloads, started only on user gesture. */
export function playOrbitalSound(context, frequency, volume, glideToHz = null, glideSeconds = null, instrument = "synth") {
  const plan = orbitalVoicePlan(frequency, glideToHz, glideSeconds, instrument);
  const at = context.currentTime + 0.005;
  const primary = context.createOscillator();
  const overtone = context.createOscillator();
  const overtoneLevel = context.createGain();
  const color = context.createBiquadFilter();
  const envelope = context.createGain();

  // Warm lower register and slightly brassy upper register. A low-pass filter
  // removes the brittle high harmonics of a bare saw wave.
  primary.type = plan.strings ? "sawtooth" : plan.bass ? "sine" : "sawtooth";
  overtone.type = plan.strings ? "sawtooth" : plan.bass ? "triangle" : "sine";
  color.type = "lowpass";
  color.frequency.setValueAtTime(plan.strings ? 1350 : plan.cutoff, at);
  if (plan.strings) {
    // A bow gradually opens up the upper harmonics after the initial attack.
    color.frequency.linearRampToValueAtTime(plan.cutoff, at + Math.min(0.17, plan.hold));
    color.frequency.linearRampToValueAtTime(1700, at + plan.hold + plan.release);
  }
  color.Q.value = plan.strings ? 0.8 : 0.5;
  overtoneLevel.gain.value = plan.strings ? 0.32 : plan.bass ? 0.16 : 0.09;

  const overtoneFactor = plan.strings ? 1 : plan.bass ? 0.5 : 2;
  primary.frequency.setValueAtTime(frequency, at);
  overtone.frequency.setValueAtTime(frequency * overtoneFactor, at);
  if (plan.strings) {
    // A lightly detuned second bowed voice makes the tone less plucked/synthetic.
    primary.detune.setValueAtTime(-3, at);
    overtone.detune.setValueAtTime(4, at);
  }

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

  const peak = Math.max(0.0001, Math.min(1, volume / 100) *
    (plan.strings ? 0.051 : plan.bass ? 0.095 : 0.067));
  envelope.gain.setValueAtTime(0.0001, at);
  if (plan.strings) {
    // Bowed phrasing: soft entrance, growing body, extended legato release.
    const attack = Math.min(0.065, plan.hold * 0.46);
    envelope.gain.linearRampToValueAtTime(peak * 0.7, at + attack);
    envelope.gain.linearRampToValueAtTime(peak, at + Math.min(plan.hold, attack + 0.1));
    envelope.gain.linearRampToValueAtTime(peak * 0.68, at + plan.hold);
  } else {
    const attack = Math.min(0.012, plan.hold * 0.25);
    envelope.gain.exponentialRampToValueAtTime(peak, at + attack);
    envelope.gain.exponentialRampToValueAtTime(peak * 0.75, at + Math.min(0.07, plan.hold * 0.6));
    envelope.gain.linearRampToValueAtTime(peak * 0.55, at + plan.hold);
  }
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + plan.hold + plan.release);

  let vibrato = null;
  let vibratoDepth = null;
  if (plan.strings && plan.hold > 0.18) {
    // Five gentle cycles per second, introduced after the bow has caught.
    vibrato = context.createOscillator();
    vibratoDepth = context.createGain();
    vibrato.type = "sine";
    vibrato.frequency.value = 5.15;
    vibratoDepth.gain.value = 5.5; // cents, not semitones
    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(primary.detune);
    vibratoDepth.connect(overtone.detune);
    vibrato.start(at + 0.095);
    vibrato.stop(at + plan.hold + plan.release);
  }

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
    vibrato?.disconnect();
    vibratoDepth?.disconnect();
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
