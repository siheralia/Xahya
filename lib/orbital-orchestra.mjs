/**
 * Polyphonic sampler for Xahya's orchestral tracks and orbital notes.
 *
 * Optional samples come from FluidR3_GM, CC BY 3.0 (Frank Wen et al.):
 * https://gleitz.github.io/midi-js-soundfonts/
 * No SoundFont is embedded in the repo; instruments load only after Play.
 * When offline or CORS/loading fails, a local WebAudio synth plays every note.
 */
const SOUNDFONT_BASE = "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM";
const stateByContext = new WeakMap();
const MAX_SAMPLES_PER_INSTRUMENT = 48;
const MIDI_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function contextState(context) {
  let state = stateByContext.get(context);
  if (!state) {
    const master = context.createDynamicsCompressor();
    master.threshold.value = -19;
    master.knee.value = 18;
    master.ratio.value = 9;
    master.attack.value = 0.004;
    master.release.value = 0.22;
    master.connect(context.destination);
    state = { instruments: new Map(), buffers: new Map(), playing: new Set(), master };
    stateByContext.set(context, state);
  }
  return state;
}

export function midiFromPitch(pitch) {
  if (typeof pitch === "number" && Number.isInteger(pitch)) return pitch;
  const match = /^([A-G])(#?)([0-8])$/.exec(String(pitch));
  if (!match) throw new Error("Nota musical inválida");
  const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (Number(match[3]) + 1) * 12 + semitones[match[1]] + (match[2] ? 1 : 0);
}

export function pitchFromMidi(midi) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) {
    throw new Error("Nota MIDI inválida");
  }
  return MIDI_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

/** Emit all notes crossing this short time interval, from every track.
 * Sample voices overlap naturally, including voices with the same MIDI pitch.
 * Events at t=0 play only at the beginning of playback (and every loop). */
export function orchestralEventsBetween(score, fromSeconds, toSeconds) {
  if (!score || !Array.isArray(score.tracks) || fromSeconds >= toSeconds) return [];
  const period = score.groups?.[0]?.duration;
  if (!Number.isFinite(period) || period <= 0) return [];
  const events = [];
  const starting = Math.max(0, fromSeconds);
  for (const [trackIndex, track] of score.tracks.entries()) {
    for (const note of track.notes) {
      const cycle = Math.max(0, Math.floor((starting - note.start) / period));
      for (let index = cycle; index <= cycle + 1; index++) {
        const at = note.start + index * period;
        if ((at > fromSeconds || (fromSeconds === 0 && at === 0)) &&
            at <= toSeconds + 1e-8) {
          events.push({
            trackIndex, instrument: track.instrument, pitch: note.pitch,
            duration: note.duration, velocity: note.velocity, time: at,
          });
        }
      }
      if (events.length > 256) return events.slice(0, 256);
    }
  }
  return events.sort((a, b) => a.time - b.time || a.trackIndex - b.trackIndex);
}

function libraryEntries(script) {
  // The published .js SoundFonts contain quoted key/value data URI pairs.
  // Parse the sample strings as DATA; never evaluate third-party JavaScript.
  const entries = [];
  const pattern = /["']([A-G](?:#|b)?-?\d)["']\s*:\s*["']data:audio\/(?:mp3|mpeg|ogg);base64,([A-Za-z0-9+/=]+)["']/g;
  for (const match of script.matchAll(pattern)) {
    let pitch;
    try { pitch = midiFromPitch(match[1].replace("b", "")); } catch { continue; }
    entries.push({ pitch, data: match[2] });
  }
  return entries;
}

function decodeBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getLibrary(context, instrument) {
  const state = contextState(context);
  if (state.instruments.has(instrument)) return state.instruments.get(instrument);
  const load = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 11000);
    try {
      const response = await fetch(SOUNDFONT_BASE + "/" + instrument + "-mp3.js", {
        signal: controller.signal, cache: "force-cache",
      });
      if (!response.ok) throw new Error("Instrumento no disponible");
      const script = await response.text();
      const entries = libraryEntries(script);
      if (entries.length === 0) throw new Error("Instrumento sin muestras");
      return entries;
    } finally {
      clearTimeout(timeout);
    }
  })().catch(() => []);
  state.instruments.set(instrument, load);
  return load;
}

