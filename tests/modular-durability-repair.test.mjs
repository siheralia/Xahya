import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 validateEffectContainers,executeMicroEvent,emptyMicroState,
} from "../lib/effects/micro-modules.ts";
import {calculateDurabilityRepair,validateRepairableItem,REPAIR_TARGET_SELECTORS} from "../lib/effects/repair-durability.ts";
import {pricedModularStepCount,validateComposedSkillEffect} from "../lib/skills/composed-effects.ts";

const out=key=>({source:"OUTPUT",key});
const effect=(steps,trigger="ACTIVATE")=>({id:"REPAIR_WIRED",name:"Forja reparadora",
 type:"COMPOSED",description:"Repara la copia elegida",trigger,steps});
const read=(selector="SELECTED_ITEM",output="selectedItem")=>
 ({kind:"READ_ITEM",selector,output});
const restore=(target="selectedItem",amount=10)=>
 ({kind:"REPAIR_DURABILITY",target:out(target),amount});
const ctx=(more={})=>({
 eventId:"RepairRequest0001",ownerId:99,trigger:"ACTIVATE",
 stats:{HP:60,MAX_HP:100,magicDefense:50,STR:40},
 itemTargets:[{characterItemId:701,durability:70},{characterItemId:702,durability:89}],
 itemSelectors:{SELECTED_ITEM:701,OWNER_MAIN_HAND:702,SOURCE_ITEM:701},
 ...more
});

test("micro-module has true two-port connection: item identity and amount from earlier nodes",()=>{
 const module=effect([
  read(),{kind:"READ_STAT",actor:"USER",stat:"magicDefense",output:"power"},
  {kind:"CALCULATE",output:"repairAmount",
   expression:{operator:"MULTIPLY",args:[out("power"),0.6]}},
  restore("selectedItem",out("repairAmount")),
 ]);
 assert.equal(validateEffectContainers([module]),null);
 const first=executeMicroEvent(emptyMicroState(),[module],ctx());
 assert.deepEqual(first.intents,[{
  kind:"REPAIR_DURABILITY",characterItemId:701,requested:30,applied:30,before:70,after:100,
 }]);
 assert.equal(first.hp,60,"restoring item integrity must not touch HP");
 const second=executeMicroEvent(first.state,[module],ctx());
 assert.equal(second.skipped,true);
 assert.deepEqual(second.intents,[],"replaying the same activation never grants a second repair");
 assert.equal(ctx().itemTargets[0].durability,70,"the interpreter never writes the inventory");
});

test("the same approved graph targets a different owned item by changing the server binding",()=>{
 const module=effect([read(),restore("selectedItem",25)]);
 const a=executeMicroEvent(emptyMicroState(),[module],ctx()).intents[0];
 const b=executeMicroEvent(emptyMicroState(),[module],ctx({
  itemSelectors:{SELECTED_ITEM:702},
 })).intents[0];
 assert.deepEqual([a.characterItemId,a.applied,a.after],[701,25,95]);
 assert.deepEqual([b.characterItemId,b.applied,b.after],[702,11,100]);
 assert.equal(validateEffectContainers([module]),null);
});

test("self-repair can be expressed with SOURCE_ITEM and a paid periodic trigger",()=>{
 const module=effect([
  read("SOURCE_ITEM","self"),{kind:"CALCULATE",output:"regeneration",
   expression:{operator:"DIVIDE",args:[{source:"STAT",key:"STR"},4]}},
  restore("self",out("regeneration")),
 ],"TURN_START");
 const result=executeMicroEvent(emptyMicroState(),[module],ctx({
  eventId:"TurnStart42",trigger:"TURN_START",
 }));
 assert.equal(result.intents[0].characterItemId,701);
 assert.equal(result.intents[0].applied,10);
 assert.equal(result.intents[0].after,80);
 assert.equal(executeMicroEvent(result.state,[module],ctx({
  eventId:"TurnStart42",trigger:"TURN_START",
 })).skipped,true);
});

test("multiple repairs cannot restore the same item beyond 100 within one activation",()=>{
 const module=effect([read(),restore("selectedItem",20),restore("selectedItem",20)]);
 const result=executeMicroEvent(emptyMicroState(),[module],ctx({
  itemTargets:[{characterItemId:701,durability:65}],
 }));
 assert.deepEqual(result.intents.map(i=>[i.before,i.applied,i.after]),
  [[65,20,85],[85,15,100]]);
 assert.equal(result.intents.reduce((sum,i)=>sum+i.applied,0),35);
});

