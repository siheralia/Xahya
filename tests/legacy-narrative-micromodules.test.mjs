import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  cloneLegacySkillAsMicro,calculateModularVariableResistance
} from "../lib/effects/legacy-modular-shadow.ts";
import {executeMicroEvent,emptyMicroState,validateEffectContainers} from "../lib/effects/micro-modules.ts";
import {calculateVariableResistance,DEFAULT_VARIABLE_RESISTANCE} from "../lib/skills/variable-resistance.ts";
const snapshot=JSON.parse(readFileSync(new URL("./fixtures/legacy-modular-shadow-2026-11-04.json",import.meta.url),"utf8"));
const resistanceActors=(userDefense,opponentSpeed,userSpeed=12,opponentDefense=41)=>({
 user:{stats:{HP:100,MAX_HP:100,magicDefense:userDefense},inputs:{ATTACK_SPEED:userSpeed}},
 opponent:{stats:{HP:100,MAX_HP:100,magicDefense:opponentDefense},inputs:{ATTACK_SPEED:opponentSpeed}},
});
const pending=[
 ["genericSkillTemplate",3],["genericSkillTemplate",4],["genericSkillTemplate",7],
 ["genericSkillTemplate",8],["genericSkillTemplate",9],["genericSkillTemplate",11],
 ["genericSkillTemplate",14],["genericSkillTemplate",17],["genericSkillTemplate",18],
 ["genericSkillTemplate",19],["genericSkillTemplate",20],
 ["raceSkill",15],["raceSkill",16],["raceSkill",18],
 ["skill",7],["skill",15],
];
test("all sixteen previously uncovered skills now carry explicit typed capability modules",()=>{
 assert.equal(pending.length,16);
 for(const [source,id] of pending){
   const definition=snapshot.definitions.find(d=>d.source===source&&d.id===id);
   assert.ok(definition,source+":"+id);
   const shadow=cloneLegacySkillAsMicro({...definition,name:"Skill "+id},source);
   assert.equal(shadow.represented,true,source+":"+id);
   assert.equal(shadow.parts.length,definition.effect.length);
   const modules=shadow.parts.flatMap(p=>p.modules);
   assert.ok(modules.length>0,source+":"+id);
   assert.equal(validateEffectContainers(modules),null);
   for(const effect of definition.effect.filter(e=>e.type==="NARRATIVE")){
     const caps=modules.flatMap(module=>module.steps).filter(step=>step.kind==="CAPABILITY");
     assert.ok(caps.some(step=>step.code===
       (effect.target?.startsWith("CARD:W")?effect.target:"NARRATIVE:OTHER")),source+":"+id);
   }
 }
});
test("capability descriptors are inert: no fabricated healing, automatic evasion or damage",()=>{
 const effects=[
   {type:"NARRATIVE",target:"CARD:W062",value:1,description:"Detiene sangrado narrativo"},
   {type:"NARRATIVE",target:"CARD:W040",value:1,description:"Mantener apoyo"},
   {type:"NARRATIVE",target:"OTHER",element:"EARTH",value:1,description:"Vibraciones"},
 ];
 const shadow=cloneLegacySkillAsMicro({id:600,name:"Declarative",effect:effects});
 assert.equal(shadow.represented,true);
 assert.equal(shadow.coverage,"UNSUPPORTED");
 const modules=shadow.parts.flatMap(p=>p.modules);
 const result=executeMicroEvent(emptyMicroState(),modules,{
  ownerId:1,eventId:"Narrative1",trigger:"PASSIVE",stats:{HP:30,MAX_HP:100}
 });
 assert.equal(result.hp,30);
 assert.ok(result.intents.every(intent=>intent.kind==="CAPABILITY"));
 assert.deepEqual(result.intents.map(i=>i.code),["CARD:W062","CARD:W040","NARRATIVE:OTHER"]);
 assert.equal(result.intents[2].element,"EARTH");
});
test("equipment descriptions are represented but do not unconditionally double damage",()=>{
 const shadow=cloneLegacySkillAsMicro({
  id:7,name:"Espada de acero",category:"UTILITY",
  effect:[
   {type:"NARRATIVE",target:"CARD:W002",value:1,description:"Forjar sustancia"},
   {type:"NARRATIVE",target:"CARD:W003",value:1,description:"Moldear metal"},
   {type:"NARRATIVE",target:"OTHER",value:1,description:"Otorga 2x daño cuando la porte"}
  ]
 });
 assert.equal(shadow.represented,true);
 assert.equal(shadow.coverage,"UNSUPPORTED");
 assert.equal(shadow.parts.flatMap(p=>p.modules).flatMap(m=>m.steps).filter(s=>s.kind==="MODIFIER").length,0);
});
test("Sikatā progressive resistance matches old numeric formula across attack speeds",()=>{
 const c=DEFAULT_VARIABLE_RESISTANCE;
 for(const speed of [0,10,25,50,100,1000]){
  const expected=calculateVariableResistance(c,90,speed);
  const actual=calculateModularVariableResistance(c,resistanceActors(90,speed));
  assert.deepEqual(actual,{multiplier:expected.multiplier,resistance:expected.resistance});
  assert.equal(actual.resistance,90*(1+2*speed*speed/(speed*speed+2500)));
 }
 assert.throws(()=>calculateModularVariableResistance(c,resistanceActors(90,-1)),/actor configurado/);
});
test("non Newtonian passive shadow carries contextual resistance and doesn't grant permanent defense",()=>{
 const config={...DEFAULT_VARIABLE_RESISTANCE};
 const legacy=cloneLegacySkillAsMicro({
  id:15,name:"Resistencia no newtoniana",category:"PASSIVE",
  mechanics:{family:"SIKATA",parentSkillId:14,variableResistance:config,
    activationConditions:[{kind:"SKILL_ACTIVE",skillId:14}]},
  effect:[{type:"NARRATIVE",target:"CARD:W006",targetKind:"EXISTING_OBJECT",value:1,
   description:"Endurecer materia",targetReference:"Arena de Sikatā"}]
 });
 assert.equal(legacy.represented,true);
 assert.equal(legacy.coverage,"COMPLETE");
 const steps=legacy.parts[0].modules[0].steps;
 assert.deepEqual(steps.map(step=>step.kind),["CAPABILITY","VARIABLE_RESISTANCE"]);
 const effect=legacy.parts[0].modules[0];
 assert.throws(()=>executeMicroEvent(emptyMicroState(),[effect],{
  ownerId:1,eventId:"NoSpeed",trigger:"PASSIVE",stats:{HP:100,MAX_HP:100,magicDefense:90}
 }),/actor configurado/);
 const result=executeMicroEvent(emptyMicroState(),[effect],{
  ownerId:1,eventId:"WithSpeed",trigger:"PASSIVE",
  stats:{HP:100,MAX_HP:100,magicDefense:90},
  opponentStats:{HP:100,MAX_HP:100,magicDefense:41},
  inputByOwner:{USER:{ATTACK_SPEED:12},OPPONENT:{ATTACK_SPEED:50}}
 });
 assert.equal(result.intents[1].kind,"VARIABLE_RESISTANCE");
 assert.equal(result.intents[1].resistance,180);
 assert.equal(result.hp,100);
});
test("combat construction defense derives its dynamic value from micro interpreter only",()=>{
 const source=readFileSync(new URL("../lib/combat/turn-engine.ts",import.meta.url),"utf8");
 assert.match(source,/calculateModularVariableResistance\(resistance,\{/);
 assert.doesNotMatch(source,/calculateVariableResistance\(resistance,base,input\)/);
 assert.match(source,/ATTACK_SPEED:effectiveCombatSpeed\(attacker\)/);
 const editor=readFileSync(new URL("../components/effects/MicroEffectBuilder.tsx",import.meta.url),"utf8");
 assert.match(editor,/VARIABLE_RESISTANCE/);
 assert.match(editor,/CAPABILITY/);
});

test("the configured actors determine both operands, never the unlabelled fighter",()=>{
 const c=DEFAULT_VARIABLE_RESISTANCE;
 const separate=resistanceActors(90,50,10,41);
 assert.equal(c.baseOwner,"USER");
 assert.equal(c.inputOwner,"OPPONENT");
 assert.equal(calculateModularVariableResistance(c,separate).resistance,180);
 // Changing the user speed must not alter the default result.
 assert.equal(calculateModularVariableResistance(c,resistanceActors(90,50,200,41)).resistance,180);
 // Changing only the opponent's speed must alter the result.
 assert.equal(calculateModularVariableResistance(c,resistanceActors(90,0,10,41)).resistance,90);
 const flipped=calculateModularVariableResistance({...c,baseOwner:"OPPONENT",inputOwner:"USER"},separate);
 assert.ok(Math.abs(flipped.resistance - 41*(1+2*100/(100+2500)))<1e-10);
 assert.notEqual(flipped.resistance,180);
 const originalShape={...c};delete originalShape.baseOwner;delete originalShape.inputOwner;
 assert.equal(calculateModularVariableResistance(originalShape,separate).resistance,180,
   "old persisted Sikatā configurations retain defender defense and attacker speed");
});
test("missing owner-specific opponent data fails closed, even if USER has a matching value",()=>{
 const c=DEFAULT_VARIABLE_RESISTANCE;
 const module={id:"VARIABLE_ACTORS",name:"Resistance",type:"PASSIVE",description:"",
  trigger:"PASSIVE",steps:[{kind:"VARIABLE_RESISTANCE",config:c}]};
 const base={eventId:"NoOppSpeed",ownerId:1,trigger:"PASSIVE",
   stats:{HP:100,MAX_HP:100,magicDefense:90},
   opponentStats:{HP:100,MAX_HP:100,magicDefense:41},
   inputByOwner:{USER:{ATTACK_SPEED:90}}};
 assert.throws(()=>executeMicroEvent(emptyMicroState(),[module],base),/actor configurado/);
 assert.throws(()=>calculateModularVariableResistance({...c,baseOwner:"OPPONENT"},{
   user:{stats:{magicDefense:90},inputs:{ATTACK_SPEED:10}},
   opponent:{stats:{},inputs:{ATTACK_SPEED:50}},
 }),/actor configurado/);
});
