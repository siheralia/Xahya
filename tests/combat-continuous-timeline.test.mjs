import test from "node:test";
import assert from "node:assert/strict";
import {
  activeTimelineBlockAt,completeNextTimelineBatch,interruptTimelineAction,
  newContinuousCombatTimeline,pendingTimelineSides,queueTimelineAction,
  timelineRoundOf,
} from "../lib/combat/action-timeline.ts";

const reserve=(state,owner,id,kind,durationTicks,paCost=1,blockToolCopyId)=>
  queueTimelineAction(state,owner,{id,kind,durationTicks,paCost,blockToolCopyId});

test("a raised shield covers two impacts while paying only one reaction",()=>{
 let timeline=newContinuousCombatTimeline(10,10);
 timeline=reserve(timeline,"PLAYER","sword-one","ATTACK",10);
 timeline=reserve(timeline,"NPC","shield-raise","BLOCK",30,1,42);
 let batch=completeNextTimelineBatch(timeline);
 assert.equal(batch.atTick,10);
 assert.deepEqual(batch.events.map(e=>e.id),["sword-one"]);
 timeline=batch.state;
 assert.equal(activeTimelineBlockAt(timeline,"NPC",10)?.blockToolCopyId,42);
 timeline=reserve(timeline,"PLAYER","sword-two","ATTACK",10);
 batch=completeNextTimelineBatch(timeline);
 assert.equal(batch.atTick,20);
 assert.deepEqual(batch.events.map(e=>e.id),["sword-two"]);
 assert.equal(activeTimelineBlockAt(batch.state,"NPC",20)?.id,"shield-raise");
 assert.equal(batch.state.actors.NPC.spentApByRound["1"],1);
 assert.equal(activeTimelineBlockAt(batch.state,"NPC",30)?.id,"shield-raise");
 assert.equal(activeTimelineBlockAt(batch.state,"NPC",31),null);
});

test("a command may finish beyond tick 100 without losing a single tick",()=>{
 let timeline=newContinuousCombatTimeline(12,12);
 timeline=reserve(timeline,"PLAYER","approach","MOVE",95);
 timeline=reserve(timeline,"NPC","position","MOVE",95);
 let batch=completeNextTimelineBatch(timeline);
 assert.equal(batch.atTick,95);
 assert.equal(batch.simultaneous,true);
 timeline=batch.state;
 timeline=reserve(timeline,"PLAYER","slow-strike","ATTACK",60);
 timeline=reserve(timeline,"NPC","lasting-shield","BLOCK",80,1,84);
 const strike=timeline.events.find(x=>x.id==="slow-strike");
 assert.deepEqual([strike.startsAtTick,strike.endsAtTick],[95,155]);
 assert.equal(timelineRoundOf(strike.startsAtTick),1);
 assert.equal(timelineRoundOf(strike.endsAtTick),2);
 batch=completeNextTimelineBatch(timeline);
 assert.equal(batch.atTick,155);
 assert.equal(activeTimelineBlockAt(batch.state,"NPC",155)?.id,"lasting-shield");
 timeline=reserve(batch.state,"PLAYER","second-strike","ATTACK",10);
 batch=completeNextTimelineBatch(timeline);
 assert.equal(batch.atTick,165);
 assert.equal(batch.events[0].id,"second-strike");
 assert.equal(activeTimelineBlockAt(batch.state,"NPC",175)?.id,"lasting-shield");
 assert.equal(activeTimelineBlockAt(batch.state,"NPC",176),null);
});

test("simultaneous attacks resolve in one batch before either winner is chosen",()=>{
 let timeline=newContinuousCombatTimeline(10,10);
 timeline=reserve(timeline,"PLAYER","hit-a","ATTACK",17);
 timeline=reserve(timeline,"NPC","hit-b","ATTACK",17);
 const batch=completeNextTimelineBatch(timeline);
 assert.equal(batch.atTick,17);
 assert.equal(batch.simultaneous,true);
 assert.deepEqual(batch.events.map(e=>e.id),["hit-a","hit-b"]);
 assert.equal(batch.events.every(e=>e.status==="RESOLVED"),true);
});

