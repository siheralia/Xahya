import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {newTimelineDeclarationSession,declareTimelineCommand,
 publicTimelineSessionStatus} from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow} from "../lib/combat/timeline-basic-actions.ts";
import {queueTimelineAction,newContinuousCombatTimeline,
 reserveTimelineRoundBudget} from "../lib/combat/action-timeline.ts";

const fighter=(name,x)=>({
 characterId:null,name,hp:200,maxHp:200,
 agility:100,strength:0,constitution:10,precision:80,dodge:10,
 physicalAttack:20,physicalDefense:5,magicAttack:10,magicDefense:5,
 critical:0,luck:0,race:20,massKg:60,positionMeters:x,
 attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,spentTicks:0,spentAp:0,
});
const make=()=>newCombatState(fighter("A",0),fighter("B",.5),"PLAYER",true);
const dice=()=>({hit:.05,critical:.99,defense:.99});
const movement={kind:"MOVE",direction:"AWAY",meters:.1};

test("V2 PA budget stays fixed despite CON debuff during the same round",async()=>{
 const combat=make();
 let timeline=newTimelineDeclarationSession(combat);
 assert.equal(timeline.clock.actors.PLAYER.apLimitsByRound["1"],19);
 timeline=declareTimelineCommand(timeline,combat,"PLAYER",movement,"round1-a");
 timeline=declareTimelineCommand(timeline,combat,"NPC",{kind:"WAIT"},"round1-npc");
 const first=await resolveBasicTimelineWindow(combat,timeline,dice);
 assert.equal(first.combat.tick,10);
 first.combat.actors.PLAYER.constitution=1;
 const another=declareTimelineCommand(first.timeline,first.combat,"PLAYER",
   movement,"round1-b");
 assert.equal(another.clock.actors.PLAYER.apLimitsByRound["1"],19);
 assert.equal(another.clock.actors.PLAYER.spentApByRound["1"],2);
 assert.equal(publicTimelineSessionStatus(another,first.combat).pa.PLAYER.limit,19);
});

test("V2 recomputes PA from CON in a new round but freezes that budget",async()=>{
 const combat=make();
 let timeline=newTimelineDeclarationSession(combat);
 timeline=declareTimelineCommand(timeline,combat,"PLAYER",{kind:"WAIT"},"wait-r1p");
 timeline=declareTimelineCommand(timeline,combat,"NPC",{kind:"WAIT"},"wait-r1n");
 const after=await resolveBasicTimelineWindow(combat,timeline,dice);
 assert.equal(after.combat.tick,100);
 after.combat.actors.PLAYER.constitution=1;
 assert.equal(publicTimelineSessionStatus(after.timeline,after.combat).pa.PLAYER.limit,10);
 const declared=declareTimelineCommand(after.timeline,after.combat,"PLAYER",
   movement,"round2-move");
 assert.equal(declared.clock.actors.PLAYER.apLimitsByRound["1"],19);
 assert.equal(declared.clock.actors.PLAYER.apLimitsByRound["2"],10);
 assert.equal(declared.clock.actors.PLAYER.apLimitPerRound,10);
 assert.equal(declared.clock.actors.PLAYER.spentApByRound["2"],1);
 after.combat.actors.PLAYER.constitution=50;
 const NPC=declareTimelineCommand(declared,after.combat,"NPC",
   {kind:"WAIT"},"round2-npc");
 const progressed=await resolveBasicTimelineWindow(after.combat,NPC,dice);
 assert.equal(progressed.combat.tick,110);
 assert.equal(progressed.timeline.clock.actors.PLAYER.apLimitsByRound["2"],10);
 const full=structuredClone(progressed.timeline.clock);
 full.actors.PLAYER.spentApByRound["2"]=10;
 assert.throws(()=>queueTimelineAction(full,"PLAYER",{
   id:"overflow",kind:"MOVE",durationTicks:10,paCost:1,
 }),/No quedan PA/);
});

test("V2 shadow resolves strikes on an even real round without false initiative",async()=>{
 const combat=make();
 let timeline=newTimelineDeclarationSession(combat);
 timeline=declareTimelineCommand(timeline,combat,"PLAYER",{kind:"WAIT"},"round-first-p");
 timeline=declareTimelineCommand(timeline,combat,"NPC",{kind:"WAIT"},"round-first-n");
 const crossed=await resolveBasicTimelineWindow(combat,timeline,dice);
 assert.equal(crossed.combat.round,2);
 const attack={kind:"ATTACK",attackType:"BLUNT",
   attackSource:"FIST_RIGHT",trajectory:[{x:.1,y:.5},{x:.5,y:.5}]};
 let next=declareTimelineCommand(crossed.timeline,crossed.combat,"PLAYER",
   attack,"round-two-hit");
 next=declareTimelineCommand(next,crossed.combat,"NPC",
   {kind:"WAIT"},"round-two-wait");
 const resolved=await resolveBasicTimelineWindow(crossed.combat,next,dice);
 assert.equal(resolved.combat.tick,110);
 assert.ok(resolved.combat.log.some(entry=>entry.kind==="RESOLVE"&&entry.tick===110));
});

test("legacy V2 snapshots cannot reprice rounds with recorded PA",()=>{
 const clock=newContinuousCombatTimeline(19,19);
 delete clock.actors.PLAYER.apLimitsByRound;
 clock.nowTick=110;
 clock.actors.PLAYER.spentApByRound["2"]=5;
 const kept=reserveTimelineRoundBudget(clock,"PLAYER",110,10);
 assert.equal(kept.actors.PLAYER.apLimitsByRound["2"],19);
 assert.equal(kept.actors.PLAYER.apLimitPerRound,19);
 assert.equal(kept.actors.PLAYER.spentApByRound["2"],5);
});
