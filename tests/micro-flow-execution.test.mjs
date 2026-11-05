import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  validateEffectContainers,executeMicroEvent,emptyMicroState
} from "../lib/effects/micro-modules.ts";
import {cloneLegacySkillAsMicro,legacyShadowCombatNumbers} from "../lib/effects/legacy-modular-shadow.ts";
import {GLORIA_MICRO_PRESETS} from "../lib/effects/micro-template-presets.ts";
const fixture=JSON.parse(readFileSync(new URL("./fixtures/legacy-modular-shadow-2026-11-04.json",import.meta.url),"utf8"));
const effect=steps=>({id:"WIRED",name:"Wired",description:"",type:"PASSIVE",trigger:"PASSIVE",steps});
const ctx={eventId:"wiringTest",ownerId:42,trigger:"PASSIVE",
 stats:{HP:50,MAX_HP:100,magicAttack:90}};
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("every supported historic numeric effect has real calculation-to-application edges",()=>{
 for(const row of fixture.definitions){
  const clone=cloneLegacySkillAsMicro(row,row.source);
  for(const part of clone.parts){
   if(part.status!=="EXECUTABLE")continue;
   const steps=part.modules.flatMap(e=>e.steps);
   if(!["DAMAGE_MULTIPLIER","FINAL_DAMAGE_MULTIPLIER","RESOURCE_BONUS","STAT_BONUS",
     "CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER","MAZE_TRAP_EVASION","MIRROR_RAY"].includes(part.sourceType))continue;
   const calculations=steps.filter(s=>s.kind==="CALCULATE");
   assert.ok(calculations.length>=1,row.name+":"+part.sourceType);
   const consumers=steps.filter(s=>s.kind==="MODIFIER"||s.kind==="BONUS"||s.kind==="HEAL");
   assert.ok(consumers.length>0,row.name+":"+part.sourceType);
   assert.ok(consumers.some(s=>{
    const expr=s.kind==="MODIFIER"?s.multiplier:s.amount;
    return typeof expr==="object"&&"source" in expr&&expr.source==="OUTPUT"&&
      calculations.some(calc=>calc.output===expr.key);
   }),"Arithmetic intent must be wired to an actual calculator.");
   assert.equal(validateEffectContainers(part.modules),null);
  }
 }
});
test("Descarga eléctrica runs a 3-node value -> /100 -> modifier graph, with identical numeric intent",()=>{
 const raw={type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATK",value:160};
 const clone=cloneLegacySkillAsMicro({id:12,name:"Descarga eléctrica",effect:[raw]},"genericSkillTemplate");
 const steps=clone.parts[0].modules[0].steps;
 assert.deepEqual(steps.map(s=>s.kind),["CALCULATE","CALCULATE","MODIFIER"]);
 assert.deepEqual(steps[1].expression,{
  operator:"DIVIDE",args:[{source:"OUTPUT",key:"sourcePower0"},100]
 });
 assert.equal(steps[2].multiplier.source,"OUTPUT");
 assert.equal(legacyShadowCombatNumbers([raw]).damageMultiplier,1.6);
 const intents=executeMicroEvent(emptyMicroState(),[effect(steps)],ctx).intents;
 assert.deepEqual(intents,[{kind:"MODIFIER",stat:"DAMAGE_MULTIPLIER",multiplier:1.6}]);
});
test("No narrative-only creation masquerades as a working object generator",()=>{
 const row={id:1,name:"Fotoconstrucción",category:"UTILITY",effect:[{
  type:"NARRATIVE",target:"CARD:W002",capability:"CREATE",
  element:"LIGHT",description:"Crear materia de luz",value:1
 }]};
 const clone=cloneLegacySkillAsMicro(row,"raceSkill");
 assert.equal(clone.coverage,"UNSUPPORTED");
 assert.equal(clone.parts[0].status,"DESCRIPTION_ONLY");
 assert.deepEqual(clone.parts[0].modules[0].steps.map(s=>s.kind),["CAPABILITY"]);
 assert.equal(legacyShadowCombatNumbers(row.effect),null);
});
test("output references are validated for every numeric consumer, not just resistance",()=>{
 const producer={kind:"CALCULATE",output:"p",expression:100};
 const output={source:"OUTPUT",key:"p"};
 for(const consumer of [
  {kind:"CALCULATE",output:"q",expression:output},
  {kind:"MODIFIER",stat:"DAMAGE_MULTIPLIER",multiplier:output},
  {kind:"BONUS",stat:"STR",amount:output},
  {kind:"HEAL",amount:output},
  {kind:"DAMAGE",channel:"MAGICAL",amount:output},
  {kind:"STORE",accumulator:"E",capacity:5,value:output}
 ]){
  assert.equal(validateEffectContainers([effect([producer,consumer])]),null);
  assert.match(validateEffectContainers([effect([consumer,producer])]),/productor anterior/);
 }
 const r=executeMicroEvent(emptyMicroState(),[effect([
  producer,{kind:"CALCULATE",output:"normalized",expression:{operator:"DIVIDE",args:[output,100]}},
  {kind:"MODIFIER",stat:"DAMAGE_MULTIPLIER",multiplier:{source:"OUTPUT",key:"normalized"}}
 ])],ctx);
 assert.equal(r.intents[0].multiplier,1);
 assert.match(validateEffectContainers([effect([producer,producer])]),/duplicada/);
});
test("Gloria's five compositions expose actual connections and preserve current behavior",()=>{
 assert.equal(GLORIA_MICRO_PRESETS.length,5);
 assert.equal(validateEffectContainers(GLORIA_MICRO_PRESETS.map(x=>x.effect)),null);
 for(const {label,effect:skill} of GLORIA_MICRO_PRESETS){
  assert.ok(skill.steps.length>=2,label);
  const producers=new Set();
  let links=0;
  for(const step of skill.steps){
   const expr=step.kind==="CALCULATE"?step.expression:
    step.kind==="STORE"?step.value:
    step.kind==="MODIFIER"?step.multiplier:
    step.kind==="HEAL"||step.kind==="DAMAGE"||step.kind==="BONUS"?step.amount:undefined;
   if(expr!==undefined&&JSON.stringify(expr).includes('"source":"OUTPUT"'))links++;
   if("output" in step)producers.add(step.output);
  }
  assert.ok(links>0,label+" lacks data dependencies");
  assert.ok(producers.size>0,label+" lacks producers");
 }
});
test("React Flow shows editable numeric ports, Gloria examples and discoverable builder",()=>{
 const flow=read("components/effects/MicroEffectFlowEditor.tsx");
 const builder=read("components/effects/MicroEffectBuilder.tsx");
 const gallery=read("app/management/effects/legacy-shadows/page.tsx");
 const modulePage=read("app/management/effects/modules/page.tsx");
 for(const name of ["CALCULATE","STORE","MODIFIER","BONUS","HEAL","DAMAGE","VARIABLE_RESISTANCE"]){
  assert.ok(flow.includes(name),name);
 }
 assert.match(flow,/onConnect/);
 assert.match(flow,/referencedOutputs/);
 assert.match(builder,/Conectar/);
 assert.match(builder,/CALCULATE/);
 assert.match(gallery,/Ver las habilidades de Gloria/);
 assert.match(gallery,/GLORIA_MICRO_PRESETS/);
 assert.match(gallery,/\/management\/effects\/modules/);
 assert.match(modulePage,/URLSearchParams\(window.location.search\)/);
});
