import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {
 newTimelineDeclarationSession,declareTimelineCommand,
 publicTimelineSessionStatus,
} from "../lib/combat/timeline-declarations.ts";
import {activeTimelineReactionAt} from "../lib/combat/action-timeline.ts";
import {resolveBasicTimelineWindow} from "../lib/combat/timeline-basic-actions.ts";

const fighter=(name,x,speed=100,overrides={})=>({
 characterId:null,name,hp:180,maxHp:180,agility:speed,speedValue:speed,
 strength:25,constitution:15,precision:100,dodge:10,
 physicalAttack:35,physicalDefense:8,magicAttack:50,magicDefense:10,
 critical:0,luck:10,race:20,massKg:70,positionMeters:x,
 attackType:"BLUNT",defenseType:"SOLID",
 weaponIntegrity:100,spentTicks:0,spentAp:0,...overrides,
});
const combat=(dist=1,speed=100)=>{
 const c=newCombatState(fighter("Lanzadora",0),
   fighter("Defensora",dist,speed),"PLAYER",true);
 c.mana={PLAYER:{current:100,max:100},NPC:{current:100,max:100}};
 return c;
};
const dice=()=>({hit:.01,critical:.99,defense:.01});
const missDice=()=>({hit:.999,critical:.99,defense:0});
const trajectory=[{x:.1,y:.5},{x:.5,y:.5}];
const module=(selector="OPPONENT")=>({
 type:"COMPOSED",reviewedPch:20,
 module:{id:"V2_CONTACT",name:"Estado revisado",
  type:"COMBAT_CONTACT",description:"Solo después de un impacto",
  trigger:"ACTIVATE",steps:[
   {kind:"SELECT_TARGET",selector,output:"target"},
   {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"target"},
     stat:"MAGIC_DEFENSE",operation:"MULTIPLIER",value:0.8,durationTurns:2},
  ]},
});
const physical=(id=321)=>compileCombatSkill({
 id,name:"Golpe debilitante",characterId:11,
 status:"APPROVED",approvedAt:"2026-11-11T00:00:00Z",pchCost:45,
 category:"OFFENSIVE",cost:8,
 maintenanceCost:0,accumulationCost:0,accumulationPerTick:0,
 attackType:"BLUNT",duration:"2 turnos",cooldown:"1 turno",
 areaOfEffect:"Contacto | Alcance máximo: 2 m",
 mechanics:{},condition:"",
 effect:[{type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:100},
  module()],
});
const magical=(id=501)=>compileCombatSkill({
 id,name:"Marca de rayo",characterId:11,
 status:"APPROVED",approvedAt:"2026-11-11T00:00:00Z",pchCost:64,
 category:"OFFENSIVE",cost:12,
 maintenanceCost:0,accumulationCost:0,accumulationPerTick:0,
 attackType:"BLUNT",duration:"2 turnos",cooldown:"1 turno",
 areaOfEffect:"Objetivo único | Alcance máximo: 5 m",
 mechanics:{},condition:"",
 effect:[{type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:100},
  module()],
});
const hybrid=(id=901)=>compileCombatSkill({
 id,name:"Puño de dos fuerzas",characterId:11,
 status:"APPROVED",approvedAt:"2026-11-11T00:00:00Z",pchCost:91,
 category:"OFFENSIVE",cost:10,
 maintenanceCost:0,accumulationCost:0,accumulationPerTick:0,
 attackType:"BLUNT",duration:"2 turnos",cooldown:"1 turno",
 areaOfEffect:"Contacto | Alcance máximo: 2 m",
 mechanics:{hybridStatusChannel:"MAGICAL"},condition:"",
 effect:[{type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:60},
  {type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:40},
  module()],
});
const aim=(plan,more={})=>({
 kind:"CAST_SKILL",skillId:plan.id,
 requestId:"v2-offense-action-"+plan.id,
 ...(plan.usesMagic?{areaCenter:{x:.5,y:.5}}:{trajectory}),
 ...more,
});
const cast=(session,c,plan,owner="PLAYER",overrides={})=>
 declareTimelineCommand(session,c,owner,aim(plan,overrides),
   "offense-"+owner+"-"+plan.id,{approvedSkill:plan});
const wait=(session,c,side,id="wait")=>
 declareTimelineCommand(session,c,side,{kind:"WAIT"},id);
const react=(session,c,side,defense,extras={},id="react")=>
 declareTimelineCommand(session,c,side,{kind:"PREPARE_REACTION",defense,...extras},id);

