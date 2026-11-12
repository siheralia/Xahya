import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {defaultEquippedItemAutoRepair} from "../lib/items/auto-repair.ts";
import {buildEquipmentDerivedReplay}
 from "../lib/combat/equipment-derived-replay.ts";
import {newContinuousCombatTimeline,queueTimelineAction,completeNextTimelineBatch}
 from "../lib/combat/action-timeline.ts";
import {
 prepareTimelineImpactSnapshot,commitAuthorizedTimelineBatch,
} from "../lib/combat/timeline-batch-resolver.ts";
import {applyTimelineEquipmentWear,assertEquipmentOnlyShadowStats}
 from "../lib/combat/timeline-equipment-replay.ts";
import {newTimelineDeclarationSession,declareTimelineCommand}
 from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow} from "../lib/combat/timeline-basic-actions.ts";

const fighter=(name,x,mod={})=>({
 characterId:null,name,hp:60,maxHp:100,agility:100,speedValue:100,
 strength:30,constitution:12,precision:80,dodge:10,
 physicalAttack:20,physicalDefense:10,magicAttack:30,magicDefense:10,
 critical:0,luck:10,race:20,massKg:70,positionMeters:x,
 attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,
 spentTicks:0,spentAp:0,...mod,
});
const piece=(id,amount,durability,extra={})=>({
 characterItemId:id,itemId:501+id,
 name:"Armadura "+id,itemType:"ARMOR",slot:"BODY",
 durability,statBonuses:{physicalDefense:amount},
 statBonusActive:durability>0,...extra,
});
const fight=(pieces=[piece(91,7,3)])=>{
 const total=pieces.filter(p=>p.durability>0)
   .reduce((s,p)=>s+p.statBonuses.physicalDefense,10);
 const c=newCombatState(fighter("Jugador",0),
   fighter("Oponente",.4,{equippedWearables:pieces,physicalDefense:total}),"PLAYER",true);
 c.mana={PLAYER:{current:20,max:20},NPC:{current:20,max:20}};
 return c;
};
const batch=(at=10)=>{
 let c=newContinuousCombatTimeline(25,25);
 c=queueTimelineAction(c,"PLAYER",{id:"a",kind:"ATTACK",durationTicks:at,paCost:1});
 c=queueTimelineAction(c,"NPC",{id:"b",kind:"ATTACK",durationTicks:at,paCost:1});
 return completeNextTimelineBatch(c);
};
const longBatch=(at=100)=>{
 let c=newContinuousCombatTimeline(25,25);
 c=queueTimelineAction(c,"PLAYER",{id:"wait-a",kind:"WAIT",durationTicks:at,paCost:0});
 c=queueTimelineAction(c,"NPC",{id:"wait-b",kind:"WAIT",durationTicks:at,paCost:0});
 return completeNextTimelineBatch(c);
};
const noop=[{eventId:"wait-a"},{eventId:"wait-b"}];
const dice=()=>({hit:.01,critical:.99,defense:.99});

test("two hits break the same armor only once, replay its bonus exactly",()=>{
 const c=fight(),original=structuredClone(c);
 const done=commitAuthorizedTimelineBatch(c,batch(),[
   {eventId:"a",hpDamage:{NPC:5},equipmentWear:[
     {owner:"NPC",characterItemId:91,amount:2}]},
   {eventId:"b",equipmentWear:[
     {owner:"NPC",characterItemId:91,amount:2}]},
 ]);
 assert.equal(done.actors.NPC.equippedWearables[0].durability,0);
 assert.equal(done.actors.NPC.physicalDefense,10);
 assert.equal(done.actors.NPC.hp,55);
 assert.equal(c.actors.NPC.physicalDefense,17);
 assert.deepEqual(c,original);
});

test("breaking two different armor pieces preserves all independent non-equipment stats",()=>{
 const c=fight([piece(91,7,1),piece(92,4,1)]);
 c.actors.NPC.physicalAttack+=15; // already-active unrelated buff
 const done=commitAuthorizedTimelineBatch(c,batch(),[
   {eventId:"a",equipmentWear:[{owner:"NPC",characterItemId:91,amount:1}]},
   {eventId:"b",equipmentWear:[{owner:"NPC",characterItemId:92,amount:1}]},
 ]);
 assert.equal(done.actors.NPC.physicalDefense,10);
 assert.equal(done.actors.NPC.physicalAttack,35);
 assert.equal(done.actors.NPC.equippedWearables[0].statBonusActive,false);
 assert.equal(done.actors.NPC.equippedWearables[1].statBonusActive,false);
});

