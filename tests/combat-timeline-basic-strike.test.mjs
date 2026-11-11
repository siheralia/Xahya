import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {
 newContinuousCombatTimeline,queueTimelineAction,completeNextTimelineBatch,
} from "../lib/combat/action-timeline.ts";
import {commitAuthorizedTimelineBatch} from "../lib/combat/timeline-batch-resolver.ts";
import {simulateBasicPhysicalTimelineHit}
 from "../lib/combat/timeline-basic-strike.ts";

const shield={name:"Escudo metálico",attackType:"BLUNT",mode:"MELEE",
  effectiveRangeMeters:1.5,maximumRangeMeters:1.5,durability:100,
  characterItemId:41,itemId:9};
const fighter=(name,position=0,withShield=false)=>({
 characterId:null,name,hp:100,maxHp:100,agility:100,strength:10,
 constitution:30,precision:50,dodge:10,physicalAttack:32,
 physicalDefense:6,magicAttack:10,magicDefense:10,critical:0,
 luck:0,race:20,massKg:70,positionMeters:position,weaponIntegrity:100,
 attackType:"BLUNT",defenseType:"SOLID",spentTicks:0,spentAp:0,
 ...(withShield?{offhandWeapon:{...shield}}:{}),
});
const combat=()=>newCombatState(fighter("A"),fighter("B",0.5,true),"PLAYER",true);
const attack=(requestId="a")=>({kind:"ATTACK",requestId,attackType:"BLUNT",
 attackSource:"FIST_RIGHT",trajectory:[{x:0.1,y:0.5},{x:0.5,y:0.5}]});
const rolls={hit:0.01,critical:0.99,defense:0.01};
const reserve=(clock,owner,id,kind,durationTicks,more={})=>
 queueTimelineAction(clock,owner,{id,kind,durationTicks,paCost:kind==="WAIT"?0:1,...more});

test("real legacy physical formulas are reused while PA stays on V2 scheduler",()=>{
 const c=combat();
 let clock=newContinuousCombatTimeline(39,39);
 clock=reserve(clock,"PLAYER","hit","ATTACK",10);
 clock=reserve(clock,"NPC","guard","BLOCK",20,
   {blockToolSlot:"OFF_HAND",blockToolCopyId:41});
 const blockedBatch=completeNextTimelineBatch(clock);
 const blocked=simulateBasicPhysicalTimelineHit(c,blockedBatch.state,
   blockedBatch.events[0],attack(),rolls,rolls);
 assert.equal(blocked.eventId,"hit");
 assert.ok(blocked.equipmentWear.some(x=>
   x.owner==="NPC"&&x.characterItemId===41&&x.amount>0));
 assert.equal(c.actors.NPC.offhandWeapon.durability,100);
 assert.equal(c.actors.NPC.spentAp,0);
 const committed=commitAuthorizedTimelineBatch(c,blockedBatch,[blocked]);
 assert.ok(committed.actors.NPC.offhandWeapon.durability<100);
 assert.equal(committed.tick,10);
 assert.equal(committed.actors.NPC.spentAp,0,
   "the shadow defense charge must not be charged again in V2");

 let exposed=newContinuousCombatTimeline(39,39);
 exposed=reserve(exposed,"PLAYER","hit","ATTACK",10);
 exposed=reserve(exposed,"NPC","wait","WAIT",100);
 const exposedBatch=completeNextTimelineBatch(exposed);
 const unblocked=simulateBasicPhysicalTimelineHit(c,exposedBatch.state,
   exposedBatch.events[0],attack(),rolls,rolls);
 assert.ok((blocked.hpDamage.NPC??0)<=(unblocked.hpDamage.NPC??0));
});

test("two simultaneous physical hits are evaluated from one snapshot",()=>{
 const c=combat(),original=c.actors.PLAYER.hp;
 let clock=newContinuousCombatTimeline(39,39);
 clock=reserve(clock,"PLAYER","hit-a","ATTACK",10);
 clock=reserve(clock,"NPC","hit-b","ATTACK",10);
 const batch=completeNextTimelineBatch(clock);
 const hits=[
   simulateBasicPhysicalTimelineHit(c,batch.state,batch.events[0],
     attack("aa"),rolls,rolls),
   simulateBasicPhysicalTimelineHit(c,batch.state,batch.events[1],
     attack("bb"),rolls,rolls),
 ];
 const next=commitAuthorizedTimelineBatch(c,batch,hits);
 assert.ok(next.actors.PLAYER.hp<original);
 assert.ok(next.actors.NPC.hp<original);
 assert.equal(c.actors.PLAYER.hp,original);
 assert.equal(next.tick,10);
});

test("physical shadow rejects uncommitted magic, constructs, status and composite moves",()=>{
 const c=combat();
 let clock=newContinuousCombatTimeline(39,39);
 clock=reserve(clock,"PLAYER","hit-a","ATTACK",10);
 clock=reserve(clock,"NPC","wait","WAIT",100);
 const batch=completeNextTimelineBatch(clock),event=batch.events[0];
 assert.throws(()=>simulateBasicPhysicalTimelineHit(c,batch.state,event,
   {...attack(),usesMagic:true},rolls,rolls),/avanzado/);
 assert.throws(()=>simulateBasicPhysicalTimelineHit(c,batch.state,event,
   {...attack(),planarMove:{x:0.1,y:0}},rolls,rolls),/avanzado/);
 const affected={...c,summonStatuses:[{id:"outstanding"}]};
 assert.throws(()=>simulateBasicPhysicalTimelineHit(affected,batch.state,event,
   attack(),rolls,rolls),/avanzada/);
 assert.equal(c.actors.NPC.hp,100);
});
