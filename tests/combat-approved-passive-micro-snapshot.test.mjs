import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {approvedPassiveMicroSnapshot,compileApprovedPassiveMicro}
 from "../lib/combat/approved-passive-micro.ts";
import {newCombatState,installEncounterMicroEffects,applyCombatCommand,canAct}
 from "../lib/combat/turn-engine.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";

const condition=(key,compare,value)=>[{
 left:{source:"CHARGES",key},compare,right:value
}];
const moduleRow=(id,trigger,steps)=>({
 type:"COMPOSED",reviewedPch:10,
 module:{id,name:id,type:"PASSIVE",description:"Efecto aprobado de ejemplo",
  trigger,steps},
});
const parts=(key="ECHO")=>[
 moduleRow("echo-save","DAMAGE_RESOLVED",[{
  kind:"STORE",accumulator:key,capacity:5,
  value:{source:"EVENT",key:"MITIGATED_DAMAGE"},
 }]),
 moduleRow("echo-resist","PASSIVE",[{
  kind:"MODIFIER",stat:"RESISTANCE",multiplier:1.3,
  when:condition(key,"EQ",0),
 }]),
 moduleRow("echo-recover","TURN_START",[{
  kind:"HEAL",amount:{operator:"PERCENT",args:[{source:"STAT",key:"MAX_HP"},10]},
  when:condition(key,"GTE",1),
 }]),
];
const approved=(id=71,other={})=>({
 id,characterId:22,status:"APPROVED",approvedAt:"2026-11-09T00:00:00.000Z",
 category:"PASSIVE",name:"Piel resonante",cost:0,maintenanceCost:0,
 accumulationCost:0,accumulationPerTick:0,pchCost:38,
 mechanics:{},condition:"",effectRequirements:[],effect:parts(),
 ...other,
});
const allowed=(rows,states=[],stolen=new Set(),characterId=22)=>
 approvedPassiveMicroSnapshot(characterId,rows,states,stolen);
const fighter=(name,characterId,positionMeters)=>({
 characterId,name,hp:100,maxHp:100,agility:60,speedValue:80,
 strength:20,constitution:10,precision:80,dodge:15,
 physicalAttack:50,physicalDefense:20,magicAttack:20,magicDefense:20,
 critical:0,luck:10,race:20,massKg:70,positionMeters,attackType:"BLUNT",
 defenseType:"SOLID",weaponIntegrity:100,spentTicks:0,spentAp:0,
 equippedWeapon:{name:"Maza",mode:"MELEE",attackType:"BLUNT",
  effectiveRangeMeters:2,maximumRangeMeters:2},
});
const duel=()=>newCombatState(fighter("Atacante",11,0),fighter("Defensora",22,1.5));
const dice={hit:.01,critical:.99,defense:.99};
const hit=s=>applyCombatCommand(
 applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"BLUNT",
  attackSource:"MAIN_HAND",trajectory:[{x:.1,y:.5},{x:.5,y:.5}]},dice),
 "NPC",{kind:"DEFEND",defense:"NONE"},dice
);
const nextRound=previous=>{
 let s=previous;const wanted=s.round+1;
 for(let i=0;i<20&&s.round<wanted;i++){
  const acting=canAct(s,"PLAYER")?"PLAYER":canAct(s,"NPC")?"NPC":null;
  assert.ok(acting,"an authorized action advances the simulation");
  s=applyCombatCommand(s,acting,{kind:"WAIT"},dice);
 }
 assert.equal(s.round,wanted);
 return s;
};

