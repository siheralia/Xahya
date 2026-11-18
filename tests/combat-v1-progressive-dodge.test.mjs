import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState,applyCombatCommand,plannedV1DodgeMovement}
 from "../lib/combat/turn-engine.ts";
import {fieldPosition} from "../lib/combat/field-plane.ts";
import {newTimelineDeclarationSession,declareTimelineCommand}
 from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow} from "../lib/combat/timeline-basic-actions.ts";

const fighter=(name,x,speed=100,other={})=>({
 characterId:null,name,hp:180,maxHp:180,agility:speed,speedValue:speed,
 strength:30,constitution:15,precision:90,dodge:200,
 physicalAttack:35,physicalDefense:6,magicAttack:30,magicDefense:6,
 critical:0,luck:10,race:20,massKg:70,positionMeters:x,
 attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,
 spentTicks:0,spentAp:0,...other,
});
const state=()=>newCombatState(fighter("A",0),fighter("B",.5,50));
const rolls=()=>({hit:.999,critical:.99,defense:.999});

test("scheduled V1 dodge reserves one real path, advances half at first impact and completes at second",async()=>{
 const c=state();
 const planned=plannedV1DodgeMovement(c,"NPC","AWAY");
 assert.ok(Math.abs(planned.x-.5)<1e-8);
 let t=declareTimelineCommand(newTimelineDeclarationSession(c),c,"NPC",{
   kind:"PREPARE_REACTION",defense:"DODGE",
   predictedCenter:{x:.5,y:.5},dodgeDirection:"AWAY",
 },"progressive-dodge");
 const event=t.clock.events.find(e=>e.id==="progressive-dodge");
 assert.deepEqual(event.evasionVector,planned);
 assert.equal(event.startsAtTick,0);
 assert.equal(event.endsAtTick,20);
 assert.equal(t.clock.actors.NPC.spentApByRound["1"],2);
 t=declareTimelineCommand(t,c,"PLAYER",{
   kind:"ATTACK",attackType:"BLUNT",attackSource:"FIST_RIGHT",
   trajectory:[{x:.1,y:.5},{x:.5,y:.5}],
 },"dodge-strike-one");
 const first=await resolveBasicTimelineWindow(c,t,rolls);
 assert.equal(first.combat.tick,10);
 assert.ok(Math.abs(fieldPosition(first.combat.actors.NPC).x-.75)<1e-8);
 assert.equal(first.timeline.clock.actors.NPC.spentApByRound["1"],2);
 const t2=declareTimelineCommand(first.timeline,first.combat,"PLAYER",{
   kind:"ATTACK",attackType:"BLUNT",attackSource:"FIST_RIGHT",
   trajectory:[{x:.5,y:.5},{x:.1,y:.5}],
 },"dodge-strike-two");
 const second=await resolveBasicTimelineWindow(first.combat,t2,rolls);
 assert.equal(second.combat.tick,20);
 assert.ok(Math.abs(fieldPosition(second.combat.actors.NPC).x-1)<1e-8);
 assert.equal(second.timeline.clock.actors.NPC.spentApByRound["1"],2);
 const movement=second.combat.log.filter(e=>e.kind==="POSITION"&&e.by==="NPC");
 assert.deepEqual(movement.map(e=>e.tick),[10,20]);
});

test("a timed dodge completes its travel even with no incoming attack",async()=>{
 const c=state();
 let t=declareTimelineCommand(newTimelineDeclarationSession(c),c,"NPC",{
   kind:"PREPARE_REACTION",defense:"DODGE",
   predictedCenter:{x:.5,y:.5},dodgeDirection:"AWAY",
 },"unopposed-dodge");
 t=declareTimelineCommand(t,c,"PLAYER",{kind:"WAIT"},"unopposed-wait");
 const finish=await resolveBasicTimelineWindow(c,t,rolls);
 assert.equal(finish.combat.tick,20);
 assert.ok(Math.abs(fieldPosition(finish.combat.actors.NPC).x-1)<1e-8);
 assert.equal(finish.timeline.clock.actors.NPC.spentApByRound["1"],2);
 assert.equal(c.actors.NPC.positionMeters,.5,"original V1 snapshot is unchanged");
});

test("legacy V1 still moves its dodge only after a successful evasion",()=>{
 const c=state();
 const before=plannedV1DodgeMovement(c,"NPC","AWAY");
 assert.ok(before.x>0);
 const launched=applyCombatCommand(c,"PLAYER",{
   kind:"ATTACK",attackType:"BLUNT",
   trajectory:[{x:.1,y:.5},{x:.5,y:.5}],
 });
 const avoided=applyCombatCommand(launched,"NPC",{
   kind:"DEFEND",defense:"DODGE",dodgeDirection:"AWAY",
 },{hit:.999,critical:.99,defense:.999});
 assert.equal(avoided.actors.NPC.spentTicks>0,true,
   "the legacy path still pays ticks; the scheduled path never does");
});

test("out-of-range attacks are rejected at declaration even if a moving defender might later enter reach",()=>{
 const c=newCombatState(fighter("A",0),fighter("B",2,50));
 const clock=newTimelineDeclarationSession(c);
 assert.throws(()=>declareTimelineCommand(clock,c,"PLAYER",{
   kind:"ATTACK",attackType:"BLUNT",attackSource:"FIST_RIGHT",
   trajectory:[{x:.1,y:.5},{x:.5,y:.5}],
 },"originally-out-of-range"),/fuera del alcance máximo al declarar/);
 assert.equal(clock.clock.events.length,0);
 assert.deepEqual(clock.clock.actors.PLAYER.spentApByRound,{});
});