test("approved physical offense is still pending until its absolute hit tick",async()=>{
 const c=combat(),original=structuredClone(c),plan=physical();
 let session=cast(newTimelineDeclarationSession(c),c,plan);
 assert.equal(session.clock.nowTick,0);
 assert.equal(c.actors.NPC.hp,180);
 assert.equal(c.actors.NPC.magicDefense,10);
 assert.equal(c.mana.PLAYER.current,100);
 assert.equal(publicTimelineSessionStatus(session).running[0].kind,"SKILL");
 session=wait(session,c,"NPC");
 const result=await resolveBasicTimelineWindow(c,session,dice);
 assert.equal(result.combat.tick,10);
 assert.ok(result.combat.actors.NPC.hp<180);
 assert.equal(result.combat.actors.NPC.magicDefense,8);
 assert.equal(result.combat.summonStatuses[0].target,"NPC");
 assert.equal(result.combat.summonStatuses[0].expiresAtRound,3);
 assert.equal(result.combat.summonStatuses[0].sourceSummonId,"SKILL:321");
 assert.equal(result.combat.mana.PLAYER.current,92);
 assert.equal(result.combat.skillCooldowns.PLAYER["321"],3);
 assert.equal(result.combat.log.filter(e=>e.kind==="STATUS").length,1);
 assert.equal(result.combat.actors.PLAYER.spentAp,0);
 assert.deepEqual(c,original);
});

test("reviewed magical skill uses official basic hit and pays only its plan cost",async()=>{
 const c=combat(3),p=magical();let s=cast(newTimelineDeclarationSession(c),c,p);
 s=wait(s,c,"NPC");
 const result=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(result.combat.mana.PLAYER.current,88);
 assert.ok(result.combat.actors.NPC.hp<180);
 assert.equal(result.combat.actors.NPC.magicDefense,8);
 assert.ok(result.combat.log.find(e=>e.kind==="ATTACK"&&e.usesMagic));
 assert.ok(result.combat.log.find(e=>e.kind==="RESOLVE"));
 assert.equal(result.combat.skillCooldowns.PLAYER["501"],3);
});

test("one hybrid physical+magic contact retains separate channels and rider gate",async()=>{
 const c=combat(1.5),p=hybrid(),s=cast(newTimelineDeclarationSession(c),c,p);
 const result=await resolveBasicTimelineWindow(c,wait(s,c,"NPC"),dice);
 const hit=result.combat.log.find(e=>e.kind==="RESOLVE");
 assert.ok(hit.damageChannels?.physical>0);
 assert.ok(hit.damageChannels?.magical>0);
 assert.ok(result.combat.summonStatuses?.length===1);
 assert.equal(result.combat.mana.PLAYER.current,90);
});

test("a timed shield blocks the physical part of an imbued two-channel strike",async()=>{
 const c=combat(1.5,50);
 c.actors.NPC.offhandWeapon={
   name:"Escudo de acero",characterItemId:911,itemId:7,
   attackType:"BLUNT",mode:"MELEE",
   effectiveRangeMeters:1.5,maximumRangeMeters:1.5,durability:100,
 };
 const p=hybrid(904);
 let s=declareTimelineCommand(newTimelineDeclarationSession(c),c,"NPC",
   {kind:"GUARD",weaponSlot:"OFF_HAND"},"guard-hybrid");
 s=cast(s,c,p);
 const result=await resolveBasicTimelineWindow(c,s,dice);
 const hit=result.combat.log.find(e=>e.kind==="RESOLVE");
 assert.equal(hit.defense,"BLOCK");
 assert.ok(hit.damageChannels.physical>=0);
 assert.ok(hit.damageChannels.magical>=0);
 assert.ok(result.combat.actors.NPC.offhandWeapon.durability<100);
 assert.equal(result.timeline.clock.actors.NPC.spentApByRound["1"],1);
});

test("prepared physical dodge blocks an approved contact rider on a successful dodge",async()=>{
 const c=combat(),p=physical();
 let s=react(newTimelineDeclarationSession(c),c,"NPC","DODGE",
   {predictedCenter:{x:.5,y:.5}});
 s=cast(s,c,p);
 assert.ok(activeTimelineReactionAt(s.clock,"NPC",10));
 const result=await resolveBasicTimelineWindow(c,s,missDice);
 assert.equal(result.combat.actors.NPC.hp,180);
 assert.equal(result.combat.summonStatuses?.length??0,0);
 assert.equal(result.timeline.clock.actors.NPC.spentApByRound["1"],1);
 assert.ok(result.combat.log.some(e=>e.kind==="REACT"));
});

test("a correctly oriented prepared DEFLECT uses the V1 tangent rule",async()=>{
 const c=combat(),p=physical();
 let s=react(newTimelineDeclarationSession(c),c,"NPC","DEFLECT",
   {defenseAngle:90});
 s=cast(s,c,p);
 const result=await resolveBasicTimelineWindow(c,s,()=>({hit:.01,critical:.99,defense:0}));
 assert.equal(result.combat.actors.NPC.hp,180);
 assert.equal(result.combat.summonStatuses?.length??0,0);
 assert.ok(result.combat.log.some(e=>e.kind==="RESOLVE"&&e.defense==="DEFLECT"));
});

