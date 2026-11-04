import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {emptyMicroState,executeMicroEvent,validateEffectContainers,chargeCount,totalStored} from "../lib/effects/micro-modules.ts";
import {variableResistanceStatGraph,calculateModularVariableResistance} from "../lib/effects/legacy-modular-shadow.ts";
import {DEFAULT_VARIABLE_RESISTANCE} from "../lib/skills/variable-resistance.ts";

const c={...DEFAULT_VARIABLE_RESISTANCE};
const ctx=(eventId,other={})=>({
  eventId,ownerId:17,trigger:"PASSIVE",
  stats:{HP:80,MAX_HP:100,magicDefense:999,ATTACK_SPEED:1},
  actors:{USER:{magicDefense:90,ATTACK_SPEED:10},OPPONENT:{ATTACK_SPEED:50,magicDefense:500}},
  ...other
});
const effect=(id,steps,trigger="PASSIVE")=>({
 id,name:id,type:"PASSIVE",description:"",trigger,steps
});
const resistance=(base,input,config=c)=>({
 kind:"VARIABLE_RESISTANCE",config,base:{source:"OUTPUT",key:base},input:{source:"OUTPUT",key:input}
});
test("Sikatā wire graph explicitly reads USER.magicDefense and OPPONENT.ATTACK_SPEED",()=>{
 const steps=variableResistanceStatGraph(c);
 assert.deepEqual(steps.map(s=>s.kind),["READ_STAT","READ_STAT","VARIABLE_RESISTANCE"]);
 assert.deepEqual(steps.slice(0,2).map(s=>({actor:s.actor,stat:s.stat,output:s.output})),[
  {actor:"USER",stat:"magicDefense",output:"resistanceBase"},
  {actor:"OPPONENT",stat:"ATTACK_SPEED",output:"resistanceInput"}
 ]);
 const result=executeMicroEvent(emptyMicroState(),[effect("Sikata",steps)],ctx("S1"));
 assert.equal(result.intents.length,1);
 assert.deepEqual(result.intents[0],{
  kind:"VARIABLE_RESISTANCE",stat:"magicDefense",input:"ATTACK_SPEED",
  multiplier:2,resistance:180
 });
 assert.equal(calculateModularVariableResistance(c,90,50).resistance,180);
 assert.equal(result.hp,80);
});
test("changing the owner of either connector changes the inputs, not the formula",()=>{
 const other=[
  {kind:"READ_STAT",actor:"OPPONENT",stat:"magicDefense",output:"b"},
  {kind:"READ_STAT",actor:"USER",stat:"ATTACK_SPEED",output:"v"},
  resistance("b","v"),
 ];
 const x=executeMicroEvent(emptyMicroState(),[effect("OtherActors",other)],ctx("S2"));
 const expected=500*(1+2*10*10/(10*10+2500));
 assert.ok(Math.abs(x.intents[0].resistance-expected)<1e-8);
 assert.notEqual(x.intents[0].resistance,180);
});
test("stored total and count can be wired to resistance without consuming any charges",()=>{
 const store=effect("Store",[{
  kind:"STORE",accumulator:"DIVINE_GRACE",capacity:5,value:{source:"EVENT",key:"MITIGATED_DAMAGE"}
 }],"DAMAGE_RESOLVED");
 let state=emptyMicroState();
 for(const [id,damage] of [["E1",20],["E2",30]]){
  const result=executeMicroEvent(state,[store],ctx(id,{trigger:"DAMAGE_RESOLVED",
   event:{MITIGATED_DAMAGE:damage}}));
  state=result.state;
 }
 assert.equal(chargeCount(state,17,"DIVINE_GRACE"),2);
 assert.equal(totalStored(state,17,"DIVINE_GRACE"),50);
 const steps=[
  {kind:"READ_STAT",actor:"USER",stat:"magicDefense",output:"defense"},
  {kind:"READ_STORED",accumulator:"DIVINE_GRACE",metric:"TOTAL",output:"energy"},
  resistance("defense","energy"),
 ];
 const r=executeMicroEvent(state,[effect("StoredInput",steps)],ctx("S3"));
 assert.equal(r.intents[0].resistance,180);
 assert.equal(chargeCount(r.state,17,"DIVINE_GRACE"),2,"a read must never spend charges");
 assert.equal(totalStored(r.state,17,"DIVINE_GRACE"),50);
 const hits={...c,formula:"HITS",input:"HIT_COUNT",coefficient:0.1,maxMultiplier:2};
 const alternative=[
  {kind:"READ_STAT",actor:"USER",stat:"magicDefense",output:"base"},
  {kind:"READ_STORED",accumulator:"DIVINE_GRACE",metric:"COUNT",output:"hits"},
  resistance("base","hits",hits),
 ];
 const h=executeMicroEvent(state,[effect("CountInput",alternative)],ctx("S4"));
 assert.ok(Math.abs(h.intents[0].resistance-108)<1e-9);
});
test("graph wiring rejects missing, duplicate or forward OUTPUT connections",()=>{
 const valid=variableResistanceStatGraph(c);
 assert.equal(validateEffectContainers([effect("OK",valid)]),null);
 const forward=[valid[2],valid[0],valid[1]];
 assert.match(validateEffectContainers([effect("Forward",forward)]),/productor anterior/);
 const missing=[valid[0],valid[2]];
 assert.match(validateEffectContainers([effect("Missing",missing)]),/productor anterior/);
 const duplicate=[valid[0],valid[0]];
 assert.match(validateEffectContainers([effect("Duplicate",duplicate)]),/lectura de estadística inválida/);
});
test("opponent data is mandatory and cannot be substituted by the user's stat",()=>{
 const steps=variableResistanceStatGraph(c);
 assert.throws(()=>executeMicroEvent(emptyMicroState(),[effect("Protected",steps)],
  ctx("S5",{actors:{USER:{magicDefense:90,ATTACK_SPEED:500}}})),
  /estadística no disponible: OPPONENT:ATTACK_SPEED/);
 assert.throws(()=>executeMicroEvent(emptyMicroState(),[effect("Protected",steps)],
  ctx("S6",{actors:{USER:{magicDefense:90},OPPONENT:{}}})),
  /estadística no disponible: OPPONENT:ATTACK_SPEED/);
});
test("role wiring is offered in the visual editor and combat supplies server-derived inputs",()=>{
 const editor=readFileSync(new URL("../components/effects/MicroEffectBuilder.tsx",import.meta.url),"utf8");
 const combat=readFileSync(new URL("../lib/combat/turn-engine.ts",import.meta.url),"utf8");
 assert.match(editor,/READ_STAT/);
 assert.match(editor,/READ_STORED/);
 assert.match(editor,/OPPONENT/);
 assert.match(editor,/outputOptions=\{availableOutputs\}/);
 assert.match(editor,/Resistencia con fuentes conectadas/);
 assert.match(combat,/effectiveCombatSpeed\(attacker\)/);
 assert.match(combat,/calculateModularVariableResistance\(resistance,base,input\)/);
});
