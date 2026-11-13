import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {newTimelineDeclarationSession,declareTimelineCommand}
 from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow} from "../lib/combat/timeline-basic-actions.ts";
import {simulateApprovedTimelineFusion}
 from "../lib/combat/timeline-fusion-world.ts";

const fighter=(name,id,x)=>({
 name,characterId:id,hp:300,maxHp:300,agility:100,speedValue:100,
 strength:50,constitution:18,precision:80,dodge:15,
 physicalAttack:80,physicalDefense:40,magicAttack:40,magicDefense:12,
 critical:0,luck:10,race:20,massKg:70,positionMeters:x,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,
});
const keys=["ORIGEN_A","ORIGEN_B"];
const module=steps=>({type:"COMPOSED",module:{
 id:"FUSION_SAFE",name:"Fusión segura",description:"",
 type:"COMPOSED",trigger:"ACTIVATE",steps,
}});
const steps=[
 {kind:"FUSE_SUMMONS",sourceEntityKeys:keys,entityKey:"FINAL",
  label:"Familiar superior",manaCost:25,maintenanceMana:5,
  durationTurns:3,controlRangeMeters:15,hitLimit:3},
 {kind:"LINK_ENTITY_STAT",entityKey:"FINAL",
  sourceStat:"PHYSICAL_ATTACK",destStat:"PHYSICAL_ATTACK",factor:.6},
 {kind:"SET_ENTITY_STAT",entityKey:"FINAL",destStat:"AGI",value:90},
 {kind:"LINK_ENTITY_STAT",entityKey:"FINAL",
  sourceStat:"PHYSICAL_DEFENSE",destStat:"INTEGRITY",factor:2},
 {kind:"SET_ENTITY_BEHAVIOR",entityKey:"FINAL",mode:"FOLLOW",
  allowedModes:["FOLLOW","HOLD","MANUAL"],target:"USER",trigger:"COMMAND"},
];
const skill=(withChaos=false)=>compileCombatSkill({
 id:992,name:"Unión",status:"APPROVED",category:"UTILITY",
 cost:25,maintenanceCost:5,duration:"3 turnos",
 effect:[module(withChaos?[...steps,{kind:"CHAOS_FIELD",entityKey:"FINAL",
  radiusMeters:5,rotationDegrees:90,rotateEachRound:true}]:steps)],
});
const creature=(owner,key,i)=>({
 id:owner+":"+key+":old",owner,sourceSkillId:34+i,
 entityKey:key,label:key,
 fieldPosition:{x:i*.35,y:i*.2},createdRound:1,expiresAtRound:4,
 controlRangeMeters:15,maintenanceMana:0,integrity:40,hitCount:0,hitLimit:3,
 links:[{mode:"FIXED",destStat:"PHYSICAL_ATTACK",value:10},
  {mode:"FIXED",destStat:"AGI",value:100},
  {mode:"FIXED",destStat:"INTEGRITY",value:40}],
 behavior:{mode:"HOLD",allowedModes:["FOLLOW","HOLD","MANUAL"],
  target:"USER",trigger:"COMMAND"},
 contactEffects:[],charges:{},chargesMigrated:true,
 autoRound:1,autoSpentAp:0,autoNextTick:35,
});
const battle=(twoOwners=false)=>{
 const c=newCombatState(fighter("A",twoOwners?31:null,0),
   fighter("B",twoOwners?32:null,1.2),"PLAYER",true);
 c.mana={PLAYER:{current:90,max:90},NPC:{current:90,max:90}};
 c.summons=[...keys.map((k,i)=>creature("PLAYER",k,i))];
 if(twoOwners)c.summons.push(...keys.map((k,i)=>({
   ...creature("NPC",k,i),
   fieldPosition:{x:1.2+i*.35,y:i*.2},
 })));
 return c;
};
const cast=(s,c,side,plan=skill())=>declareTimelineCommand(
 s,c,side,{kind:"CAST_SKILL",skillId:plan.id,
  requestId:"v2-fusion-"+side+"-00001"},"fusion-"+side,{approvedSkill:plan});
