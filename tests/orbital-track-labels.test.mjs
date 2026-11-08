import test from "node:test";
import assert from "node:assert/strict";
import {
  ORBIT_INSTRUMENT_NAMES, ORBIT_INSTRUMENT_SHORT_NAMES,
  orbitTrackLabel, orbitTrackRole,
} from "../lib/orbital-track-labels.mjs";

test("mostrar instrumento y función musical del anillo seleccionado", () => {
  assert.equal(orbitTrackLabel({ name: "violin_melody", instrument: "violin" }),
    "Violines · Melodía principal");
  assert.equal(orbitTrackLabel({ name: "strings_pad", instrument: "string_ensemble_1" }),
    "Conjunto de cuerdas · Armonía sostenida");
  assert.equal(orbitTrackLabel({ name: "bass", instrument: "acoustic_bass" }),
    "Contrabajo · Graves");
  assert.equal(orbitTrackLabel({ name: "drums", instrument: "drumkit" }),
    "Percusión · Ritmo de percusión");
  assert.equal(orbitTrackRole({ name: "lead_theme", instrument: "cello" }),
    "Melodía principal");
  assert.equal(ORBIT_INSTRUMENT_SHORT_NAMES.french_horn, "TROMPAS");
  assert.equal(Object.keys(ORBIT_INSTRUMENT_NAMES).length, 11);
});
