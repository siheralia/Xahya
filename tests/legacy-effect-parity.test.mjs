import test from "node:test";
import assert from "node:assert/strict";
import {
  projectLegacyNumericEffects,evaluateLegacyNumericProjection,
  compareLegacyCombatNumbers,compareLegacyRacialDamageNumbers
} from "../lib/skills/legacy-effect-adapter.ts";
import {calculateSkillPch,skillEffectMultiplier} from "../lib/skills/pch.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";

const attack=(id,name,target,defenseType)=>({
  id,name,category:"OFFENSIVE",status:"APPROVED",cost:id===2?20:30,
  areaOfEffect:"Objetivo único | Alcance máximo: 5 m",attackType:"PIERCE",
  duration:"Instantánea",cooldown:id===2?"1 turno":"2 turnos",
  effect:[
    {type:"DAMAGE_MULTIPLIER",value:100,target,description:""},
    {type:defenseType,value:50,target:"STR",description:""},
    {type:"FINAL_DAMAGE_MULTIPLIER",value:300,target:"STR",description:""}
  ],mechanics:{}
});
// Real saved effect configurations; deliberately stripped of personal data.
const omega=attack(2,"Omega","PHYSICAL_ATTACK","IGNORE_PHYS_DEF_MULTIPLIER");
const alfa=attack(3,"Alfa","MAGIC_ATTACK","IGNORE_MAGIC_DEF_MULTIPLIER");
const heal={id:17,name:"Segunda oportunidad",category:"SUPPORT",status:"APPROVED",cost:12,
 duration:"Instantánea",cooldown:"Una vez por combate",effect:[
  {type:"RESOURCE_BONUS",value:18,target:"HP",targetKind:"SELF"}
 ],mechanics:{}};
