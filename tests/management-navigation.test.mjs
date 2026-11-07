import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const navigation = readFileSync(
  new URL("../app/management/_components/ManagementNavigation.tsx", import.meta.url),
  "utf8",
);
const parent = readFileSync(
  new URL("../app/management/management-page-client.tsx", import.meta.url),
  "utf8",
);

function groupLinks(id) {
  const group = navigation.match(new RegExp('id: "' + id + '",[\\s\\S]*?links: \\[([\\s\\S]*?)\\n    \\],'));
  assert.ok(group, "No existe el grupo " + id);
  return [...group[1].matchAll(/href: "([^"]+)"/g)].map((match) => match[1]);
}

test("Gestión conserva sus 25 accesos sin duplicarlos", () => {
  const expected = {
    system: [
      "/management/logs", "/management/rankings", "/management/rules",
      "/management/roles", "/management/users", "/management/ambientations",
      "/management/elements",
    ],
    adventures: [
      "/management/maze", "/management/enemies", "/management/themes", "/management/social",
    ],
    characters: [
      "/management/races", "/management/perks", "/management/skills",
      "/management/statistics", "/management/effects", "/management/character-tools",
    ],
    objects: [
      "/management/items", "/management/materials", "/management/material-types",
    ],
    economy: [
      "/management/world", "/management/store", "/management/casino",
      "/management/businesses", "/management/businesses/repair-services",
    ],
  };
  for (const [id, hrefs] of Object.entries(expected)) {
    assert.deepEqual(groupLinks(id), hrefs, "Accesos o agrupación incorrectos: " + id);
  }
  const allLinks = Object.values(expected).flat();
  assert.equal(allLinks.length, 25);
  assert.equal(new Set(allLinks).size, allLinks.length);
});

test("Los accesos respetan las restricciones de permisos originales", () => {
  assert.match(navigation, /allowedPages\.includes\("management\." \+ permission\)/);
  assert.match(navigation, /link\.permissions\.some\(canSee\)/);
  assert.match(navigation, /\(!link\.staffOnly \|\| isStaff\)/);
  assert.match(navigation, /\(!link\.adminOnly \|\| isAdmin\)/);
  for (const page of ["enemies", "ambientations", "themes"]) {
    assert.match(navigation, new RegExp('href: "/management/' + page + '".*staffOnly: true'));
  }
  for (const page of ["materials", "material-types"]) {
    assert.match(navigation, new RegExp('href: "/management/' + page + '", permissions: \\["materials", "items"\\]'));
  }
  assert.match(navigation, /permissions: \["characters", "character-resources", "character-details", "global-delivery"\]/);
  assert.match(navigation, /if \(links\.length === 0\) return null/);
});

test("La portada usa grupos responsivos y la edición separada no cambia", () => {
  assert.match(navigation, /lg:grid-cols-2/);
  assert.match(navigation, /aria-labelledby=/);
  assert.match(parent, /<ManagementNavigation allowedPages=\{allowedPages\} isAdmin=\{isAdmin\} isGM=\{isGM\}/);
  assert.match(parent, /\{toolsMode && <div className="mb-4">/);
  assert.match(parent, /Administra los sistemas y contenidos de Xahya\./);
});
