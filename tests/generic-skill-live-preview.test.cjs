const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname,"..",file),"utf8");
  const js = ts.transpileModule(source, {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(js, {
    exports,Math,Number,String,Array,Object,Set,Error,
    require(specifier){
      if(Object.hasOwn(dependencies,specifier))return dependencies[specifier];
      throw new Error("Missing dependency: "+specifier);
    },
  }, {filename:file});
  return exports;
}

const effects=load("lib/skills/pch.ts");
const duration=load("lib/effects/duration-pricing.ts");
const resistance=load("lib/skills/variable-resistance.ts");
const repair=load("lib/effects/repair-durability.ts");
const micro=load("lib/effects/micro-modules.ts",{
 "../skills/variable-resistance.ts":resistance,"./repair-durability.ts":repair
});
const composed=load("lib/skills/composed-effects.ts",{"../effects/micro-modules.ts":micro});
const configured=load("lib/skills/configured-effect-pricing.ts",{
  "./pch.ts":effects,
  "../effects/duration-pricing.ts":duration,
  "./composed-effects.ts":composed,
});
const mana=load("lib/skills/mana-pricing.ts");
const range=load("lib/skills/range-pricing.ts");
const requirements=load("lib/skills/effect-requirements.ts");
const mechanics=load("lib/skills/mechanics-pricing.ts",{"./variable-resistance.ts":resistance});
const cooldown=load("lib/skills/cooldown.ts");
const preview=load("lib/skills/generic-preview.ts",{
  "@/lib/skills/cooldown":cooldown,
  "@/lib/skills/mana-pricing":mana,
  "@/lib/skills/range-pricing":range,
  "@/lib/skills/effect-requirements":requirements,
  "@/lib/skills/mechanics-pricing":mechanics,
});

const cards=[{id:"W031",pch:5},{id:"W040",pch:5}];
const priceEffect=e=>configured.configuredSkillEffectPch(
  e,cards,effects.defaultEffectPricing(),duration.DEFAULT_DURATION_PRICING
);
const skill=(effect,{cost=0,maxRangeMeters=0,mechanics={}}={})=>({
  effect,effectRequirements:[],cost,maxRangeMeters,speed:"DEFAULT",mechanics,
});

test("generic price indicator reflects live 5 PCH physical and 10 PCH fireball quotes",()=>{
  const physical=skill([{type:"DAMAGE_MULTIPLIER",target:"PHYS_ATK",value:100}],{cost:10,maxRangeMeters:0});
  const fire=skill([{type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:100,element:"FIRE"}],{cost:30,maxRangeMeters:5});
  const p=preview.calculateGenericPricePreview(physical,null,[],priceEffect);
  const f=preview.calculateGenericPricePreview(fire,null,[],priceEffect);
  assert.equal(p.total,5);
  assert.equal(f.total,10);
  assert.equal(f.baseline,undefined);
  assert.equal(f.additional,10);
});

test("live preview updates for mana, range, and three-turn buffs",()=>{
  const buff=skill([
    {type:"STAT_BONUS",target:"STR",value:2,durationTurns:3},
    {type:"STAT_BONUS",target:"AGI",value:2,durationTurns:3},
  ],{cost:25,maxRangeMeters:0});
  const normal=preview.calculateGenericPricePreview(buff,null,[],priceEffect);
  assert.equal(normal.base,10);
  assert.equal(normal.manaAdjusted,15);
  assert.equal(normal.beforeRequirements,10);
  assert.equal(normal.total,10);
  const withRange=preview.calculateGenericPricePreview({...buff,maxRangeMeters:5},null,[],priceEffect);
  assert.equal(withRange.total,15);
});

test("specialization quote inherits parent effects and displays only additional PCH",()=>{
  const parent=skill([{type:"NARRATIVE",target:"CARD:W040",value:1}],{cost:0,maxRangeMeters:0});
  const base=preview.calculateGenericPricePreview(parent,null,[],priceEffect);
  assert.equal(base.total,5);
  const templates=[
    {id:1,parentTemplateId:null,totalPch:base.total,payload:parent},
  ];
  const child=skill([{type:"STAT_BONUS",target:"AGI",value:1}],{cost:0,maxRangeMeters:0});
  const quote=preview.calculateGenericPricePreview(child,1,templates,priceEffect);
  assert.equal(quote.base,7);
  assert.equal(quote.total,9);
  assert.equal(quote.baseline,5);
  assert.equal(quote.additional,4);
  assert.equal(preview.calculateGenericPricePreview({...child, cost:5},1,templates,priceEffect).total,8);
});

test("requirements and mechanics are inherited before computing generic specialization discounts",()=>{
  const parent={id:1,parentTemplateId:null,totalPch:5,
    payload:{...skill([{type:"NARRATIVE",target:"CARD:W040",value:1}]),effectRequirements:[{effect:"CREATE"}]}};
  const child={...skill([{type:"STAT_BONUS",target:"AGI",value:1}]),
    effectRequirements:[{effect:"CREATE"},{effect:"STAT_BONUS",element:"LIGHT"}]};
  const quote=preview.calculateGenericPricePreview(child,1,[parent],priceEffect);
  assert.equal(quote.beforeRequirements,9);
  assert.equal(quote.total,7); // total 30% discount rounded upward
  assert.equal(quote.additional,2);
});

test("generic editor receives live prices and displays specialization breakdown",()=>{
  const component=fs.readFileSync(path.join(__dirname,"../components/skills/GenericSkillTemplatesManagement.tsx"),"utf8");
  const modal=fs.readFileSync(path.join(__dirname,"../components/skills/SkillFormModal.tsx"),"utf8");
  const effectsUi=fs.readFileSync(path.join(__dirname,"../components/skills/SkillEffectsEditor.tsx"),"utf8");
  assert.match(component,/calculateGenericPricePreview\(/);
  assert.match(component,/pch=\{preview\?/);
  assert.match(component,/statistics=\{statistics\} narrativeCards=\{narrativeCards\} effectDefinitions=\{effectDefinitions\}/);
  assert.match(modal,/genericSpecialization/);
  assert.match(effectsUi,/effectDefinitions\?\.find\(def=>def\.type===type\)\?\.targets/);
  assert.doesNotMatch(component,/pch=\{undefined\}/);
});
