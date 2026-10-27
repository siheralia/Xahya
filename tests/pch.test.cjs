const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const source = fs.readFileSync(path.join(__dirname, "../lib/skills/pch.ts"), "utf8");
const pchExports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: pchExports, require });
test("each skill coin represents ten PCH", () => assert.equal(pchExports.PCH_PER_COIN, 10));
test("narrative effect has a fixed starting price", () => assert.equal(pchExports.calculateSkillPch([{ type: "NARRATIVE", description: "A narrative effect" }]), 5));
test("effects sum and power raises their cost", () => assert.equal(pchExports.calculateSkillPch([{ type: "STAT_BONUS", value: 1 }, { type: "STAT_BONUS", value: 4 }]), 6));
test("empty skills cannot be priced", () => assert.equal(pchExports.calculateSkillPch([]), 0));

const catalogExports = {};
const catalogSource = fs.readFileSync(path.join(__dirname, "../lib/effects/catalog.ts"), "utf8");
vm.runInNewContext(ts.transpileModule(catalogSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: catalogExports, require });
test("every supported effect type has an explicit PCH price", () => {
  for (const definition of catalogExports.EFFECT_CATALOG) {
    assert.ok(Number.isInteger(pchExports.BASE_COST[definition.type]), definition.type);
    assert.ok(pchExports.effectPchCost({ type: definition.type, value: 1 }) > 0, definition.type);
  }
});
test("unsupported effect types cannot silently receive generic PCH pricing", () => {
  assert.throws(() => pchExports.calculateSkillPch([{ type: "UNKNOWN_EFFECT", value: 1 }]), /sin precio PCH/);
});
test("higher power does not decrease a supported effect's price", () => {
  for (const definition of catalogExports.EFFECT_CATALOG) {
    const values = [1, 2, 4, 8, 16].map((value) => pchExports.effectPchCost({ type: definition.type, value }));
    assert.ok(values.every((value, i) => i === 0 || value >= values[i - 1]), definition.type);
  }
});