/** Preload only the exact pitches referenced in this score, and only on user
 * interaction. Errors leave the local WebAudio fallback available. */
export async function prepareOrchestralInstruments(context, score) {
  const needed = new Map();
  const include = (instrument, pitch) => {
    if (!instrument || instrument === "synth" || instrument === "drumkit") return;
    if (!needed.has(instrument)) needed.set(instrument, new Set());
    needed.get(instrument).add(pitch);
  };
  for (const ring of score.rings ?? []) {
    if (ring.enabled) include(ring.instrument, midiFromPitch(ring.pitch));
  }
  for (const track of score.tracks ?? []) {
    for (const note of track.notes) include(track.instrument, note.pitch);
  }

  let sampled = 0, fallback = 0;
  await Promise.all([...needed.entries()].map(async ([instrument, pitches]) => {
    const library = await getLibrary(context, instrument);
    if (!library.length) { fallback++; return; }
    const buffers = contextState(context).buffers;
    const chosen = new Map();
    for (const pitch of [...pitches].slice(0, MAX_SAMPLES_PER_INSTRUMENT)) {
      let closest = library[0];
      for (const item of library) {
        if (Math.abs(item.pitch - pitch) < Math.abs(closest.pitch - pitch)) closest = item;
      }
      chosen.set(closest.pitch, closest);
    }
    await Promise.all([...chosen.values()].map(async (item) => {
      const key = instrument + ":" + item.pitch;
      if (buffers.has(key)) return;
      try {
        const decoded = await context.decodeAudioData(decodeBase64(item.data));
        buffers.set(key, decoded);
      } catch { /* The note will use the offline fallback. */ }
    }));
    sampled += [...chosen.keys()].filter(p => buffers.has(instrument + ":" + p)).length;
    if (sampled === 0) fallback++;
  }));
  return { sampled, fallback };
}

function nearestBuffer(context, instrument, pitch) {
  const buffers = contextState(context).buffers;
  let best = null, distance = Infinity;
  for (const [key, buffer] of buffers.entries()) {
    if (!key.startsWith(instrument + ":")) continue;
    const referencePitch = Number(key.slice(instrument.length + 1));
    if (Math.abs(pitch - referencePitch) < distance) {
      best = { buffer, pitch: referencePitch };
      distance = Math.abs(pitch - referencePitch);
    }
  }
  return best;
}

function drumType(pitch) {
  if (pitch === 35 || pitch === 36) return "kick";
  if (pitch === 38 || pitch === 40 || pitch === 37) return "snare";
  if (pitch === 49 || pitch === 57) return "cymbal";
  return "hat";
}

/** Start one voice on the same AudioContext. All concurrently triggered voices
 * remain independent. Stop handlers allow immediate silence on pause/unmount. */
