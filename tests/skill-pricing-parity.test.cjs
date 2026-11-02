const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(relative, dependencies = {}) {
  const file = path.join(__dirname, "..", relative);
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error("Unexpected import: " + name);
    },
    Math, Number, String, Object, Array, Error,
  }, {filename:relative});
  return exports;
}

const duration = load("lib/effects/duration-pricing.ts");
const pch = load("lib/skills/pch.ts");
const configured = load("lib/skills/configured-effect-pricing.ts", {
  "@/lib/effects/duration-pricing": duration,
  "@/lib/skills/pch": pch,
});
const mana = load("lib/skills/mana-pricing.ts");
const range = load("lib/skills/range-pricing.ts");
const requirement = load("lib/skills/effect-requirements.ts");

const card = {id:"W002", pch:5};
const earthCardEffect = {
  type:"NARRATIVE",target:"CARD:W002",element:"EARTH",
  value:1,description:"Forjar sustancia: Crea una cantidad definida de material sólido",
};

const quote = (effect, configuredEffectPricing=pch.defaultEffectPricing(), durationPricing=duration.DEFAULT_DURATION_PRICING) => {
  const base = configured.configuredSkillEffectPch(effect,[card],configuredEffectPricing,durationPricing);
  return requirement.effectRequirementDiscount(
    range.applyRangePch(mana.manaAdjustedPch(base,10),7),[]
  );
};

test("Sikatā: W002 + Tierra + 10 maná + 7 m costs 14 PCH in every editor",()=>{
  assert.equal(pch.effectPchCost(earthCardEffect),7); // same number here, but a card may have its own base price
  assert.equal(configured.configuredSkillEffectPch(earthCardEffect,[card],pch.defaultEffectPricing(),duration.DEFAULT_DURATION_PRICING),7);
  assert.equal(quote(earthCardEffect),14);
});

test("ordinary narrative effects without a card still pay elemental surcharge",()=>{
  const ordinary = {...earthCardEffect, target:"", description:"Narrativo libre"};
  assert.equal(configured.configuredSkillEffectPch(ordinary,[card],pch.defaultEffectPricing(),duration.DEFAULT_DURATION_PRICING),7);
  assert.equal(quote(ordinary),14);
});

test("managed card price overrides ordinary narrative base, including an element",()=>{
  const customPrices = {...pch.defaultEffectPricing(),NARRATIVE:{base:99,step:1,enabled:true}};
  assert.equal(configured.configuredSkillEffectPch(earthCardEffect,[{id:"W002",pch:8}],customPrices,duration.DEFAULT_DURATION_PRICING),10);
});

test("duration modifiers are identical for character and management forms",()=>{
  const threeTurns = {...earthCardEffect,durationTurns:3};
  assert.equal(configured.configuredSkillEffectPch(threeTurns,[card],pch.defaultEffectPricing(),duration.DEFAULT_DURATION_PRICING),11);
  assert.equal(quote(threeTurns),22);
});

test("non-card effects use managed pricing instead of hardcoded defaults",()=>{
  const customPrices = {...pch.defaultEffectPricing(), STAT_BONUS:{base:7,step:3,enabled:true}};
  const e = {type:"STAT_BONUS",target:"AGI",value:4,element:"EARTH"};
  assert.equal(configured.configuredSkillEffectPch(e,[card],customPrices,duration.DEFAULT_DURATION_PRICING),15);
});

test("neutral cards use the card price without an elemental surcharge",()=>{
  const neutral = {...earthCardEffect,element:"NEUTRAL"};
  assert.equal(configured.configuredSkillEffectPch(neutral,[card],pch.defaultEffectPricing(),duration.DEFAULT_DURATION_PRICING),5);
  assert.equal(quote(neutral),10);
});

test("missing element has no surcharge; other elements pay once",()=>{
  const withoutElement = {...earthCardEffect};
  delete withoutElement.element;
  assert.equal(configured.configuredSkillEffectPch(withoutElement,[card],pch.defaultEffectPricing(),duration.DEFAULT_DURATION_PRICING),5);
  const fire = {...earthCardEffect,element:"FIRE"};
  assert.equal(configured.configuredSkillEffectPch(fire,[card],pch.defaultEffectPricing(),duration.DEFAULT_DURATION_PRICING),7);
});

test("server submission and upgrades reuse the central per-effect price calculation",()=>{
  const submission=fs.readFileSync(path.join(__dirname,"../app/api/characters/[id]/skills/route.ts"),"utf8");
  const upgrades=fs.readFileSync(path.join(__dirname,"../lib/skills/upgrade.ts"),"utf8");
  const management=fs.readFileSync(path.join(__dirname,"../app/management/skills/page.tsx"),"utf8");
  const character=fs.readFileSync(path.join(__dirname,"../app/characters/[id]/page.tsx"),"utf8");
  for(const source of [submission,upgrades,management,character]){
    assert.match(source,/configuredSkillEffectPch/);
  }
});