test("a combatant must declare before another long action can fast-forward",()=>{
 let timeline=newContinuousCombatTimeline(10,10);
 timeline=reserve(timeline,"PLAYER","slow","SKILL",1000);
 assert.deepEqual(pendingTimelineSides(timeline),["NPC"]);
 assert.throws(()=>completeNextTimelineBatch(timeline),/Faltan acciones temporales/);
 timeline=reserve(timeline,"NPC","quick","MOVE",10);
 const batch=completeNextTimelineBatch(timeline);
 assert.equal(batch.atTick,10);
 assert.equal(batch.events[0].id,"quick");
 assert.deepEqual(pendingTimelineSides(batch.state),["NPC"]);
});

test("PA refresh at a real round boundary, not when an action ends at tick 10",()=>{
 let timeline=newContinuousCombatTimeline(1,1);
 timeline=reserve(timeline,"PLAYER","first-a","ATTACK",10);
 timeline=reserve(timeline,"NPC","first-b","ATTACK",10);
 timeline=completeNextTimelineBatch(timeline).state;
 assert.throws(()=>reserve(timeline,"PLAYER","too-soon","ATTACK",10),/PA/);
 timeline=reserve(timeline,"PLAYER","idle-a","WAIT",90,0);
 timeline=reserve(timeline,"NPC","idle-b","WAIT",90,0);
 timeline=completeNextTimelineBatch(timeline).state;
 assert.equal(timeline.nowTick,100);
 assert.equal(timelineRoundOf(timeline.nowTick),2);
 timeline=reserve(timeline,"PLAYER","round-two","ATTACK",10);
 assert.equal(timeline.events.at(-1).startsAtTick,100);
 assert.equal(timeline.actors.PLAYER.spentApByRound["2"],1);
});

test("interrupted shield loses coverage, not its already spent PA",()=>{
 let timeline=newContinuousCombatTimeline(10,10);
 timeline=reserve(timeline,"PLAYER","first","ATTACK",10);
 timeline=reserve(timeline,"NPC","guard","BLOCK",30,1,77);
 timeline=completeNextTimelineBatch(timeline).state;
 assert.ok(activeTimelineBlockAt(timeline,"NPC",11));
 timeline=interruptTimelineAction(timeline,"NPC");
 assert.equal(timeline.actors.NPC.spentApByRound["1"],1);
 assert.equal(timeline.actors.NPC.availableAtTick,10);
 assert.equal(activeTimelineBlockAt(timeline,"NPC",11),null);
 timeline=reserve(timeline,"NPC","reposition","MOVE",5);
 assert.equal(timeline.events.at(-1).startsAtTick,10);
});

test("invalid duration, duplicate IDs and overlapping intents cannot mint free time",()=>{
 let timeline=newContinuousCombatTimeline(10,10);
 assert.throws(()=>reserve(timeline,"PLAYER","zero","ATTACK",0),/inválida/);
 timeline=reserve(timeline,"PLAYER","once","ATTACK",6);
 assert.throws(()=>reserve(timeline,"PLAYER","other","ATTACK",1),/pendiente/);
 timeline=reserve(timeline,"NPC","npc","MOVE",6);
 timeline=completeNextTimelineBatch(timeline).state;
 assert.throws(()=>reserve(timeline,"PLAYER","once","ATTACK",6),/duplicado/);
});

test("absolute ticks never rewind and interval membership is start-inclusive/end-exclusive",()=>{
 let timeline=newContinuousCombatTimeline(10,10);
 timeline=reserve(timeline,"PLAYER","walk","MOVE",33);
 timeline=reserve(timeline,"NPC","block","BLOCK",65,1,99);
 let batch=completeNextTimelineBatch(timeline);
 assert.equal(batch.atTick,33);
 assert.equal(activeTimelineBlockAt(batch.state,"NPC",0)?.id,"block");
 assert.equal(activeTimelineBlockAt(batch.state,"NPC",64)?.id,"block");
 assert.equal(activeTimelineBlockAt(batch.state,"NPC",65)?.id,"block");
 assert.equal(activeTimelineBlockAt(batch.state,"NPC",66),null);
 timeline=reserve(batch.state,"PLAYER","strike","ATTACK",20);
 batch=completeNextTimelineBatch(timeline);
 assert.equal(batch.atTick,53);
 assert.equal(batch.state.nowTick,53);
});