const dice=()=>({hit:.2,critical:.95,defense:.8});

test("approved non-chaos fusion consumes only two actual sources at its deadline",async()=>{
 const c=battle(),snapshot=structuredClone(c),p=skill();
 assert.equal(p.category,"FUSION");
 assert.equal(p.fusion.chaosField,undefined);
 let s=cast(newTimelineDeclarationSession(c),c,"PLAYER",p);
 s=declareTimelineCommand(s,c,"NPC",{kind:"WAIT"},"npc-wait");
 assert.equal(c.summons.length,2);
 const out=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(out.combat.tick,10);
 assert.equal(out.combat.mana.PLAYER.current,65);
 assert.equal(out.combat.summons.length,1);
 const fused=out.combat.summons[0];
 assert.equal(fused.entityKey,"FINAL");
 assert.deepEqual(fused.fusedFrom,c.summons.map(s=>s.id));
 assert.equal(fused.integrity,80);
 assert.ok(fused.autoNextTick>10);
 assert.equal(fused.createdRound,1);
 assert.equal(fused.expiresAtRound,4);
 assert.deepEqual(c,snapshot,"neither source nor mana changes on declaration");
 assert.deepEqual(out.combat.skillCooldowns.PLAYER["992"],0);
});

test("simultaneous opposed fusions remain owner-scoped and costs are once",async()=>{
 const c=battle(true),p=skill();
 let s=cast(newTimelineDeclarationSession(c),c,"PLAYER",p);
 s=cast(s,c,"NPC",p);
 const out=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(out.combat.tick,10);
 assert.equal(out.combat.summons.length,2);
 assert.deepEqual(new Set(out.combat.summons.map(s=>s.owner)),
   new Set(["PLAYER","NPC"]));
 for(const side of ["PLAYER","NPC"]){
   const fused=out.combat.summons.find(x=>x.owner===side);
   assert.equal(fused.entityKey,"FINAL");
   assert.deepEqual(fused.fusedFrom,
     c.summons.filter(x=>x.owner===side).map(x=>x.id));
   assert.equal(out.combat.mana[side].current,65);
 }
});

test("missing, stolen, expired or paid-out sources fail without mutation",async()=>{
 for(const kind of ["missing","stolen","expired","mana"]){
   const c=battle();
   if(kind==="missing")c.summons.pop();
   if(kind==="stolen")c.summons[1].owner="NPC";
   if(kind==="expired")c.summons[1].expiresAtRound=1;
   if(kind==="mana")c.mana.PLAYER.current=10;
   const previous=structuredClone(c);
   let s;
   if(kind==="mana"){
     assert.throws(()=>cast(newTimelineDeclarationSession(c),c,"PLAYER"),
       /maná/);
   }else{
     s=cast(newTimelineDeclarationSession(c),c,"PLAYER");
     s=declareTimelineCommand(s,c,"NPC",{kind:"WAIT"},"skip-npc");
     await assert.rejects(()=>resolveBasicTimelineWindow(c,s,dice),
       /criatura|Falta/);
   }
   assert.deepEqual(c,previous);
 }
});

test("chaos fusion stays blocked by dedicated V2 resolver",()=>{
 const c=battle(),p=skill(true);
 const clock=newTimelineDeclarationSession(c);
 const declared=cast(clock,c,"PLAYER",p);
 const event={id:"fake",owner:"PLAYER",kind:"SKILL",status:"RESOLVED",
   endsAtTick:10,durationTicks:10,paidAp:1};
 assert.throws(()=>simulateApprovedTimelineFusion(c,{
   ...declared.clock,nowTick:10,
 },event,{kind:"CAST_SKILL",skillId:p.id,
   requestId:"safe-chaos-request-0001"},p),/caos/);
 const catalog=readFileSync(new URL("../lib/combat/timeline-lab-skills.ts",
   import.meta.url),"utf8");
 assert.match(catalog,/!plan\.fusion\.chaosField/);
});
