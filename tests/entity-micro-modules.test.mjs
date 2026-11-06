import test from "node:test";
import assert from "node:assert/strict";
import {emptyMicroState,executeMicroEvent,validateEffectContainers} from "../lib/effects/micro-modules.ts";
import {pricedModularStepCount} from "../lib/skills/composed-effects.ts";

const ref=(key)=>({source:"OUTPUT",key});
const effect=(trigger,steps)=>({id:"ENTITY_TEST",name:"Entidades",type:"COMPOSED",
  description:"Prueba general sin nombres de habilidades",trigger,steps});
const context=(more={})=>({eventId:"EVENT_ONE",ownerId:7,trigger:"ACTIVATE",
  stats:{HP:90,MAX_HP:100,PHYSICAL_ATTACK:100,AGI:20,PHYSICAL_DEFENSE:40},...more});

test("generic summon, live stat links and configurable autonomous behavior emit priced requests",()=>{
  const module=effect("ACTIVATE",[
    {kind:"SUMMON_ENTITY",entityKey:"FAMILIAR",label:"Familiar",manaCost:30,
      maintenanceMana:20,durationTurns:2,controlRangeMeters:15,hitLimit:3},
    {kind:"LINK_ENTITY_STAT",entityKey:"FAMILIAR",sourceStat:"PHYSICAL_ATTACK",
      destStat:"PHYSICAL_ATTACK",factor:0.2},
    {kind:"LINK_ENTITY_STAT",entityKey:"FAMILIAR",sourceStat:"PHYSICAL_DEFENSE",
      destStat:"INTEGRITY",factor:2},
    {kind:"LINK_ENTITY_STAT",entityKey:"FAMILIAR",sourceStat:"AGI",destStat:"AGI",factor:1},
    {kind:"SET_ENTITY_BEHAVIOR",entityKey:"FAMILIAR",mode:"FOLLOW",
      allowedModes:["FOLLOW","ATTACK","MANUAL"],target:"USER",trigger:"CONTACT"},
  ]);
  assert.equal(validateEffectContainers([module]),null);
  assert.equal(pricedModularStepCount(module),5);
  const result=executeMicroEvent(emptyMicroState(),[module],context());
  assert.equal(result.intents.length,5);
  assert.deepEqual(result.intents[0],{kind:"SUMMON_ENTITY",ownerId:7,entityKey:"FAMILIAR",
    label:"Familiar",manaCost:30,maintenanceMana:20,durationTurns:2,controlRangeMeters:15,hitLimit:3});
  assert.deepEqual(result.intents.slice(1,4).map(i=>i.value),[20,80,20]);
  assert.deepEqual(result.intents[4].allowedModes,["FOLLOW","ATTACK","MANUAL"]);
  assert.equal(executeMicroEvent(result.state,[module],context()).skipped,true,
    "the same event cannot summon twice on a retry");
});

test("real HP damage gates an attacker-selected stat status after mitigation",()=>{
  const steps=[
    {kind:"SELECT_TARGET",selector:"OPPONENT",output:"victim"},
    {kind:"READ_HP_DAMAGE",output:"lostHp"},
    {kind:"SELECT_STAT",mode:"COMBAT",allowed:["STR","AGI","DODGE"],output:"chosen"},
    {kind:"APPLY_STATUS",target:ref("victim"),stat:{source:"STAT_SELECTION",key:"chosen"},
      operation:"MULTIPLIER",value:0.5,durationTurns:2,
      when:[{left:ref("lostHp"),compare:"GT",right:0}]},
  ];
  const module=effect("DAMAGE_RESOLVED",steps);
  assert.equal(validateEffectContainers([module]),null);
  assert.equal(pricedModularStepCount(module),1);
  const base=context({trigger:"DAMAGE_RESOLVED",event:{HP_DAMAGE:8},
    targetIds:{OPPONENT:11},selectedStats:{chosen:"AGI"}});
  assert.deepEqual(executeMicroEvent(emptyMicroState(),[module],base).intents,[
    {kind:"APPLY_STATUS",targetId:11,stat:"AGI",operation:"MULTIPLIER",value:0.5,durationTurns:2}]);
  assert.deepEqual(executeMicroEvent(emptyMicroState(),[module],{
    ...base,event:{HP_DAMAGE:0}}).intents,[]);
  assert.throws(()=>executeMicroEvent(emptyMicroState(),[module],{
    ...base,selectedStats:{chosen:"RESISTANCE"}}),/estadística no elegida/);
  assert.throws(()=>executeMicroEvent(emptyMicroState(),[module],{
    ...base,targetIds:{OPPONENT:0}}),/objetivo autorizado/);
  assert.throws(()=>executeMicroEvent(emptyMicroState(),[module],{
    ...base,selectedStats:{}}),/estadística no elegida/);
});

