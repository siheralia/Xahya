import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState,turnTicks} from "../lib/combat/turn-engine.ts";
import {declareTimelineCommand,newTimelineDeclarationSession} from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow} from "../lib/combat/timeline-basic-actions.ts";
import {reservedTimelineTurnTicks} from "../lib/combat/timeline-tempo.ts";
import {newContinuousCombatTimeline,queueTimelineAction} from "../lib/combat/action-timeline.ts";

const fighter=(name,x,speed,shield=false)=>({
 characterId:null,name,hp:300,maxHp:300,
 agility:speed,strength:0,constitution:40,precision:80,dodge:5,
 physicalAttack:30,physicalDefense:5,magicAttack:10,magicDefense:5,
 critical:0,luck:0,race:20,massKg:60,positionMeters:x,
 attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,spentTicks:0,spentAp:0,
 ...(shield?{offhandWeapon:{name:"Escudo",characterItemId:41,itemId:2,
   attackType:"BLUNT",mode:"MELEE",effectiveRangeMeters:1.5,
   maximumRangeMeters:1.5,durability:100}}:{}),
});
const setup=(npcSpeed=100)=>newCombatState(
 fighter("A",0,100),fighter("B",.5,npcSpeed,true),"PLAYER",true);
const rolls=()=>({hit:.01,critical:.99,defense:.01});
const attack=(start=.1,end=.5)=>({kind:"ATTACK",attackType:"BLUNT",
 attackSource:"FIST_RIGHT",trajectory:[{x:start,y:.5},{x:end,y:.5}]});

test("a declared strike keeps its deadline even if speed is debuffed",async()=>{
 const combat=setup(),initial=turnTicks(combat.actors.PLAYER);
 let session=newTimelineDeclarationSession(combat);
 session=declareTimelineCommand(session,combat,"PLAYER",attack(),"frozen-hit");
 session=declareTimelineCommand(session,combat,"NPC",{kind:"WAIT"},"frozen-wait");
 const reserved=session.clock.events.find(x=>x.id==="frozen-hit");
 assert.equal(reserved.reservedSpeedValue,100);
 assert.equal(reserved.endsAtTick,initial);
 combat.actors.PLAYER.agility=50;
 assert.equal(turnTicks(combat.actors.PLAYER),20);
 assert.equal(reservedTimelineTurnTicks(combat.actors.PLAYER,reserved),10);
 const resolved=await resolveBasicTimelineWindow(combat,session,rolls);
 assert.equal(resolved.combat.tick,10);
 assert.equal(resolved.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
 const next=declareTimelineCommand(resolved.timeline,resolved.combat,
   "PLAYER",{kind:"MOVE",direction:"TOWARD",meters:.1},"later-move");
 assert.equal(next.clock.events.find(x=>x.id==="later-move").durationTicks,20);
});

test("a movement retains its frozen duration after a speed change",async()=>{
 const combat=setup();
 let session=newTimelineDeclarationSession(combat);
 session=declareTimelineCommand(session,combat,"PLAYER",
   {kind:"MOVE",direction:"TOWARD",meters:.25},"frozen-move");
 session=declareTimelineCommand(session,combat,"NPC",{kind:"WAIT"},"frozen-wait");
 combat.actors.PLAYER.agility=25;
 const resolved=await resolveBasicTimelineWindow(combat,session,rolls);
 assert.equal(resolved.combat.tick,10);
 assert.equal(resolved.combat.actors.PLAYER.positionMeters,.25);
});

test("guard remains eligible until its deadline after speed changes",async()=>{
 const combat=setup(50);
 let session=newTimelineDeclarationSession(combat);
 session=declareTimelineCommand(session,combat,"NPC",
   {kind:"GUARD",weaponSlot:"OFF_HAND"},"frozen-guard");
 session=declareTimelineCommand(session,combat,"PLAYER",attack(),"frozen-first-hit");
 const first=await resolveBasicTimelineWindow(combat,session,rolls);
 assert.equal(first.combat.tick,10);
 assert.equal(first.timeline.clock.events.find(x=>x.id==="frozen-guard").endsAtTick,20);
 first.combat.actors.NPC.agility=25;
 const secondIntent=declareTimelineCommand(first.timeline,first.combat,"PLAYER",
   attack(.5,.5),"frozen-second-hit");
 const second=await resolveBasicTimelineWindow(first.combat,secondIntent,rolls);
 assert.equal(second.combat.tick,20);
 assert.equal(second.timeline.clock.actors.NPC.spentApByRound["1"],1);
 assert.ok(second.combat.log.some(x=>x.kind==="BLOCK"&&x.tick===20));
});

test("bad frozen speed or forged time interval is rejected",()=>{
 const base=newContinuousCombatTimeline(15,15);
 assert.throws(()=>queueTimelineAction(base,"PLAYER",
   {id:"invalid",kind:"MOVE",durationTicks:10,paCost:1,
     reservedSpeedValue:0}),/Velocidad/);
 const actor=fighter("A",0,100);
 assert.throws(()=>reservedTimelineTurnTicks(actor,{
   startsAtTick:5,endsAtTick:12,durationTicks:10,reservedSpeedValue:100,
 }),/intervalo/);
});
