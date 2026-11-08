/** Human-readable labels for the instrumental orbits, including MIDI tracks. */
export const ORBIT_INSTRUMENT_NAMES = Object.freeze({
  violin: "Violines",
  string_ensemble_1: "Conjunto de cuerdas",
  french_horn: "Trompas",
  cello: "Violonchelos",
  acoustic_bass: "Contrabajo",
  distortion_guitar: "Guitarra eléctrica",
  choir_aahs: "Coro",
  tremolo_strings: "Cuerdas trémolo",
  timpani: "Timbales",
  brass_section: "Sección de metales",
  drumkit: "Percusión",
});

export const ORBIT_INSTRUMENT_SHORT_NAMES = Object.freeze({
  violin: "VIOLINES",
  string_ensemble_1: "CUERDAS",
  french_horn: "TROMPAS",
  cello: "VIOLONCHELOS",
  acoustic_bass: "CONTRABAJO",
  distortion_guitar: "GUITARRA",
  choir_aahs: "CORO",
  tremolo_strings: "TRÉMOLO",
  timpani: "TIMBALES",
  brass_section: "METALES",
  drumkit: "PERCUSIÓN",
});

export function orbitTrackRole(track) {
  const name = String(track?.name ?? "").toLowerCase();
  if (/melody|melod[ií]a|lead|theme|tema|principal/.test(name)) return "Melodía principal";
  if (/counter|respuesta|answer/.test(name)) return "Contramelodía";
  if (/drum|perc|beat/.test(name)) return "Ritmo de percusión";
  if (/bass|bajo|low/.test(name)) return "Graves";
  if (/pad|chord|harmon|acorde|sustain/.test(name)) return "Armonía sostenida";
  if (/ostinato|rhythm|ritmo|riff|pulse/.test(name)) return "Acompañamiento rítmico";
  if (/accent|hit|stab|impact|golpe/.test(name)) return "Acentos musicales";
  if (track?.instrument === "drumkit" || track?.instrument === "timpani") return "Ritmo de percusión";
  if (track?.instrument === "acoustic_bass") return "Graves";
  return "Pista instrumental";
}

export function orbitTrackLabel(track) {
  return (ORBIT_INSTRUMENT_NAMES[track?.instrument] ?? "Instrumento") +
    " · " + orbitTrackRole(track);
}