test("durability is always integer 0..100, never a stack multiplier or an HP heal",()=>{
 assert.deepEqual(calculateDurabilityRepair({characterItemId:77,durability:99},17.8),
  {characterItemId:77,requested:17,applied:1,before:99,after:100});
 assert.equal(calculateDurabilityRepair({characterItemId:77,durability:100},100).applied,0);
 assert.equal(calculateDurabilityRepair({characterItemId:77,durability:65},0).applied,0);
 for(const amount of [-1,NaN,Infinity,1_000_001]){
  assert.throws(()=>calculateDurabilityRepair({characterItemId:77,durability:40},amount),/Cantidad/);
 }
 for(const bad of [-1,101,1.5,NaN,Infinity]){
  assert.throws(()=>validateRepairableItem({characterItemId:77,durability:bad}),/inválidos/);
 }
 assert.throws(()=>validateRepairableItem({characterItemId:0,durability:50}),/inválidos/);
});

test("repair never accepts an arbitrary numeric value as an item reference",()=>{
 for(const bad of [
  effect([restore("unconnected",10)]),
  effect([{kind:"CALCULATE",output:"fakeId",expression:701},restore("fakeId",10)]),
  effect([read(),{kind:"CALCULATE",output:"fakeId",expression:out("selectedItem")},restore("selectedItem",10)]),
  effect([read(),{kind:"HEAL",amount:out("selectedItem")}]),
  effect([read("SELECTED_ITEM","same"),read("SOURCE_ITEM","same"),restore("same",10)]),
  effect([read("NOT_A_SLOT"),restore()]),
  effect([read(),restore("selectedItem",out("selectedItem"))]),
 ]){
  assert.match(validateEffectContainers([bad]),/objeto|conexión|salida|duplicad|selector/,
   JSON.stringify(bad.steps));
 }
 const resolved=effect([read(),restore()]);
 assert.throws(()=>executeMicroEvent(emptyMicroState(),[resolved],ctx({
  itemSelectors:{SELECTED_ITEM:333},
 })),/autorizado/);
 assert.throws(()=>executeMicroEvent(emptyMicroState(),[resolved],ctx({
  itemTargets:[{characterItemId:701,durability:99},{characterItemId:701,durability:20}],
 })),/ambiguo/);
 assert.throws(()=>executeMicroEvent(emptyMicroState(),[resolved],ctx({
  itemTargets:[{characterItemId:701,durability:-9}],
 })),/inválida/);
});

test("repair only uses the explicit item list and a server-bound selector",()=>{
 const module=effect([read("OWNER_MAIN_HAND","owned"),restore("owned",4)]);
 assert.equal(validateEffectContainers([module]),null);
 const result=executeMicroEvent(emptyMicroState(),[module],ctx());
 assert.equal(result.intents[0].characterItemId,702);
 assert.equal(result.intents[0].after,93);
 assert.throws(()=>executeMicroEvent(emptyMicroState(),[module],ctx({
  itemSelectors:{OWNER_MAIN_HAND:999},
 })),/autorizado/);
 assert.throws(()=>executeMicroEvent(emptyMicroState(),[module],ctx({
  itemSelectors:{},
 })),/autorizado/);
 assert.deepEqual([...REPAIR_TARGET_SELECTORS],
  ["OWNER_MAIN_HAND","OWNER_OFF_HAND","SELECTED_ITEM","SOURCE_ITEM"]);
});

test("item selectors are free typed connectors, but an actual repair is priced",()=>{
 const module=effect([read(),{kind:"CALCULATE",output:"qty",expression:15},
  restore("selectedItem",out("qty"))]);
 assert.equal(pricedModularStepCount(module),1);
 assert.equal(validateComposedSkillEffect({type:"COMPOSED",module},"PLAYER"),null);
 assert.equal(validateComposedSkillEffect({type:"COMPOSED",module,reviewedPch:5},"REVIEW"),null);
});

test("React Flow, the builder, and Spanish help expose the item and amount sockets",()=>{
 const src=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
 const flow=src("components/effects/MicroEffectFlowEditor.tsx");
 const builder=src("components/effects/MicroEffectBuilder.tsx");
 const labels=src("lib/effects/micro-labels.ts");
 assert.match(flow,/case "REPAIR_DURABILITY"/);
 assert.match(flow,/id:"target",label:"Objeto"/);
 assert.match(flow,/id:"amount",label:"Cantidad"/);
 assert.match(flow,/describeConnection\(indexOfNode\(link\.source\)/);
 assert.match(flow,/REPAIR_DURABILITY"&&port\.id==="target"\?"ITEM"/);
 const feedback=src("lib/effects/micro-connection-feedback.ts");
 assert.match(feedback,/choice\.sourceKind!==port\.kind/);
 assert.match(builder,/REPAIR_TARGET_SELECTORS/);
 assert.match(builder,/availableItemOutputs/);
 assert.match(builder,/Reparación con objetivo y cantidad conectados/);
 assert.match(labels,/REPAIR_DURABILITY:"Restaurar durabilidad"/);
 assert.match(labels,/SOURCE_ITEM:"Objeto que contiene el efecto"/);
});
