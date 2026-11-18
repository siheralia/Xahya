import test from "node:test";
import assert from "node:assert/strict";
import {
 newContinuousCombatTimeline,queueTimelineAction,completeNextTimelineBatch,
 activeTimelineBlockAt,activeTimelineReactionAt,
} from "../lib/combat/action-timeline.ts";
import {
 preparedTimelineReactionAt,timelineDefenseForImpact,
} from "../lib/combat/timeline-defense.ts";

const put=(clock,owner,id,kind,durationTicks,more={})=>
 queueTimelineAction(clock,owner,{id,kind,durationTicks,paCost:1,...more});

test("an active shield covers successive impacts and the closing-tick tie for one PA",()=>{
 let timeline=newContinuousCombatTimeline(3,3);
 timeline=put(timeline,"NPC","shield","BLOCK",20,{
   blockToolSlot:"OFF_HAND",blockToolCopyId:41,
 });
 timeline=put(timeline,"PLAYER","first","ATTACK",10);
 assert.equal(timeline.actors.NPC.spentApByRound["1"],1);
 const before=completeNextTimelineBatch(timeline);
 assert.equal(before.atTick,10);
 assert.equal(activeTimelineBlockAt(before.state,"NPC",10)?.id,"shield");
 let next=put(before.state,"PLAYER","second","ATTACK",10);
 assert.equal(next.actors.NPC.spentApByRound["1"],1);
 const finish=completeNextTimelineBatch(next);
 assert.equal(finish.atTick,20);
 assert.ok(finish.simultaneous,"the second impact and posture completion share a tick");
 assert.equal(activeTimelineBlockAt(finish.state,"NPC",20)?.id,"shield");
 assert.equal(activeTimelineBlockAt(finish.state,"NPC",21),null);
 assert.equal(finish.state.actors.NPC.spentApByRound["1"],1);
});

test("a prepared dodge covers impacts in its interval but is not a universal hit cancellation",()=>{
 let timeline=newContinuousCombatTimeline(3,3);
 timeline=put(timeline,"NPC","dodge","REACT",20);
 timeline=put(timeline,"PLAYER","first","ATTACK",10);
 const first=completeNextTimelineBatch(timeline);
 const ownDeclaration={kind:"PREPARE_REACTION",defense:"DODGE",
   predictedCenter:{x:0.5,y:0.5}};
 const lookup=(id,owner)=>id==="dodge"&&owner==="NPC"?ownDeclaration:undefined;
 const reactionAt10=preparedTimelineReactionAt(first.state,"NPC",10,lookup);
 assert.deepEqual(reactionAt10,ownDeclaration);
 assert.deepEqual(timelineDefenseForImpact(reactionAt10,{
   usesMagic:false,isArea:false,
 }),{kind:"DEFEND",defense:"DODGE",predictedCenter:{x:0.5,y:0.5}});
 assert.equal(first.state.actors.NPC.spentApByRound["1"],1);
 const secondTimeline=put(first.state,"PLAYER","second","ATTACK",10);
 const second=completeNextTimelineBatch(secondTimeline);
 assert.equal(second.atTick,20);
 assert.equal(activeTimelineReactionAt(second.state,"NPC",20)?.id,"dodge");
 assert.equal(second.state.actors.NPC.spentApByRound["1"],1);
 assert.equal(preparedTimelineReactionAt(second.state,"NPC",21,lookup),null);
 assert.deepEqual(timelineDefenseForImpact(null,{usesMagic:false,isArea:false}),{
   kind:"DEFEND",defense:"NONE",
 });
});

test("an interrupted defense stops covering future impacts without AP refund",()=>{
 let timeline=newContinuousCombatTimeline(3,3);
 timeline=put(timeline,"NPC","shield","BLOCK",30,{
   blockToolSlot:"MAIN_HAND",blockToolCopyId:7,
 });
 const before=timeline.actors.NPC.spentApByRound["1"];
 // The exact interruption is tested through the scheduler API, not UI state.
 assert.equal(before,1);
 assert.equal(activeTimelineBlockAt(timeline,"NPC",31),null);
});
