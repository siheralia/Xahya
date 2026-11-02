const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadModule(file, deps = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname,"..",file),"utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(compiled, {
    exports,Math,Number,String,Object,Array,Set,Error,
    require(name){
      if(Object.hasOwn(deps,name))return deps[name];
      throw new Error("Unmocked module: "+name);
    },
  }, {filename:file});
  return exports;
}

const catalog = loadModule("lib/effects/catalog.ts");
const statistics = [
  {key:"strength",name:"Fuerza",code:"STR",kind:"basic",active:true},
  {key:"physicalAttack",name:"Ataque físico",code:"PHYSICAL_ATTACK",kind:"derived",active:true},
  {key:"magicAttack",name:"Ataque mágico",code:"MAGIC_ATTACK",kind:"derived",active:true},
  {key:"dodge",name:"Evasión",code:"DODGE",kind:"derived",active:true},
];

test("attack target dropdown resolves configured physical and magic attack codes",()=>{
  const targets=catalog.resolveEffectTargets("DAMAGE_MULTIPLIER",statistics);
  assert.deepEqual(Array.from(targets.map(x=>x.key)),["PHYSICAL_ATTACK","MAGIC_ATTACK","ATTACK_TOTAL"]);
  assert.ok(targets.some(t=>t.key==="PHYSICAL_ATTACK"&&t.label==="Ataque físico"));
  assert.ok(targets.some(t=>t.key==="MAGIC_ATTACK"&&t.label==="Ataque mágico"));
});

test("current and legacy attack identifiers are both accepted by the shared validator",()=>{
  for(const type of ["DAMAGE_MULTIPLIER","COMBAT_MULTIPLIER"]){
    for(const target of ["PHYSICAL_ATTACK","MAGIC_ATTACK","PHYS_ATK","MAGIC_ATK","ATTACK_TOTAL"]){
      assert.equal(catalog.validateEffectTarget(type,target,statistics),true,`${type}: ${target}`);
    }
    for(const target of ["DODGE","STR","BOGUS"]){
      assert.equal(catalog.validateEffectTarget(type,target,statistics),false,`${type}: ${target}`);
    }
  }
});

test("fallback when no dynamic stat catalog keeps historical saved skills usable",()=>{
  const targets=catalog.resolveEffectTargets("DAMAGE_MULTIPLIER",[]);
  assert.deepEqual(Array.from(targets.map(x=>x.key)),["PHYS_ATK","MAGIC_ATK","ATTACK_TOTAL"]);
  assert.equal(catalog.validateEffectTarget("DAMAGE_MULTIPLIER","PHYSICAL_ATTACK",[]),true);
  assert.equal(catalog.validateEffectTarget("DAMAGE_MULTIPLIER","MAGIC_ATTACK",[]),true);
});

const upgrade=loadModule("lib/skills/upgrade.ts",{
  "@/lib/skills/effect-requirements":{
    validEffectRequirements: v=>Array.isArray(v),
    effectRequirementDiscount: p=>p,
  },
  "@/lib/skills/interaction-engine":{validateSkillMechanics:()=>null},
  "@/lib/skills/mechanics-pricing":{mechanicsPchCost:()=>0},
  "@/lib/skills/range-pricing":{applyRangePch:(pch,metres)=>Math.max(1,pch+metres-5)},
  "@/lib/skills/mana-pricing":{manaAdjustedPch:(pch,mana)=>Math.max(1,Math.ceil(2*pch-mana/5))},
  "@/lib/skills/cooldown":loadModule("lib/skills/cooldown.ts"),
  "@/lib/skills/speed-settings":{speedSurcharge:()=>0},
  "@/lib/skills/pch":{defaultEffectPricing:()=>({})},
  "@/lib/skills/configured-effect-pricing":{configuredSkillEffectPch:effect=>{
    const extra=Math.max(0,Math.ceil((effect.value/100-1)/0.5-1e-9))*2;
    return 6+extra+(effect.element&&effect.element!=="NEUTRAL"?2:0);
  }},
  "@/lib/effects/pricing":{readEffectPricing:async()=>({})},
  "@/lib/effects/duration-pricing-settings":{readDurationPricing:async()=>({maxTurns:20,maxMovements:20})},
  "@/lib/effects/narrative-cards":{readNarrativeEffectCards:async()=>[]},
  "@/lib/effects/catalog":catalog,
  "@/lib/stats/dynamic":{readStatisticsCatalog:async()=>statistics},
  "@/lib/effects/skill-conditions":{validateSkillParameters:()=>null},
  "@/lib/skills/copy":{validateCopyEffect:()=>null},
  "@/lib/skills/theft":{validateTheftEffect:()=>null},
  "@/lib/combat/matchup-types":loadModule("lib/combat/matchup-types.ts"),
});

const skill=(target,cost,range,element)=>({
  name:"Técnica genérica",description:"Prueba de un efecto de ataque.",
  category:"OFFENSIVE",cost,
  maintenanceCost:0,accumulationCost:0,accumulationPerTick:0,
  maxRangeMeters:range,speed:"DEFAULT",cooldown:"Sin cooldown",
  effect:[{type:"DAMAGE_MULTIPLIER",target,value:100,...(element?{element}:{})}],
  effectRequirements:[],mechanics:{},
});

test("generic skill quotes validate both current and historical attack codes",async()=>{
  for(const target of ["PHYS_ATK","PHYSICAL_ATTACK"]){
    assert.equal((await upgrade.priceUpgrade(skill(target,10,0))).pch,5);
  }
  for(const target of ["MAGIC_ATK","MAGIC_ATTACK"]){
    assert.equal((await upgrade.priceUpgrade(skill(target,30,5,"FIRE"))).pch,10);
  }
  await assert.rejects(()=>upgrade.priceUpgrade(skill("DODGE",10,0)),/Objetivo inválido/);
});

test("character skill submission uses the same validation rule",()=>{
  const text=fs.readFileSync(path.join(__dirname,"../app/api/characters/[id]/skills/route.ts"),"utf8");
  assert.match(text,/validateEffectTarget\(type, target, statistics\)/);
  assert.doesNotMatch(text,/!\[\"MAGIC_ATTACK\", \"PHYSICAL_ATTACK\"\]\.includes\(target\)/);
});
