// Regression tests for the shared statistics resolver. Run: node --test tests/effective-stats.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const resolverSource = fs.readFileSync(path.join(__dirname, "../lib/stats/effective.ts"), "utf8");
const js = ts.transpileModule(resolverSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function resolver({ catalog = [], legacy = { strength: 100, agility: 20, constitution: 20, intelligence: 20, wisdom: 20, charisma: 20, spirit: 20, luck: 20 }, modifiers = [], items = [], owned = [], perks = [], assigned = [], derived = {} } = {}) {
  const tables = {
    CharacterStat: [{ characterId: 1, ...legacy }],
    CharacterStatValue: [],
    CharacterModifier: modifiers,
    CharacterItem: owned,
    Item: items,
    CharacterPerk: assigned,
    Perk: perks,
  };
  const source = { orm: { public: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, {
    where: (criteria) => ({
      first: async () => rows.find((row) => Object.entries(criteria).every(([key, value]) => row[key] === value)) ?? null,
      all: async () => rows.filter((row) => Object.entries(criteria).every(([key, value]) => row[key] === value)),
    }),
    all: async () => rows,
  }])) } };
  const dependencies = {
    "@/lib/db": { db: source },
    "@/lib/stats/dynamic": { readStatisticsCatalog: async () => catalog, CORE_BASIC_STAT_KEYS: new Set(["strength","agility","constitution","intelligence","wisdom","charisma","spirit","luck"]) },
    "@/lib/stats/engine": { calculateConfiguredDerivedStats: async (base) => ({ maxHp: 100, maxMana: 100, physicalAttack: base.strength, magicAttack: 50, ...derived }) },
    "@/lib/stats/derived": { applyDerivedItemEffects: (base, effects) => {
      const result = { ...base };
      for (const effect of effects) {
        if (!(effect.stat in result)) continue;
        if (effect.type === "stat_bonus") result[effect.stat] += effect.value;
        if (effect.type === "stat_multiplier") result[effect.stat] *= effect.value / 100;
      }
      return result;
    } },
    "@/lib/perks": { getPerkEffects: (entries) => entries.flatMap((entry) => entry.perk?.effects ?? []) },
  };
  const exports = {};
  vm.runInNewContext(js, { exports, require: (id) => {
    if (!(id in dependencies)) throw new Error("Unexpected import: " + id);
    return dependencies[id];
  }, Date, Set, Number, Object, Array, String });
  return exports.getEffectiveCharacterStats(1, source);
}

test("karma and equipped item bonuses are each applied once", async () => {
  const result = await resolver({
    modifiers: [{ characterId: 1, stat: "strength", amount: 20, source: "KARMA_BOOST" }],
    items: [{ id: 1, effects: [{ type: "stat_bonus", stat: "STR", value: 10 }] }],
    owned: [{ characterId: 1, itemId: 1, equipped: true }],
  });
  assert.equal(result.effectiveStats.strength, 130);
  assert.equal(result.derived.physicalAttack, 130);
  assert.equal(result.statBreakdown.strength.karmaBonus, 20);
});

test("unequipped objects do not grant bonuses", async () => {
  const result = await resolver({
    items: [{ id: 1, effects: [{ type: "stat_bonus", stat: "STR", value: 10 }] }],
    owned: [{ characterId: 1, itemId: 1, equipped: false }],
  });
  assert.equal(result.effectiveStats.strength, 100);
});

test("expired karma boosts are ignored", async () => {
  const result = await resolver({ modifiers: [{ characterId: 1, stat: "strength", amount: 20, source: "KARMA_BOOST", expiresAt: "2000-01-01T00:00:00.000Z" }] });
  assert.equal(result.effectiveStats.strength, 100);
});

test("inactive stat targets remain stored but do not affect derived values", async () => {
  const result = await resolver({
    catalog: [{ key: "maxHp", code: "HP", kind: "derived", active: false }],
    items: [{ id: 1, effects: [{ type: "stat_bonus", stat: "HP", value: 200 }] }],
    owned: [{ characterId: 1, itemId: 1, equipped: true }],
  });
  assert.equal(result.derived.maxHp, 100);
});

test("attack-total object multiplier is applied once in resolver", async () => {
  const result = await resolver({
    items: [{ id: 1, effects: [{ type: "stat_multiplier", stat: "ATTACK_TOTAL", value: 30 }] }],
    owned: [{ characterId: 1, itemId: 1, equipped: true }],
  });
  assert.equal(result.derived.physicalAttack, 130);
  assert.equal(result.derived.magicAttack, 65);
});

test("derived item bonus does not reapply a basic stat bonus", async () => {
  const result = await resolver({
    items: [{ id: 1, effects: [{ type: "stat_bonus", stat: "STR", value: 10 }, { type: "stat_bonus", stat: "PHYS_ATK", value: 5 }] }],
    owned: [{ characterId: 1, itemId: 1, equipped: true }],
  });
  assert.equal(result.effectiveStats.strength, 110);
  assert.equal(result.derived.physicalAttack, 115);
});
