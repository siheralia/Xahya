import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState,turnTicks} from "../lib/combat/turn-engine.ts";
import {fieldPosition} from "../lib/combat/field-plane.ts";
import {
 newTimelineDeclarationSession,declareTimelineCommand,
 publicTimelineSessionStatus,
} from "../lib/combat/timeline-declarations.ts";
import {
 resolveBasicTimelineWindow,simulateBasicTimelinePassiveAction,
} from "../lib/combat/timeline-basic-actions.ts";
import {
 newContinuousCombatTimeline,queueTimelineAction,
 completeNextTimelineBatch,
} from "../lib/combat/action-timeline.ts";

const fighter=(name,x,speed=100,shield=false)=>({
 characterId:null,name,hp:100,maxHp:100,
 agility:speed,strength:80,constitution:20,precision:80,dodge:5,
 physicalAttack:30,physicalDefense:5,magicAttack:10,magicDefense:5,
 critical:0,luck:0,race:20,massKg:60,positionMeters:x,
 attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,spentTicks:0,spentAp:0,
 ...(shield?{offhandWeapon:{name:"Escudo",characterItemId:41,itemId:2,
   attackType:"BLUNT",mode:"MELEE",effectiveRangeMeters:1.5,
   maximumRangeMeters:1.5,durability:100}}:{}),
});
const combat=(speed=100)=>newCombatState(fighter("A",0,speed),
 fighter("B",0.5,speed,true),"PLAYER",true);
const rolls=()=>({hit:0.01,critical:0.99,defense:0.01});
const move=(x,y=0)=>({kind:"MOVE",direction:"VECTOR",meters:Math.hypot(x,y),
 planarMove:{x,y}});
const attack=()=>({kind:"ATTACK",attackType:"BLUNT",
 attackSource:"FIST_RIGHT",trajectory:[{x:0.1,y:0.5},{x:0.5,y:0.5}]});

test("moving commits world-space position at finish, not declaration",async()=>{
 const before=combat();
 let session=newTimelineDeclarationSession(before);
 session=declareTimelineCommand(session,before,"PLAYER",move(-0.5,0.5),"move-a");
 assert.deepEqual(fieldPosition(before.actors.PLAYER),{x:0,y:0});
 assert.equal(session.clock.nowTick,0);
 assert.deepEqual(publicTimelineSessionStatus(session).waitingFor,["NPC"]);
 session=declareTimelineCommand(session,before,"NPC",{kind:"WAIT"},"wait-b");
 const result=await resolveBasicTimelineWindow(before,session,rolls);
 assert.equal(result.combat.tick,turnTicks(before.actors.PLAYER));
 assert.deepEqual(fieldPosition(result.combat.actors.PLAYER),{x:-0.5,y:0.5});
 assert.deepEqual(fieldPosition(before.actors.PLAYER),{x:0,y:0});
 assert.equal(result.combat.actors.PLAYER.spentAp,0);
 assert.ok(result.combat.log.some(x=>x.kind==="MOVE"&&x.tick===result.combat.tick));
});

test("simultaneous moves resolve from the same pre-movement world snapshot",async()=>{
 const before=combat();
 let session=newTimelineDeclarationSession(before);
 session=declareTimelineCommand(session,before,"PLAYER",move(-0.5),"move-a");
 session=declareTimelineCommand(session,before,"NPC",move(0.5),"move-b");
 const result=await resolveBasicTimelineWindow(before,session,rolls);
 assert.deepEqual(fieldPosition(result.combat.actors.PLAYER),{x:-0.5,y:0});
 assert.deepEqual(fieldPosition(result.combat.actors.NPC),{x:1,y:0});
 assert.equal(result.combat.log.filter(x=>x.kind==="MOVE").length,2);
 assert.ok(result.combat.log.every(x=>x.tick===result.combat.tick));
});