test("contact with owner allows self-debuff; missing contact cannot produce a status",()=>{
  const module=effect("ACTIVATE",[
    {kind:"SELECT_TARGET",selector:"USER",output:"self"},
    {kind:"REQUIRE_CONTACT",target:ref("self")},
    {kind:"APPLY_STATUS",target:ref("self"),stat:"DODGE",
      operation:"BONUS",value:-20,durationTurns:2}
  ]);
  assert.equal(validateEffectContainers([module]),null);
  assert.deepEqual(executeMicroEvent(emptyMicroState(),[module],
    context({contactTargetIds:[7]})).intents,[
      {kind:"APPLY_STATUS",targetId:7,stat:"DODGE",operation:"BONUS",value:-20,durationTurns:2}]);
  assert.deepEqual(executeMicroEvent(emptyMicroState(),[module],
    context({contactTargetIds:[99]})).intents,[]);
});

test("inversion only targets authorized active debuffs; charge is not granted prematurely",()=>{
  const module=effect("ACTIVATE",[
    {kind:"SELECT_TARGET",selector:"USER",output:"self"},
    {kind:"READ_STATUSES",target:ref("self"),filter:"DEBUFF",output:"debuffCount"},
    {kind:"INVERT_STATUS",target:ref("self"),selection:"LATEST_DEBUFF",
      manaCost:10,chargeAccumulator:"LUNAR_CHARGES",
      when:[{left:ref("debuffCount"),compare:"GTE",right:1}]}
  ]);
  assert.equal(validateEffectContainers([module]),null);
  const statuses=[
    {id:"buff",targetId:7,stat:"AGI",multiplier:1.3,durationTurns:2},
    {id:"weakened",targetId:7,stat:"STR",multiplier:0.7,durationTurns:2},
    {id:"enemy",targetId:9,stat:"AGI",bonus:-20,durationTurns:2},
  ];
  const out=executeMicroEvent(emptyMicroState(),[module],context({statuses}));
  assert.deepEqual(out.intents,[{kind:"INVERT_STATUS",targetId:7,statusId:"weakened",
    manaCost:10,chargeAccumulator:"LUNAR_CHARGES"}]);
  assert.deepEqual(out.state.accumulators,{},"only the combat adapter may award lunar charges after payment");
  assert.deepEqual(executeMicroEvent(emptyMicroState(),[module],context({
    statuses:statuses.filter(s=>s.id!=="weakened")})).intents,[]);
});

test("typed output provenance rejects target and stat strings as math inputs",()=>{
  const badTarget=effect("ACTIVATE",[
    {kind:"SELECT_TARGET",selector:"USER",output:"target"},
    {kind:"CALCULATE",expression:ref("target"),output:"badNumber"}
  ]);
  assert.match(validateEffectContainers([badTarget]),/salida de objeto no puede usarse como una cantidad numérica/);
  const badStat=effect("ACTIVATE",[
    {kind:"SELECT_STAT",mode:"FIXED",allowed:["STR"],fixed:"STR",output:"attribute"},
    {kind:"CALCULATE",expression:ref("attribute"),output:"badNumber"}
  ]);
  assert.match(validateEffectContainers([badStat]),/salida de objeto no puede usarse como una cantidad numérica/);
  const badStatus=effect("ACTIVATE",[
    {kind:"SELECT_STAT",mode:"FIXED",allowed:["STR"],fixed:"STR",output:"attribute"},
    {kind:"APPLY_STATUS",target:ref("attribute"),stat:"STR",
      operation:"MULTIPLIER",value:0.7,durationTurns:2}
  ]);
  assert.match(validateEffectContainers([badStatus]),/estado sin objetivo/);
});

test("selection contracts reject invalid options, wrong triggers and unapproved behaviors",()=>{
  assert.match(validateEffectContainers([effect("ACTIVATE",[
    {kind:"READ_HP_DAMAGE",output:"hpDamage"}])]),/requiere un evento/);
  assert.match(validateEffectContainers([effect("ACTIVATE",[
    {kind:"SELECT_STAT",mode:"RANDOM",allowed:["STR","STR"],output:"choice"}])]),/selección de estadística/);
  assert.match(validateEffectContainers([effect("ACTIVATE",[
    {kind:"SET_ENTITY_BEHAVIOR",entityKey:"FAMILIAR",mode:"ATTACK",
      allowedModes:["FOLLOW"],target:"USER",trigger:"CONTACT"}])]),/comportamiento/);
  assert.match(validateEffectContainers([effect("ACTIVATE",[
    {kind:"SUMMON_ENTITY",entityKey:"FAMILIAR",label:"Mascota",manaCost:-1,
      maintenanceMana:0,durationTurns:2,controlRangeMeters:15,hitLimit:3}])]),/invocación inválida/);
});