test("staff-priced approved passive is compiled into a namespaced, bounded event recipe",()=>{
 const source=approved();
 const before=structuredClone(source);
 const compiled=compileApprovedPassiveMicro(source);
 assert.ok(compiled);
 assert.deepEqual(compiled.map(x=>x.trigger),
  ["DAMAGE_RESOLVED","PASSIVE","TURN_START"]);
 assert.equal(compiled[0].steps[0].accumulator,"S71_CHARGE");
 assert.equal(compiled[1].steps[0].when[0].left.key,"S71_CHARGE");
 assert.equal(compiled[2].steps[0].when[0].left.key,"S71_CHARGE");
 assert.equal(compiled[2].steps[0].amount.args[1],10);
 assert.deepEqual(source,before,"approved Skill rows must never be mutated by compilation");
});

test("only approved, reviewed, PCH-paid passives may install modules",()=>{
 for(const modification of [
  {status:"PENDING"},{status:"REJECTED"},{approvedAt:null},
  {pchCost:0},{category:"SUPPORT"},{cost:2},{maintenanceCost:1},
  {accumulationCost:1},{accumulationPerTick:1},{condition:"En lluvia"},
  {mechanics:{rules:[{kind:"custom"}]}},{mechanics:{variableResistance:{}}},
  {effect:[...parts(),{type:"RESOURCE_BONUS",target:"HP",value:1}]},
  {effect:parts().map(e=>({...e,reviewedPch:undefined}))},
  {effect:parts().map(e=>({...e,reviewedPch:1}))},
 ]){
  assert.equal(compileApprovedPassiveMicro(approved(71,modification)),null,
   "invalid or unpriced graph must not be executable: "+JSON.stringify(modification));
 }
});

test("unapproved behavior is refused instead of granting free healing/damage",()=>{
 const scenarios=[
  parts().map(e=>e.module.trigger==="TURN_START"?{
   ...e,module:{...e.module,steps:[{kind:"HEAL",amount:999999}]}}:e),
  parts().map(e=>e.module.trigger==="PASSIVE"?{
   ...e,module:{...e.module,steps:[{kind:"MODIFIER",stat:"RESISTANCE",
    multiplier:3,when:condition("ECHO","EQ",0)}]}}:e),
  parts().map(e=>e.module.trigger==="DAMAGE_RESOLVED"?{
   ...e,module:{...e.module,steps:[{kind:"DAMAGE",amount:99,channel:"MAGICAL"}]}}:e),
  parts().map(e=>e.module.trigger==="TURN_START"?{
   ...e,module:{...e.module,steps:[{kind:"HEAL",amount:
    {operator:"PERCENT",args:[{source:"STAT",key:"MAX_HP"},20]},
    when:condition("ECHO","GTE",1)}]}}:e),
  parts().map(e=>e.module.trigger==="TURN_START"?{
   ...e,module:{...e.module,steps:[{kind:"HEAL",amount:
    {operator:"PERCENT",args:[{source:"STAT",key:"MAX_HP"},10]}}]}}:e),
 ];
 for(const effect of scenarios)assert.equal(
  compileApprovedPassiveMicro(approved(71,{effect})),null,
  "unsupported or unbounded behavior must remain inert");
});

test("ownership, theft, activation, prerequisites and parent dependencies filter passives",()=>{
 const valid=approved(),another=approved(72,{characterId:99});
 assert.deepEqual(allowed([valid,another]).skillIds,[71]);
 assert.deepEqual(allowed([valid],[],new Set([71])).skillIds,[]);
 assert.deepEqual(allowed([valid],[{characterId:22,skillId:71,active:false}]).skillIds,[]);
 assert.deepEqual(allowed([valid],[{characterId:22,skillId:71,active:true}]).skillIds,[71]);
 assert.deepEqual(allowed([valid],[{characterId:99,skillId:71,active:false}]).skillIds,[71],
  "another character cannot switch off this passive");
 assert.deepEqual(allowed([approved(71,{mechanics:{parentSkillId:80}})]).skillIds,[]);
 assert.deepEqual(allowed([
  approved(71,{effectRequirements:[{effect:"LIGHT"}]})
 ]).skillIds,[]);
 const paidReq={id:80,characterId:22,status:"APPROVED",effect:[{
  type:"LIGHT",value:1}],category:"SUPPORT"};
 assert.deepEqual(allowed([
  approved(71,{mechanics:{parentSkillId:80},
   effectRequirements:[{effect:"LIGHT"}]}),paidReq
 ]).skillIds,[71]);
});