test("derived replay recomputes additive factor graph rather than subtracting approximate bonus",()=>{
 const replay=buildEquipmentDerivedReplay({
   unmodifiedDerived:{physicalDefense:20},
   currentDerived:{physicalDefense:40},
   derivedModifiers:{physicalDefense:{factors:[2],bonus:0}},
   attackFactors:[],mechanicByStat:{physicalDefense:1},
   activeDerivedAliases:{DEF:"physicalDefense"},
   copies:[{characterItemId:91,itemId:592,
     effects:[{type:"stat_multiplier",stat:"DEF",value:2}]}],
 });
 assert.ok(replay);
 const c=fight([piece(91,7,1)]);
 c.actors.NPC.equipmentDerivedReplay=replay;
 c.actors.NPC.physicalDefense=40;
 const done=commitAuthorizedTimelineBatch(c,batch(),[
   {eventId:"a",equipmentWear:[{owner:"NPC",characterItemId:91,amount:1}]},
   {eventId:"b"},
 ]);
 assert.equal(done.actors.NPC.physicalDefense,20);
 assert.equal(done.actors.NPC.equipmentDerivedReplay.applied.physicalDefense,20);
 assert.equal(c.actors.NPC.physicalDefense,40);
});

test("repair happens at exact tick 100, uses one mana and restores armor bonus",()=>{
 const item=piece(91,7,0,{autoRepair:defaultEquippedItemAutoRepair()});
 const c=fight([item]),original=structuredClone(c);
 const crossing=longBatch();
 const impact=prepareTimelineImpactSnapshot(c,crossing);
 assert.equal(impact.actors.NPC.equippedWearables[0].durability,5);
 assert.equal(impact.actors.NPC.physicalDefense,17);
 assert.equal(impact.mana.NPC.current,15);
 assert.equal(impact.actors.NPC.hp,60);
 assert.equal(impact.itemRepairsThisRound[0].round,2);
 assert.equal(impact.itemRepairsThisRound[0].restored,5);
 const finished=commitAuthorizedTimelineBatch(c,crossing,noop);
 assert.equal(finished.actors.NPC.equippedWearables[0].durability,5);
 assert.equal(finished.mana.NPC.current,15);
 assert.equal(finished.log.filter(e=>e.kind==="EQUIPMENT_REPAIR").length,1);
 assert.equal(finished.log.filter(e=>e.kind==="ROUND").length,1);
 assert.equal(finished.log.findIndex(e=>e.kind==="ROUND")<
   finished.log.findIndex(e=>e.kind==="EQUIPMENT_REPAIR"),true);
 assert.deepEqual(c,original);
});

test("insufficient mana cannot self-repair or activate broken gear bonus",()=>{
 const c=fight([piece(91,7,0,{autoRepair:defaultEquippedItemAutoRepair()})]);
 c.mana.NPC.current=4;
 const next=commitAuthorizedTimelineBatch(c,longBatch(),noop);
 assert.equal(next.actors.NPC.equippedWearables[0].durability,0);
 assert.equal(next.actors.NPC.physicalDefense,10);
 assert.equal(next.mana.NPC.current,4);
 assert.equal(next.itemRepairsThisRound.length,0);
});

test("immediate next physical attack after repairs uses restored bonus",async()=>{
 const c=fight([piece(91,7,0,{autoRepair:defaultEquippedItemAutoRepair()})]);
 let t=newTimelineDeclarationSession(c);
 t=declareTimelineCommand(t,c,"PLAYER",{kind:"WAIT"},"wait-1");
 t=declareTimelineCommand(t,c,"NPC",{kind:"WAIT"},"wait-2");
 const after=await resolveBasicTimelineWindow(c,t,dice);
 assert.equal(after.combat.tick,100);
 assert.equal(after.combat.actors.NPC.physicalDefense,17);
 assert.equal(after.combat.mana.NPC.current,15);
 assert.equal(after.timeline.clock.actors.NPC.spentApByRound["1"]??0,0);
});

test("shadow replay refuses unexplained stat change, accepts real break",()=>{
 const c=fight([piece(91,7,1)]);
 const after=structuredClone(c);
 after.actors.NPC.equippedWearables[0].durability=0;
 after.actors.NPC.physicalDefense=10;
 const wear=[{owner:"NPC",characterItemId:91,amount:1}];
 assert.doesNotThrow(()=>assertEquipmentOnlyShadowStats(c,after,wear));
 after.actors.NPC.magicAttack+=999;
 assert.throws(()=>assertEquipmentOnlyShadowStats(c,after,wear),
   /atributos fuera de su equipo/);
});

test("declared repair cannot counterfeit timing or double charge on two impact snapshots",()=>{
 const c=fight([piece(91,7,0,{autoRepair:defaultEquippedItemAutoRepair()})]);
 const b=longBatch();
 const a=prepareTimelineImpactSnapshot(c,b);
 const again=prepareTimelineImpactSnapshot(c,b);
 assert.deepEqual(a,again);
 assert.equal(a.mana.NPC.current,15);
 assert.equal(c.mana.NPC.current,20);
});
