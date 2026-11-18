import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {applyCombatCommand,newCombatState} from "../lib/combat/turn-engine.ts";
import {newContinuousCombatTimeline,queueTimelineAction,completeNextTimelineBatch}
 from "../lib/combat/action-timeline.ts";
import {commitAuthorizedTimelineBatch}
 from "../lib/combat/timeline-batch-resolver.ts";
import {simulateBasicPhysicalTimelineHit}
 from "../lib/combat/timeline-basic-strike.ts";

const fighter=(name,positionMeters)=>({
 characterId:null,name,hp:100,maxHp:100,agility:100,
 strength:10,constitution:30,precision:50,dodge:10,
 physicalAttack:32,physicalDefense:6,magicAttack:10,magicDefense:10,
 critical:0,luck:0,race:20,massKg:70,positionMeters,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,
});
const dice={hit:0.01,critical:0.99,defense:0.99};
const draw=(start)=>({kind:"ATTACK",attackType:"BLUNT",
 attackSource:"FIST_RIGHT",trajectory:[start,{x:.5,y:.5}]});
const reserve=(clock,side,id,kind,durationTicks)=>queueTimelineAction(clock,side,{
 id,kind,durationTicks,paCost:kind==="WAIT"?0:1,
});

test("V2 accepts consecutive freely drawn origins; the V1 endpoint rule remains intact",()=>{
 const firstEnd={x:.8,y:.8};
 const initial=newCombatState(fighter("Player",0),fighter("NPC",.5),"PLAYER",true);
 initial.physicalPathEnd={PLAYER:firstEnd};
 initial.physicalPathEnds={PLAYER:{FIST_RIGHT:firstEnd}};
 const first=draw({x:.2,y:.8});
 // The original V1 resolver must still reject a non-continuous stroke.
 assert.throws(()=>applyCombatCommand(initial,"PLAYER",first,dice),
  /comenzar donde terminó/);

 let clock=newContinuousCombatTimeline(39,39);
 clock=reserve(clock,"PLAYER","first","ATTACK",10);
 clock=reserve(clock,"NPC","waiting","WAIT",100);
 const batch1=completeNextTimelineBatch(clock);
 const effect1=simulateBasicPhysicalTimelineHit(initial,batch1.state,
  batch1.events[0],first,dice,dice);
 const after1=commitAuthorizedTimelineBatch(initial,batch1,[effect1]);
 assert.deepEqual(after1.physicalPathEnds.PLAYER.FIST_RIGHT,{x:.5,y:.5});
 assert.deepEqual(initial.physicalPathEnds.PLAYER.FIST_RIGHT,firstEnd,
  "V2 must never mutate the original combat while simulating");

 clock=reserve(batch1.state,"PLAYER","second","ATTACK",10);
 const batch2=completeNextTimelineBatch(clock);
 const second=draw({x:.85,y:.2});
 const effect2=simulateBasicPhysicalTimelineHit(after1,batch2.state,
  batch2.events[0],second,dice,dice);
 const after2=commitAuthorizedTimelineBatch(after1,batch2,[effect2]);
 assert.equal(after2.tick,20);
 assert.deepEqual(after2.physicalPathEnds.PLAYER.FIST_RIGHT,{x:.5,y:.5});
 assert.ok(after2.log.some(entry=>entry.kind==="RESOLVE"));
});

test("the temporary V2 input starts strokes at the touch point, not a saved endpoint",()=>{
 const ui=readFileSync(new URL(
  "../app/combat/[id]/CombatV2AttackPlanner.tsx",import.meta.url),"utf8");
 assert.doesNotMatch(ui,/physicalAttackStart/);
 assert.match(ui,/setPath\(\[to,to\]\)/);
 assert.match(ui,/path\[0\]\.x/);
 assert.match(ui,/touch-none/);
 assert.match(ui,/Elige el inicio libremente/);
});
