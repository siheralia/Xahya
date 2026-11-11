import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {newContinuousCombatTimeline,queueTimelineAction,completeNextTimelineBatch}
 from "../lib/combat/action-timeline.ts";
import {commitAuthorizedTimelineBatch,resolveAuthorizedTimelineBatch}
 from "../lib/combat/timeline-batch-resolver.ts";

const fighter=(name)=>({
 characterId:null,name,hp:20,maxHp:20,agility:20,strength:20,
 constitution:5,precision:20,dodge:20,physicalAttack:10,
 physicalDefense:5,magicAttack:10,magicDefense:10,critical:0,
 luck:0,race:10,massKg:60,positionMeters:0,weaponIntegrity:100,
 attackType:"BLUNT",defenseType:"SOLID",spentTicks:0,spentAp:0,
 equippedWeapon:{name:"Escudo",characterItemId:41,itemId:9,
   attackType:"BLUNT",mode:"MELEE",effectiveRangeMeters:1,
   maximumRangeMeters:1,durability:100},
});
const state=()=>newCombatState(fighter("A"),fighter("B"),"PLAYER",true);
const batch=()=>{
 let clock=newContinuousCombatTimeline(10,10);
 clock=queueTimelineAction(clock,"PLAYER",{id:"a",kind:"ATTACK",durationTicks:25,paCost:1});
 clock=queueTimelineAction(clock,"NPC",{id:"b",kind:"ATTACK",durationTicks:25,paCost:1});
 return completeNextTimelineBatch(clock);
};
test("simultaneous lethal blows cause a draw instead of canceling the second",()=>{
 const before=state(),b=batch();
 const next=commitAuthorizedTimelineBatch(before,b,[
   {eventId:"a",hpDamage:{NPC:20}},
   {eventId:"b",hpDamage:{PLAYER:20}},
 ]);
 assert.equal(next.actors.PLAYER.hp,0);
 assert.equal(next.actors.NPC.hp,0);
 assert.equal(next.status,"FINISHED");
 assert.equal(next.winner,null);
 assert.equal(next.tick,25);
 assert.equal(before.actors.NPC.hp,20);
});
test("damage and healing are committed once per side and capped at max HP",()=>{
 const before=state(),b=batch();
 const next=commitAuthorizedTimelineBatch(before,b,[
   {eventId:"a",hpDamage:{NPC:12},hpHealing:{PLAYER:9}},
   {eventId:"b",hpDamage:{PLAYER:7},hpHealing:{NPC:3}},
 ]);
 assert.equal(next.actors.NPC.hp,11);
 assert.equal(next.actors.PLAYER.hp,20);
 assert.equal(next.status,"ACTIVE");
});
test("multiple shield hits wear the same inventory copy without extra actions",()=>{
 const before=state(),b=batch();
 const next=commitAuthorizedTimelineBatch(before,b,[
   {eventId:"a",equipmentWear:[{owner:"NPC",characterItemId:41,amount:15}]},
   {eventId:"b",equipmentWear:[{owner:"NPC",characterItemId:41,amount:23}]},
 ]);
 assert.equal(next.actors.NPC.equippedWeapon.durability,62);
 assert.equal(before.actors.NPC.equippedWeapon.durability,100);
});
test("invalid or duplicated results abort the whole batch",()=>{
 const before=state(),b=batch();
 assert.throws(()=>commitAuthorizedTimelineBatch(before,b,[
   {eventId:"a",hpDamage:{NPC:1}},{eventId:"a",hpDamage:{NPC:1}},
 ]),/duplicado/);
 assert.throws(()=>commitAuthorizedTimelineBatch(before,b,[
   {eventId:"a",hpDamage:{NPC:-5}},{eventId:"b"},
 ]),/inválida/);
 assert.throws(()=>commitAuthorizedTimelineBatch(before,b,[
   {eventId:"a",equipmentWear:[{owner:"PLAYER",characterItemId:999,amount:1}]},
   {eventId:"b"},
 ]),/copia/);
 assert.equal(before.actors.NPC.hp,20);
});
test("all event resolvers observe the same pre-impact snapshot",async()=>{
 const before=state(),b=batch();
 const seen=[];
 const next=await resolveAuthorizedTimelineBatch(before,b,async snapshot=>{
   seen.push(snapshot.actors.PLAYER.hp);
   return {eventId:seen.length===1?"a":"b",hpDamage:{PLAYER:10}};
 });
 assert.deepEqual(seen,[20,20]);
 assert.equal(next.actors.PLAYER.hp,0);
});