test("crossing 100-tick boundaries emits each scheduled round start once",()=>{
 let timeline=newContinuousCombatTimeline(10,10);
 timeline=reserve(timeline,"PLAYER","very-long","SKILL",305);
 timeline=reserve(timeline,"NPC","shield","BLOCK",400,1,19);
 let batch=completeNextTimelineBatch(timeline);
 assert.equal(batch.atTick,305);
 assert.deepEqual(batch.crossedRoundBoundaries,[100,200,300]);
 assert.equal(batch.events[0].endsAtTick,305);
 timeline=reserve(batch.state,"PLAYER","follow-up","ATTACK",55);
 batch=completeNextTimelineBatch(timeline);
 assert.deepEqual(batch.crossedRoundBoundaries,[]);
 assert.equal(batch.atTick,360);
 timeline=reserve(batch.state,"PLAYER","another","MOVE",40);
 batch=completeNextTimelineBatch(timeline);
 assert.deepEqual(batch.crossedRoundBoundaries,[400]);
 assert.equal(batch.atTick,400);
 assert.equal(batch.simultaneous,true);
});

test("equal-tick block covers the impact even when its action expires",()=>{
 let timeline=newContinuousCombatTimeline(10,10);
 timeline=reserve(timeline,"PLAYER","hit","ATTACK",10);
 timeline=reserve(timeline,"NPC","parry","BLOCK",10,1,42);
 const batch=completeNextTimelineBatch(timeline);
 assert.equal(batch.simultaneous,true);
 assert.equal(activeTimelineBlockAt(batch.state,"NPC",10)?.blockToolCopyId,42);
 assert.equal(activeTimelineBlockAt(batch.state,"NPC",11),null);
});

test("events retain the blocking hand for the server durability resolver",()=>{
 let timeline=newContinuousCombatTimeline(10,10);
 timeline=queueTimelineAction(timeline,"PLAYER",{
  id:"shield-hand",kind:"BLOCK",durationTicks:20,paCost:1,
  blockToolSlot:"OFF_HAND",blockToolCopyId:77,
 });
 assert.equal(timeline.events[0].blockToolSlot,"OFF_HAND");
 assert.throws(()=>queueTimelineAction(timeline,"NPC",{
   id:"fake-hand",kind:"ATTACK",durationTicks:10,paCost:1,
   blockToolSlot:"OFF_HAND",
 }),/Solo BLOQUEAR/);
});

test("high Constitution AP budgets above 100 are valid and remain round-scoped",()=>{
 let clock=newContinuousCombatTimeline(109,12);
 assert.equal(clock.actors.PLAYER.apLimitPerRound,109);
 for(let i=0;i<101;i++){
   // Isolate reservation accounting by emulating a completed action each time.
   // No individual action may exceed 100 PA, regardless of the overall budget.
   const queued=queueTimelineAction(clock,"PLAYER",{
     id:"con-"+i,kind:"ATTACK",durationTicks:1,paCost:1,
   });
   clock={...queued,nowTick:queued.actors.PLAYER.availableAtTick,
     events:queued.events.filter(e=>e.id!=="con-"+i)};
 }
 assert.equal(clock.actors.PLAYER.spentApByRound["1"],100);
 assert.equal(clock.actors.PLAYER.spentApByRound["2"],1);
 assert.throws(()=>newContinuousCombatTimeline(0,1),/inválidos/);
 assert.throws(()=>newContinuousCombatTimeline(1,1_000_001),/inválidos/);
});
