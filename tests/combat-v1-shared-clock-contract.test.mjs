import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 newContinuousCombatTimeline,queueTimelineAction,completeNextTimelineBatch,
} from "../lib/combat/action-timeline.ts";

const root=new URL("../",import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),"utf8");

test("V1 UI is the preservation baseline, not a replacement V2 component",()=>{
 const v1=read("app/combat/[id]/CombatEncounter.tsx");
 const page=read("app/combat/[id]/page.tsx");
 for(const component of [
  "CombatCharacterHud","CombatDialog","CombatEquipmentStatus",
  "CombatSkillLoadout","CombatTopDownPlane","CombatVerticalActionPlane",
  "CombatMusicPlayer",
 ])assert.match(v1,new RegExp(component),component);
 for(const dialog of ["karma","skills","inventory","stats"])
  assert.ok(v1.includes('open={panel==="'+dialog+'"'),dialog);
 assert.ok(v1.includes('aria-label="Dos planos del combate"'));
 assert.match(page,/import CombatEncounter from "\.\/CombatEncounter"/);
});

test("V1 command variants remain a superset of the experimental V2 commands",()=>{
 const code=read("lib/combat/turn-engine.ts");
 const type=code.slice(code.indexOf("export type CombatCommand ="),
  code.indexOf("const SIDES:",code.indexOf("export type CombatCommand =")));
 for(const command of [
  '"MOVE"','"WAIT"','"ATTACK"','"DEFEND"','"CAST_SKILL"',
  '"USE_ITEM"','"COMMAND_SUMMON"','"BOOST_KARMA"',
 ])assert.ok(type.includes(command),command);
 for(const field of [
  "targetSummonId","targetConstructionId","planarMove",
  "chosenStat","chosenStatusId",
  '"ACT"|"MOVE"|"ATTACK"|"CHANGE_BEHAVIOR"|"CHANGE_TARGET"',
 ])assert.ok(type.includes(field),field);
});

test("absolute time crosses the 100-tick boundary; ticks are durations, not a balance",()=>{
 const original=newContinuousCombatTimeline(4,4);
 const attack=queueTimelineAction(original,"PLAYER",{
  id:"v1-bridge-attack",kind:"ATTACK",durationTicks:140,paCost:1,
 });
 const committed=queueTimelineAction(attack,"NPC",{
  id:"v1-bridge-wait",kind:"WAIT",durationTicks:180,paCost:0,
 });
 assert.equal(committed.actors.PLAYER.availableAtTick,140);
 assert.equal(committed.actors.NPC.availableAtTick,180);
 assert.equal(original.nowTick,0,"declaration must not mutate the source clock");
 const batch=completeNextTimelineBatch(committed);
 assert.equal(batch.atTick,140);
 assert.equal(batch.state.nowTick,140);
 assert.ok(batch.crossedRoundBoundaries.includes(100));
 assert.equal(batch.events.length,1);
 assert.equal(batch.events[0].id,"v1-bridge-attack");
 assert.equal(batch.state.actors.PLAYER.spentApByRound["1"],1);
});

test("two simultaneous events resolve on a common absolute tick",()=>{
 let clock=newContinuousCombatTimeline(3,3);
 clock=queueTimelineAction(clock,"PLAYER",{
  id:"v1-bridge-player",kind:"ATTACK",durationTicks:25,paCost:1,
 });
 clock=queueTimelineAction(clock,"NPC",{
  id:"v1-bridge-opponent",kind:"ATTACK",durationTicks:25,paCost:1,
 });
 const batch=completeNextTimelineBatch(clock);
 assert.equal(batch.atTick,25);
 assert.equal(batch.simultaneous,true);
 assert.deepEqual(batch.events.map(x=>x.owner),["PLAYER","NPC"]);
 assert.equal(clock.nowTick,0);
});