test("guard shields several strikes without an extra block action or premature damage",async()=>{
 const before=combat();
 before.actors.NPC.agility=50;
 // This test isolates repeated shield contact, not forced displacement.
 before.actors.PLAYER.strength=0;
 before.actors.NPC.constitution=100;
 let session=newTimelineDeclarationSession(before);
 session=declareTimelineCommand(session,before,"NPC",
   {kind:"GUARD",weaponSlot:"OFF_HAND"},"guard");
 session=declareTimelineCommand(session,before,"PLAYER",attack(),"hit-1");
 const first=await resolveBasicTimelineWindow(before,session,rolls);
 assert.equal(first.combat.tick,10);
 assert.equal(first.timeline.clock.actors.NPC.spentApByRound["1"],1);
 assert.equal(first.combat.actors.NPC.spentAp,0);
 assert.ok(first.combat.actors.NPC.offhandWeapon.durability<100);
 const wearAfterFirst=first.combat.actors.NPC.offhandWeapon.durability;
 const wrong=declareTimelineCommand(first.timeline,first.combat,"PLAYER",attack(),"bad-stroke");
 // Each new attack must continue at its previous endpoint.
 await assert.rejects(()=>resolveBasicTimelineWindow(first.combat,wrong,rolls),
   /comenzar donde terminó/);
 // The next attack starts from the exact endpoint stored on first contact.
 const anchored={...attack(),trajectory:[{x:0.5,y:0.5},{x:0.5,y:0.5}]};
 const corrected=declareTimelineCommand(first.timeline,first.combat,"PLAYER",anchored,"hit-2");
 const second=await resolveBasicTimelineWindow(first.combat,corrected,rolls);
 assert.equal(second.combat.tick,20);
 assert.equal(second.timeline.clock.actors.NPC.spentApByRound["1"],1);
 assert.ok(second.combat.actors.NPC.offhandWeapon.durability<wearAfterFirst);
 assert.ok(second.combat.log.some(entry=>entry.kind==="BLOCK"&&entry.tick===20));
 assert.ok(second.combat.log.filter(entry=>entry.kind==="RESOLVE").length>=2);
});

test("WAIT crosses absolute tick 100 without charging free PA as a second action",async()=>{
 const before=combat(100);
 let session=newTimelineDeclarationSession(before);
 session=declareTimelineCommand(session,before,"PLAYER",{kind:"WAIT"},"wait-a");
 session=declareTimelineCommand(session,before,"NPC",{kind:"WAIT"},"wait-b");
 const result=await resolveBasicTimelineWindow(before,session,rolls);
 assert.equal(result.combat.tick,100);
 assert.equal(result.combat.round,2);
 assert.deepEqual(result.timeline.clock.actors.PLAYER.spentApByRound,{1:0});
 assert.equal(result.combat.log.filter(x=>x.kind==="ROUND").length,1);
 assert.ok(result.combat.log.some(x=>x.kind==="WAIT"&&x.tick===100));
});

test("guard requires its approved equipment copy and matches reserved time",()=>{
 const before=combat();
 let clock=newContinuousCombatTimeline(25,25);
 clock=queueTimelineAction(clock,"PLAYER",{id:"wait",kind:"WAIT",durationTicks:100,paCost:0});
 clock=queueTimelineAction(clock,"NPC",{id:"guard",kind:"BLOCK",durationTicks:10,
   paCost:1,blockToolSlot:"OFF_HAND",blockToolCopyId:999});
 const batch=completeNextTimelineBatch(clock);
 assert.throws(()=>simulateBasicTimelinePassiveAction(before,batch.state,
   batch.events[0],{kind:"GUARD",weaponSlot:"OFF_HAND"}),/equipo/);
});

test("rejects shadow movement if temporal buffs or summoning require upkeep",async()=>{
 const before=combat();
 before.skillBonuses=[{by:"PLAYER",skillId:99,stat:"agility",
   value:10,expiresAtRound:2}];
 let session=newTimelineDeclarationSession(before);
 session=declareTimelineCommand(session,before,"PLAYER",move(0.5),"move-a");
 session=declareTimelineCommand(session,before,"NPC",{kind:"WAIT"},"wait-b");
 await assert.rejects(()=>resolveBasicTimelineWindow(before,session,rolls),/completo/);
});

test("physical knockback is committed as a world displacement, never discarded",async()=>{
 const before=combat();
 before.actors.PLAYER.strength=250;
 before.actors.NPC.constitution=1;
 let session=newTimelineDeclarationSession(before);
 session=declareTimelineCommand(session,before,"PLAYER",attack(),"hit");
 session=declareTimelineCommand(session,before,"NPC",{kind:"WAIT"},"wait");
 const result=await resolveBasicTimelineWindow(before,session,rolls);
 assert.ok(result.combat.actors.NPC.hp<100);
 assert.ok(result.combat.actors.NPC.positionMeters>0.5,
   "measured physical knockback must persist beyond the V1 shadow");
 assert.ok(result.combat.log.some(x=>x.kind==="RESOLVE"&&x.tick===result.combat.tick));
 assert.equal(before.actors.NPC.positionMeters,0.5);
});