export function playOrchestralNote(context, instrument, pitch, duration, velocity, volume,
  toPitch = null, glideSeconds = null) {
  if (volume <= 0 || !Number.isFinite(duration) || duration <= 0) return;
  if (instrument === "drumkit") {
    const at = context.currentTime + 0.006;
    const type = drumType(pitch);
    const length = type === "cymbal" ? 0.42 : type === "hat" ? 0.09 : type === "snare" ? 0.16 : 0.23;
    const level = Math.min(1, volume / 100) * Math.min(1, velocity / 100);
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type === "hat" ? "square" : "triangle";
    osc.frequency.setValueAtTime(type === "kick" ? 130 : type === "snare" ? 260 : 4200, at);
    if (type === "kick") osc.frequency.exponentialRampToValueAtTime(51, at + .12);
    gain.gain.setValueAtTime(Math.max(.0001, .095 * level), at);
    gain.gain.exponentialRampToValueAtTime(.0001, at + length);
    osc.connect(gain); gain.connect(contextState(context).master);
    osc.start(at); osc.stop(at + length + .01);
    if (type !== "kick") {
      const count = Math.max(1, Math.ceil(context.sampleRate * length));
      const buffer = context.createBuffer(1, count, context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < count; i++) samples[i] = Math.random() * 2 - 1;
      const noise = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const hiss = context.createGain();
      noise.buffer = buffer;
      filter.type = "highpass";
      filter.frequency.value = type === "cymbal" ? 2900 : type === "hat" ? 5500 : 1700;
      hiss.gain.setValueAtTime(Math.max(.0001, (type === "cymbal" ? .045 : .027) * level), at);
      hiss.gain.exponentialRampToValueAtTime(.0001, at + length);
      noise.connect(filter); filter.connect(hiss); hiss.connect(contextState(context).master);
      noise.start(at); noise.stop(at + length);
      noise.onended = () => {
        noise.disconnect(); filter.disconnect(); hiss.disconnect();
      };
    }
    return;
  }
  const state = contextState(context);
  const at = context.currentTime + .006;
  const length = Math.max(.05, Math.min(30, duration));
  const release = instrument === "violin" || instrument === "cello" ||
    instrument === "string_ensemble_1" || instrument === "tremolo_strings" ||
    instrument === "choir_aahs" ? .24 : .12;
  const attack = instrument === "violin" || instrument === "string_ensemble_1" ||
    instrument === "choir_aahs" ? Math.min(.09, length * .35) : .015;
  const loudness = Math.max(.0001, Math.min(1, volume / 100) *
    Math.min(1, velocity / 127) * .18);

  const gain = context.createGain();
  gain.gain.setValueAtTime(.0001, at);
  gain.gain.linearRampToValueAtTime(loudness, at + attack);
  gain.gain.setValueAtTime(loudness, at + Math.max(attack, length - .012));
  gain.gain.linearRampToValueAtTime(.0001, at + length + release);
  gain.connect(state.master);

  const sample = nearestBuffer(context, instrument, pitch);
  let nodes = [];
  if (sample) {
    const source = context.createBufferSource();
    source.buffer = sample.buffer;
    source.playbackRate.setValueAtTime(2 ** ((pitch - sample.pitch) / 12), at);
    if (sample.buffer.duration > .65 && length > sample.buffer.duration * .75) {
      source.loop = true;
      source.loopStart = .15;
      source.loopEnd = Math.min(sample.buffer.duration - .09, sample.buffer.duration * .72);
    }
    if (Number.isInteger(toPitch) && glideSeconds >= .05) {
      const transition = Math.min(glideSeconds, length);
      source.playbackRate.setValueAtTime(
        2 ** ((pitch - sample.pitch) / 12), at + length - transition);
      source.playbackRate.exponentialRampToValueAtTime(
        2 ** ((toPitch - sample.pitch) / 12), at + length);
    }
    source.connect(gain);
    source.start(at);
    source.stop(at + length + release + .015);
    nodes = [source];
  } else {
    // Deterministic local fallback: separate oscillators per sustained note,
    // so chords remain audible even without network access.
    const main = context.createOscillator(), layer = context.createOscillator();
    const color = context.createBiquadFilter(), layerGain = context.createGain();
    color.type = "lowpass";
    const dark = instrument === "cello" || instrument === "acoustic_bass";
    main.type = dark ? "triangle" : "sawtooth";
    layer.type = dark ? "sine" : "triangle";
    color.frequency.value = dark ? 1250 : instrument === "french_horn" ? 2100 : 2950;
    layerGain.gain.value = .28;
    main.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
    layer.frequency.value = main.frequency.value * (dark ? .5 : 1.005);
    main.connect(color); layer.connect(layerGain); layerGain.connect(color);
    color.connect(gain);
    main.start(at); layer.start(at);
    main.stop(at + length + release + .015);
    layer.stop(at + length + release + .015);
    nodes = [main, layer, layerGain, color];
  }
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    state.playing.delete(stop);
    for (const node of nodes) {
      if (typeof node.stop === "function") {
        try { node.stop(); } catch { /* Already ended. */ }
      }
      node.disconnect();
    }
    gain.disconnect();
  };
  state.playing.add(stop);
  if (nodes[0] && "onended" in nodes[0]) nodes[0].onended = stop;
}

export function stopOrchestralVoices(context) {
  if (!context) return;
  const state = contextState(context);
  for (const stop of [...state.playing]) stop();
}