test("magic field charges once for two basic spells while held for twenty ticks",async()=>{
 const c=combat(1,50);
 c.actors.PLAYER.agility=100;
 // Guard slower than attacker by using the NPC's real 20-tick speed.
 const spell=(id)=>({kind:"ATTACK",requestId:id,attackType:"BLUNT",
   usesMagic:true,areaCenter:{x:.5,y:.5}});
 let s=react(newTimelineDeclarationSession(c),c,"NPC","MAGIC_FIELD");
 s=declareTimelineCommand(s,c,"PLAYER",spell("first"),"magic-first");
 const first=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(first.combat.tick,10);
 assert.equal(first.combat.mana.NPC.current,99,
   "field mana paid when first covering a spell, not again at expiry");
 assert.equal(first.combat.mana.PLAYER.current,99);
 assert.equal(first.timeline.chargedReactionIds.length,1);
 assert.equal(first.timeline.clock.actors.NPC.spentApByRound["1"],1);
 s=declareTimelineCommand(first.timeline,first.combat,"PLAYER",
   spell("second"),"magic-second");
 const second=await resolveBasicTimelineWindow(first.combat,s,dice);
 assert.equal(second.combat.tick,20);
 assert.equal(second.combat.mana.NPC.current,99,
   "same field covers both spells, no second mana charge");
 assert.equal(second.combat.mana.PLAYER.current,98);
 assert.equal(second.combat.log.filter(e=>e.kind==="RESOLVE").length,2);
 assert.ok(second.combat.log.some(e=>e.kind==="REACT"&&e.tick===20));
});

test("unopposed magic field pays a single mana at the end of its interval",async()=>{
 const c=combat();
 let s=react(newTimelineDeclarationSession(c),c,"NPC","MAGIC_FIELD");
 s=wait(s,c,"PLAYER");
 const result=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(result.combat.tick,10);
 assert.equal(result.combat.mana.NPC.current,99);
 assert.equal(result.timeline.chargedReactionIds.length,1);
 assert.equal(result.combat.actors.PLAYER.hp,180);
});

test("wrong reaction family does not reduce a magical skill hit",async()=>{
 const c=combat(3);
 let s=react(newTimelineDeclarationSession(c),c,"NPC","REPEL");
 s=cast(s,c,magical());
 const result=await resolveBasicTimelineWindow(c,s,dice);
 const hit=result.combat.log.find(e=>e.kind==="RESOLVE");
 assert.equal(hit.defense,"NONE");
 assert.ok(result.combat.actors.NPC.hp<180);
 assert.equal(result.timeline.clock.actors.NPC.spentApByRound["1"],1);
});

test("invalid reaction angles, forged predictions and nonmagical fields fail closed",()=>{
 const c=combat();const s=newTimelineDeclarationSession(c);
 for(const [defense,extra] of [
   ["DEFLECT",{defenseAngle:400}],
   ["DODGE",{predictedCenter:{x:9,y:1}}],
   ["REPEL",{predictedCenter:{x:.5,y:.5}}],
   ["MAGIC_FIELD",{defenseAngle:10}],
 ]){
   assert.throws(()=>react(s,c,"NPC",defense,extra),/reacción|desvío|esquivar/i);
 }
 c.mana.NPC.current=0;
 assert.throws(()=>react(s,c,"NPC","MAGIC_FIELD"),/maná/);
 assert.equal(s.clock.events.length,0);
});

test("unsupported external target or composite movement is not smuggled via skill",async()=>{
 const c=combat(),p=physical(),original=structuredClone(c);
 for(const extra of [
   {planarMove:{x:1,y:0}},
   {targetSummonId:"forged-creature"},
   {targetConstructionId:"forged-mirror"},
 ]){
   let s=cast(newTimelineDeclarationSession(c),c,p,"PLAYER",extra);
   s=wait(s,c,"NPC");
   await assert.rejects(()=>resolveBasicTimelineWindow(c,s,dice),
     /resolutor ofensivo avanzado/);
   assert.deepEqual(c,original);
 }
});

test("simultaneous approved offenses both land, spend mana once and keep one snapshot",async()=>{
 const c=combat(1);
 const p=physical(322);
 let s=cast(newTimelineDeclarationSession(c),c,p,"PLAYER");
 s=cast(s,c,p,"NPC");
 const result=await resolveBasicTimelineWindow(c,s,dice);
 assert.ok(result.combat.actors.NPC.hp<180);
 assert.ok(result.combat.actors.PLAYER.hp<180);
 assert.equal(result.combat.mana.PLAYER.current,92);
 assert.equal(result.combat.mana.NPC.current,92);
 assert.equal(result.combat.log.filter(e=>e.kind==="RESOLVE").length,2);
 assert.equal(result.combat.tick,10);
 assert.equal(c.mana.PLAYER.current,100);
});