test("different skill charge names never accidentally share a pool",()=>{
 const first=approved(71,{effect:parts().slice(0,2)});
 const second=approved(72,{effect:[parts()[0],parts()[2]]});
 const selected=allowed([first,second]);
 assert.deepEqual(selected.skillIds,[71,72]);
 const all=selected.definitions;
 assert.deepEqual(all.filter(x=>x.trigger==="DAMAGE_RESOLVED")
  .map(x=>x.steps[0].accumulator),["S71_CHARGE","S72_CHARGE"]);
 assert.equal(new Set(all.map(x=>x.id)).size,all.length);
});

test("a reviewed passive really runs against the combat resolver and survives JSON replay",()=>{
 const selected=allowed([approved()]);
 assert.deepEqual(selected.skillIds,[71]);
 const baseline=hit(duel());
 let equipped=installEncounterMicroEffects(duel(),"NPC",selected.definitions);
 let state=hit(equipped);
 assert.equal(baseline.actors.NPC.hp,55);
 assert.equal(state.actors.NPC.hp,59,
  "first hit receives paid 1.3x resistance before its charge is added");
 assert.deepEqual(state.microEffects.state.accumulators["2:S71_CHARGE"].charges,[19]);
 assert.equal(equipped.microEffects.state.processed.length,0);
 const publicState=combatClientView(state);
 assert.equal(publicState.microEffects,undefined,
  "private graph, charge amounts and processed IDs never go to the browser");
 state=JSON.parse(JSON.stringify(state));
 const startHp=state.actors.NPC.hp;
 state=nextRound(state);
 assert.equal(state.actors.NPC.hp,startHp+10);
 assert.deepEqual(state.microEffects.state.accumulators["2:S71_CHARGE"].charges,[19]);
 assert.equal(state.log.filter(e=>e.kind==="REGEN").length,1);
 assert.equal(nextRound(state).log.filter(e=>e.kind==="REGEN").length,2,
  "once per subsequent legal round, never once per frontend poll");
});

test("independently approved owners never mix their accumulated effects",()=>{
 const first=approved(71,{characterId:11});
 const second=approved(72,{characterId:22});
 const player=allowed([first],[],new Set(),11);
 const npc=allowed([second]);
 let s=installEncounterMicroEffects(duel(),"PLAYER",player.definitions);
 s=installEncounterMicroEffects(s,"NPC",npc.definitions);
 const after=hit(s);
 assert.deepEqual(after.microEffects.state.accumulators["2:S72_CHARGE"].charges,[19]);
 assert.equal(after.microEffects.state.accumulators["1:S71_CHARGE"],undefined);
});

test("real duel creation only reads paid skills from server; action routes cannot inject graphs",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const duelRoute=read("app/api/combat/duels/route.ts");
 const source=read("lib/combat/server-approved-micro.ts");
 const actions=read("app/api/combat/[id]/actions/route.ts");
 assert.match(duelRoute,/snapshotApprovedEncounterPassives\(initial\)/);
 assert.match(source,/Skill\.where\(\{characterId,status:"APPROVED"\}\)/);
 assert.match(source,/status='ACTIVE'/);
 assert.match(source,/readModularCutover\(\)/);
 assert.match(source,/mode==="LEGACY_ONLY"/);
 assert.match(source,/approvedPassiveMicroSnapshot\(characterId,rows,activations,stolenIds\)/);
 assert.match(source,/installEncounterMicroEffects\(state,side,selection\.definitions\)/);
 assert.doesNotMatch(actions,/installEncounterMicroEffects\(/);
 assert.doesNotMatch(actions,/approvedPassiveMicroSnapshot\(/);
});
