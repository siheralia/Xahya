import { parseOrbitalScore, SCORE_FORMAT, SCORE_VERSION } from "./orbital-score.mjs";

/** Restrained MIDI file reader: header, tempo map, note on/off and GM instruments.
 * No packages, eval or network; the file is an optional user-supplied input. */
const GM_ORCHESTRA = Object.freeze({
  30: "distortion_guitar", 33: "acoustic_bass",
  40: "violin", 42: "cello", 44: "tremolo_strings",
  47: "timpani", 48: "string_ensemble_1", 49: "string_ensemble_1",
  52: "choir_aahs", 60: "french_horn", 61: "brass_section",
});

export function importOrbitalMidi(input, title = "Partitura MIDI") {
  const bytes = input instanceof Uint8Array ? input :
    input instanceof ArrayBuffer ? new Uint8Array(input) : null;
  if (!bytes || bytes.length < 14 || bytes.length > 1024 * 1024) {
    throw new Error("El archivo MIDI no es válido o supera 1 MB.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const need = (n) => { if (offset + n > bytes.length) throw new Error("Archivo MIDI incompleto."); };
  const u8 = () => { need(1); return bytes[offset++]; };
  const u16 = () => { need(2); const value = view.getUint16(offset); offset += 2; return value; };
  const u32 = () => { need(4); const value = view.getUint32(offset); offset += 4; return value; };
  const ascii = (length) => {
    need(length); const text = String.fromCharCode(...bytes.subarray(offset, offset + length));
    offset += length; return text;
  };
  const variable = (limit) => {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      if (offset >= limit) throw new Error("Evento MIDI incompleto.");
      const byte = u8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error("Duración MIDI inválida.");
  };

  if (ascii(4) !== "MThd") throw new Error("El archivo no es un MIDI estándar.");
  const headerLength = u32();
  if (headerLength < 6 || headerLength > 512) throw new Error("Cabecera MIDI incorrecta.");
  const format = u16(), count = u16(), division = u16();
  if (format > 1 || count > 32 || (division & 0x8000) || division === 0) {
    throw new Error("Este formato MIDI no está soportado.");
  }
  offset = 8 + headerLength;
  const tempo = [{ tick: 0, us: 500000 }];
  const rawTracks = [];
  for (let t = 0; t < count; t++) {
    if (ascii(4) !== "MTrk") throw new Error("Falta una pista MIDI.");
    const length = u32();
    const end = offset + length;
    if (end > bytes.length) throw new Error("Pista MIDI incompleta.");
    let tick = 0, running = 0, program = 48, label = "Pista " + (t + 1), drum = false;
    const active = new Map(), notes = [];
    while (offset < end) {
      tick += variable(end);
      let status = u8();
      if (status < 0x80) {
        if (!running) throw new Error("Estado MIDI inválido.");
        offset--;
        status = running;
      } else if (status < 0xf0) {
        running = status;
      }
      if (status === 0xff) {
        const kind = u8(), size = variable(end);
        if (offset + size > end) throw new Error("Metadatos MIDI incompletos.");
        if (kind === 0x51 && size === 3) {
          tempo.push({ tick, us: (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2] });
        }
        if (kind === 0x03 && size <= 80) {
          label = new TextDecoder().decode(bytes.subarray(offset, offset + size)).trim() || label;
        }
        offset += size;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const size = variable(end); need(size); offset += size; running = 0; continue;
      }
      const hi = status & 0xf0, channel = status & 0x0f;
      const first = u8();
      const second = hi === 0xc0 || hi === 0xd0 ? 0 : u8();
      if (channel === 9) drum = true;
      if (hi === 0xc0 && channel !== 9) program = first;
      if (hi !== 0x80 && hi !== 0x90) continue;
      const key = channel + ":" + first;
      if (hi === 0x90 && second > 0) {
        const stack = active.get(key) ?? [];
        stack.push({ tick, pitch: first, velocity: second });
        active.set(key, stack);
      } else {
        const stack = active.get(key);
        if (stack?.length) {
          const started = stack.shift();
          if (tick > started.tick) notes.push({ ...started, end: tick });
        }
      }
      if (notes.length > 2048) throw new Error("Demasiadas notas en la pista.");
    }
    offset = end;
    if (notes.length > 0) rawTracks.push({ name: label, instrument: drum ? "drumkit" : (GM_ORCHESTRA[program] ?? "string_ensemble_1"), notes });
  }

  tempo.sort((a,b) => a.tick - b.tick);
  const tempoMap = [];
  for (const item of tempo) {
    if (item.us <= 0) continue;
    if (tempoMap.length && item.tick === tempoMap[tempoMap.length - 1].tick) {
      tempoMap[tempoMap.length - 1].us = item.us;
    } else tempoMap.push({ ...item, seconds: 0 });
  }
  for (let i = 1; i < tempoMap.length; i++) {
    const previous = tempoMap[i - 1];
    tempoMap[i].seconds = previous.seconds +
      (tempoMap[i].tick - previous.tick) * previous.us / (division * 1e6);
  }
  const toSeconds = (tick) => {
    let selected = tempoMap[0];
    for (const item of tempoMap) {
      if (item.tick > tick) break;
      selected = item;
    }
    return selected.seconds + (tick - selected.tick) * selected.us / (division * 1e6);
  };

  const tracks = rawTracks.map((track) => ({
    name: track.name, instrument: track.instrument,
    notes: track.notes.map((note) => ({
      pitch: note.pitch,
      start: Number(toSeconds(note.tick).toFixed(5)),
      duration: Math.max(0.05, Number((toSeconds(note.end) - toSeconds(note.tick)).toFixed(5))),
      velocity: note.velocity,
    })),
  }));
  const endSeconds = Math.max(0, ...tracks.flatMap(track =>
    track.notes.map(note => note.start + note.duration)));
  if (endSeconds > 30) throw new Error("El MIDI supera el máximo de 30 segundos por vuelta.");
  const period = Math.max(4, Math.min(30, Math.ceil(endSeconds * 10) / 10));
  return parseOrbitalScore({
    format: SCORE_FORMAT, version: SCORE_VERSION,
    title: title.slice(0, 120) || "Partitura MIDI", percussion: "none",
    groups: [{ duration: period, direction: 1 }, { duration: period, direction: 1 }],
    rings: [], tracks,
  });
}
