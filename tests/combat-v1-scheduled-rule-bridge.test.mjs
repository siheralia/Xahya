import test from "node:test";
import assert from "node:assert/strict";
import {
 applyCombatCommand,hasActiveBlockGuard,newCombatState,canAct,
} from "../lib/combat/turn-engine.ts";
import {isolatePhysicalShadow,simulateBasicPhysicalTimelineHit}
 from "../lib/combat/timeline-basic-strike.ts";
import {
 newContinuousCombatTimeline,queueTimelineAction,completeNextTimelineBatch,
} from "../lib/combat/action-timeline.ts";

const fighter=(name,x=0,extra={})=>({
 characterId:null,name,hp:180,maxHp:180,agility:100,speedValue:100,
 strength:25,constitution:30,precision:100,dodge:5,
 physicalAttack:45,physicalDefense:8,magicAttack:20,magicDefense:10,
 critical:0,luck:10,race:20,massKg:70,positionMeters:x,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,...extra,
});
const base=()=>newCombatState(fighter("Atacante"),fighter("Defensor",0.5));
const attack={kind:"ATTACK",attackType:"BLUNT",attackSource:"FIST_RIGHT",
 trajectory:[{x:.1,y:.5},{x:.5,y:.5}]};
const dice={hit:.01,critical:.99,defense:.99};
const execute=(snapshot,tick,command,by="PLAYER")=>{
 const timed=structuredClone(snapshot);
 timed.timelineMode="SCHEDULED";
 timed.tick=tick;
 timed.round=Math.floor(tick/100)+1;
 return applyCombatCommand(timed,by,command,dice);
};

test("V1 MOVE keeps its exact movement rules but consumes no tick balance when scheduled",()=>{
 const c=base();
 const legacy=applyCombatCommand(c,"PLAYER",{kind:"MOVE",meters:.3,direction:"TOWARD"});
 const first=execute(c,95,{kind:"MOVE",meters:.3,direction:"TOWARD"});
 assert.equal(first.actors.PLAYER.positionMeters,legacy.actors.PLAYER.positionMeters);
 assert.equal(first.actors.PLAYER.spentTicks,0);
 assert.equal(first.actors.PLAYER.spentAp,1);
 assert.equal(first.tick,95);
 assert.equal(first.round,1);
 const second=execute(first,105,{kind:"MOVE",meters:.1,direction:"TOWARD"});
 assert.equal(second.actors.PLAYER.spentTicks,0);
 assert.equal(second.actors.PLAYER.spentAp,2);
 assert.equal(second.tick,105);
 assert.equal(second.round,2);
 assert.ok(second.log.every(event=>event.tick===95||event.tick===105));
 assert.equal(c.actors.PLAYER.positionMeters,0);
});

test("V1 physical attack and V1 NONE defense keep original damage, without spending ticks",()=>{
 const c=base();
 const legacyLaunch=applyCombatCommand(c,"PLAYER",attack,dice);
 const legacy=applyCombatCommand(legacyLaunch,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 const launched=execute(c,140,attack);
 assert.equal(launched.pending.launchedAtTick,140);
 assert.equal(launched.actors.PLAYER.spentTicks,0);
 const resolved=applyCombatCommand(launched,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.equal(resolved.pending,null);
 assert.equal(resolved.actors.NPC.hp,legacy.actors.NPC.hp);
 assert.equal(resolved.actors.PLAYER.hp,legacy.actors.PLAYER.hp);
 assert.equal(resolved.actors.PLAYER.spentTicks,0);
 assert.equal(resolved.actors.NPC.spentTicks,0);
 assert.equal(resolved.log.find(x=>x.kind==="RESOLVE")?.tick,140);
 assert.equal(resolved.round,2,"the V1 round counter cannot advance from spentTicks");
});

test("V1 scheduled composite preserves two PA but its duration belongs to the timeline",()=>{
 const c=base();
 const launched=execute(c,115,{...attack,planarMove:{x:.2,y:0},movementOrder:"BEFORE"});
 assert.equal(launched.actors.PLAYER.spentAp,2);
 assert.equal(launched.actors.PLAYER.spentTicks,0);
 assert.equal(launched.tick,115);
 assert.ok(launched.pending);
 assert.equal(launched.actors.PLAYER.positionMeters,.2);
});

test("scheduled initiative is decided outside V1, while legacy strict ordering remains",()=>{
 const c=base();
 c.actors.NPC.agility=100;c.actors.NPC.speedValue=100;
 assert.equal(canAct(c,"NPC"),false,"V1 still owns its historic opener");
 const shared=structuredClone(c);shared.timelineMode="SCHEDULED";
 assert.equal(canAct(shared,"NPC"),true,"the trusted clock owns scheduled ordering");
 shared.actors.NPC.spentTicks=100;
 assert.equal(canAct(shared,"NPC"),true,"ticks are not a spendable allowance");
});

test("V1 held block covers the exact closing tick only in scheduled execution",()=>{
 const shield={name:"Escudo",characterItemId:99,itemId:7,durability:100,
  attackType:"BLUNT",mode:"MELEE",effectiveRangeMeters:2,maximumRangeMeters:2};
 const c=newCombatState(fighter("A"),fighter("B",.5,{offhandWeapon:shield}));
 c.tick=20;
 c.pending={by:"PLAYER",against:"NPC",attackType:"BLUNT",
  trajectory:attack.trajectory,launchedAtTick:20,usesMagic:false};
 c.activeBlocks={NPC:{startedAtTick:0,endsAtTick:20,
  weaponSlot:"OFF_HAND",characterItemId:99}};
 assert.equal(hasActiveBlockGuard(c,"NPC"),false);
 c.timelineMode="SCHEDULED";
 assert.equal(hasActiveBlockGuard(c,"NPC"),true);
 c.tick=21;c.pending.launchedAtTick=21;
 assert.equal(hasActiveBlockGuard(c,"NPC"),false);
});

test("the existing temporal strike adapter now invokes V1 at the scheduled impact tick",()=>{
 const c=base();
 let clock=newContinuousCombatTimeline(20,20);
 clock=queueTimelineAction(clock,"PLAYER",{
  id:"scheduled-hit",kind:"ATTACK",durationTicks:10,paCost:1,
 });
 clock=queueTimelineAction(clock,"NPC",{
  id:"scheduled-wait",kind:"WAIT",durationTicks:100,paCost:0,
 });
 const batch=completeNextTimelineBatch(clock);
 const event=batch.events.find(x=>x.id==="scheduled-hit");
 const shadow=isolatePhysicalShadow(c,"PLAYER",batch.atTick);
 assert.equal(shadow.timelineMode,"SCHEDULED");
 assert.equal(shadow.tick,10);
 const impact=simulateBasicPhysicalTimelineHit(c,batch.state,event,attack,dice,dice);
 assert.equal(c.tick,0);
 assert.equal(impact.eventId,"scheduled-hit");
 const resolvedLog=impact.logs.find(x=>x.kind==="RESOLVE");
 assert.equal(resolvedLog.tick,10);
 assert.ok(impact.hpDamage.NPC>0);
});

test("scheduled validation still rejects actions that V1 rejects",()=>{
 const c=base();
 assert.throws(()=>execute(c,130,{kind:"MOVE",meters:999}),/alcance/);
 assert.throws(()=>execute(c,130,{...attack,attackType:"PIERCE"}),/contundente|tipo/i);
});