const duramen=[
 {type:"CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER",value:50,target:"BLUNT",element:"NATURE"},
 {type:"CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER",value:50,target:"PIERCE",element:"NATURE"},
 {type:"CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER",value:175,target:"FIRE",element:"FIRE"},
];
const capoeira=[{type:"STAT_MULTIPLIER",value:150,target:"DODGE",description:""}];
const reequipment=[
 {type:"STAT_MULTIPLIER",value:200,target:"AGI"},
 {type:"STAT_MULTIPLIER",value:200,target:"STR"},
 {type:"STAT_BONUS",value:10,target:"STR"},
];
const mirror=[
 {type:"SUMMON_MIRROR",value:1,target:"OTHER"},
 {type:"MIRROR_RAY",value:100,target:"MAGIC_ATTACK"},
 {type:"MAGIC_REFLECTION",value:100,target:"OTHER"},
];
test("Omega exact numerical parity with the current approved combat compiler",()=>{
 const parity=compareLegacyCombatNumbers(omega);
 assert.equal(parity.equivalent,true,parity.differences.join(","));
 assert.deepEqual(parity.expected,{damageMultiplier:1,defenseFactor:0.5,finalMultiplier:3,healing:0,bonuses:[]});
 assert.deepEqual(parity.actual,parity.expected);
 assert.equal(parity.projected.executionReady,false);
});
test("Alfa exact numerical parity, using magical defense and unchanged final-damage order",()=>{
 const parity=compareLegacyCombatNumbers(alfa);
 assert.equal(parity.equivalent,true);
 assert.deepEqual(parity.actual,parity.expected);
 assert.equal(compileCombatSkill(alfa).usesMagic,true);
});
test("real Segunda oportunidad healing projects 18 HP, retains once-per-combat in legacy plan",()=>{
 const parity=compareLegacyCombatNumbers(heal);
 assert.equal(parity.equivalent,true);
 assert.equal(parity.actual.healing,18);
 assert.equal(compileCombatSkill(heal).oncePerCombat,true);
 assert.deepEqual(parity.projected.source[0].unmappedParameters,["targetKind"]);
});
test("Duramen antiguo replicates racial 50% blunt/pierce and 175% fire factors",()=>{
 const parity=compareLegacyRacialDamageNumbers(duramen);
 assert.equal(parity.equivalent,true,parity.differences.join(","));
 assert.deepEqual(parity.actual,{BLUNT:0.5,PIERCE:0.5,FIRE:1.75});
 assert.deepEqual(parity.actual,parity.expected);
});
test("percent convention is preserved for passive Capoeira: 150 = x1.5",()=>{
 const projected=projectLegacyNumericEffects(capoeira);
 assert.equal(projected.skipped.length,0);
 assert.deepEqual(evaluateLegacyNumericProjection(projected),[{kind:"MODIFIER",stat:"STAT_MULTIPLIER:dodge",multiplier:1.5}]);
 assert.equal(skillEffectMultiplier("STAT_MULTIPLIER",150),1.5);
});
test("Reequipamiento decomposes x2 AGI, x2 STR and +10 STR without flattening + into ×",()=>{
 const intents=evaluateLegacyNumericProjection(projectLegacyNumericEffects(reequipment));
 assert.deepEqual(intents,[
  {kind:"MODIFIER",stat:"STAT_MULTIPLIER:AGI",multiplier:2},
  {kind:"MODIFIER",stat:"STAT_MULTIPLIER:STR",multiplier:2},
  {kind:"BONUS",stat:"STR",amount:10}
 ]);
});
test("legacy PCH is untouched, including 100-percent identity and final multiplier",()=>{
 assert.equal(calculateSkillPch(omega.effect),28);
 assert.equal(calculateSkillPch(alfa.effect),28);
 assert.equal(skillEffectMultiplier("DAMAGE_MULTIPLIER",100),1);
 assert.equal(skillEffectMultiplier("DAMAGE_MULTIPLIER",200),2);
});
test("special mirror is explicitly not convertible and never partially marked equivalent",()=>{
 const p=projectLegacyNumericEffects(mirror);
 assert.equal(p.skipped.length,3);
 assert.equal(p.containers.length,0);
 assert.throws(()=>evaluateLegacyNumericProjection(p),/proyección parcial/);
});
test("unknown targeting, element and duration stay visible for future full-fidelity adapters",()=>{
 const p=projectLegacyNumericEffects([{
  type:"DAMAGE_MULTIPLIER",value:200,target:"PHYSICAL_ATTACK",
  element:"LIGHT",targetKind:"OPPONENT",targetReference:"Cualquiera alrededor",durationTurns:3
 }]);
 assert.equal(p.skipped.length,0);
 assert.deepEqual(p.source[0].unmappedParameters,["element","targetKind","targetReference","durationTurns"]);
 assert.equal(p.source[0].effect.targetReference,"Cualquiera alrededor");
 assert.equal(p.executionReady,false);
});
test("malformed, unknown, and invalid targets are fail-closed rather than silently rewritten",()=>{
 const p=projectLegacyNumericEffects([
  {type:"STAT_MULTIPLIER",value:Infinity,target:"STR"},
  {type:"RESOURCE_BONUS",value:50,target:"MONEY"},
  {type:"DAMAGE_MULTIPLIER",value:200,target:"ATTACK_TOTAL"},
  {type:"STAT_BONUS",value:-50,target:"STR"},
  {type:"NARRATIVE",value:1,target:"OTHER"}
 ]);
 assert.equal(p.skipped.length,5);
 assert.throws(()=>evaluateLegacyNumericProjection(p),/proyección parcial/);
});
test("randomized numeric parity for combinations accepted by the legacy compiler",()=>{
 // Deterministic variations of both sides; the authoritative compiler remains the oracle.
 for(const kind of [omega,alfa]){
  for(const raw of [25,50,75,100,125,150,200,300]){
   const row={...kind,effect:kind.effect.map((e,i)=>({...e,value:i===2?300:raw}))};
   const parity=compareLegacyCombatNumbers(row);
   assert.equal(parity.equivalent,true,JSON.stringify({kind:kind.name,raw,diff:parity.differences}));
  }
 }
});
