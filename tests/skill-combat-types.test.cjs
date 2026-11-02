const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/combat/matchup-types.ts"), "utf8");
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, Set, String, Array, Object }, { filename: "matchup-types.ts" });

const { COMBAT_ATTACK_TYPE_OPTIONS, COMBAT_DEFENSE_TYPE_OPTIONS,
  validateSkillCombatTypes, normalizeSkillCombatType } = exports;

test("tipos canónicos de combate coinciden con los básicos", () => {
  assert.deepEqual(Array.from(COMBAT_ATTACK_TYPE_OPTIONS, x => x.value), ["CUT", "BLUNT", "PIERCE"]);
  assert.deepEqual(Array.from(COMBAT_DEFENSE_TYPE_OPTIONS, x => x.value), ["CONCENTRATED", "DISPERSED", "SOLID"]);
});

test("habilidades ofensivas, defensivas, híbridas y sin tipos son válidas", () => {
  for (const attackType of [null, "", ...COMBAT_ATTACK_TYPE_OPTIONS.map(x => x.value)]) {
    for (const defenseType of [null, "", ...COMBAT_DEFENSE_TYPE_OPTIONS.map(x => x.value)]) {
      assert.equal(validateSkillCombatTypes({ attackType, defenseType }), null);
    }
  }
  assert.equal(validateSkillCombatTypes({}), null);
});

test("rechaza códigos inválidos sin adivinar ni cambiar el tipo de ataque", () => {
  assert.match(validateSkillCombatTypes({ attackType: "FIRE" }), /ataque inválido/i);
  assert.match(validateSkillCombatTypes({ defenseType: "CUT" }), /defensa inválido|defensa inválida/i);
  assert.match(validateSkillCombatTypes({ attackType: ["CUT"] }), /ataque inválido/i);
  assert.equal(normalizeSkillCombatType("BLUNT"), "BLUNT");
  assert.equal(normalizeSkillCombatType(""), null);
  assert.equal(normalizeSkillCombatType(undefined), null);
});

test("la edición, compra, copia y robo preservan los tipos de las habilidades", () => {
  const text = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const routes = [
    "app/api/characters/[id]/skills/route.ts",
    "app/api/management/skills/route.ts",
    "app/api/management/skills/[id]/route.ts",
    "app/api/characters/[id]/generic-skills/route.ts",
    "app/api/management/skills/upgrades/[id]/route.ts",
    "app/api/management/skills/copies/[id]/route.ts",
    "app/api/characters/[id]/skills/thefts/route.ts",
  ];
  for (const route of routes) {
    assert.match(text(route), /attackType:/, route);
    assert.match(text(route), /defenseType:/, route);
  }
  assert.match(text("components/skills/SkillCoreFields.tsx"), /COMBAT_ATTACK_TYPE_OPTIONS/);
  assert.match(text("components/skills/SkillCoreFields.tsx"), /COMBAT_DEFENSE_TYPE_OPTIONS/);
});
