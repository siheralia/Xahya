import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {newExperimentalTimeline} from "../lib/combat/timeline-experiment.ts";
import {submitPvPTimelineCommand,publicPvPTimelineStatus}
 from "../lib/combat/timeline-pvp.ts";
import {publicV2CombatState}
 from "../lib/combat/timeline-client-projection.ts";

const fighter=(name,characterId,x,agility=100)=>({
 characterId,name,hp:800,maxHp:800,agility,speedValue:agility,
 strength:35,constitution:30,precision:90,dodge:12,
 physicalAttack:45,physicalDefense:10,magicAttack:25,magicDefense:12,
 critical:0,luck:10,race:20,massKg:70,positionMeters:x,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,
});
const setup=(withGuard=false)=>{
 const one=fighter("Dueña A",7,0);
 const two=fighter("Dueño B",8,.5,withGuard?50:100);
 if(withGuard)two.offhandWeapon={
   name:"Escudo",characterItemId:8001,itemId:33,durability:100,
   attackType:"BLUNT",mode:"MELEE",
   effectiveRangeMeters:1.5,maximumRangeMeters:1.5,
 };
 const c=newCombatState(one,two,"PLAYER",true);
 c.mana={PLAYER:{current:100,max:100},NPC:{current:100,max:100}};
 c.consumables={PLAYER:[{name:"Poción propia",itemId:51,
   characterItemId:7001,action:"HEAL_HP",amount:10,quantity:2}],
   NPC:[{name:"Poción oculta",itemId:51,
     characterItemId:8002,action:"HEAL_HP",amount:10,quantity:3}]};
 return newExperimentalTimeline(c,{pvp:true});
};
const dice=()=>({hit:.05,critical:.99,defense:.99});
const attack={kind:"ATTACK",attackType:"BLUNT",
 attackSource:"FIST_RIGHT",trajectory:[{x:.1,y:.5},{x:.5,y:.5}]};
const guard={kind:"GUARD",weaponSlot:"OFF_HAND"};
const submit=(c,t,side,cmd,id)=>submitPvPTimelineCommand(
 c,t,side,cmd,id,dice);

test("two-user handoff: private declarations, strict replay, persistent guard",async()=>{
 const seed=setup(true),original=structuredClone(seed.combat);
 const first=await submit(seed.combat,seed.timeline,"PLAYER",
   attack,"two-owners-attack-00001");
 assert.equal(first.batches,0);
 assert.equal(first.combat.tick,0);
 const privateView=publicPvPTimelineStatus(first.timeline,"NPC");
 assert.equal(privateView.running[0].kind,"RESERVED");
 assert.equal(privateView.running[0].endsAtTick,0);
 assert.ok(!JSON.stringify(privateView).includes("FIST_RIGHT"));
 assert.deepEqual(publicV2CombatState(first.combat,"NPC").consumables.PLAYER,[]);
 assert.deepEqual(seed.combat,original,
   "declaration must not mutate the original duel snapshot");

 const repeat=await submit(first.combat,first.timeline,"PLAYER",
   attack,"two-owners-attack-00001");
 assert.equal(repeat.replayed,true);
 assert.equal(repeat.combat.tick,0);
 await assert.rejects(()=>submit(first.combat,first.timeline,
   "PLAYER",{kind:"WAIT"},"two-owners-attack-00001"),/diferente/);

 const blocked=await submit(first.combat,first.timeline,"NPC",
   guard,"two-owners-shield-00001");
 assert.ok(blocked.combat.tick>0&&blocked.combat.tick<20);
 assert.equal(blocked.timeline.clock.actors.NPC.spentApByRound["1"],1);
 assert.deepEqual(publicPvPTimelineStatus(blocked.timeline,"NPC").waitingFor,
   ["PLAYER"]);
 // A second stroke continues from the end of the previous stroke,
 // rather than teleporting the punching hand back to its first origin.
 const following={...attack,trajectory:[{x:.5,y:.5},{x:.8,y:.5}]};
 const second=await submit(blocked.combat,blocked.timeline,"PLAYER",
   following,"two-owners-attack-00002");
 assert.equal(second.combat.tick,20);
 assert.equal(second.timeline.clock.actors.NPC.spentApByRound["1"],1,
   "guard holds across two independent strikes for one AP");
 assert.equal(second.timeline.clock.actors.PLAYER.spentApByRound["1"],2);
 assert.ok(second.combat.actors.PLAYER.hp>0);
 assert.ok(second.combat.actors.NPC.hp>0);
 assert.equal(second.combat.status,"ACTIVE");
 assert.equal(second.timeline.receipts["V2_PLAYER:two-owners-attack-00002"].owner,
   "PLAYER");
 assert.equal(second.timeline.receipts["V2_NPC:two-owners-shield-00001"].owner,
   "NPC");
});

test("six continuous PvP rounds: no phantom turn/PA or unauthorized rival action",async()=>{
 let {combat,timeline}=setup();
 let prevTick=0;
 for(let cycle=1;cycle<=6;cycle++){
   const before=structuredClone(combat);
   const id="prehuman-round-"+String(cycle).padStart(4,"0");
   // Changing which owner declares first must not grant initiative.
   const firstOwner=cycle%2?"PLAYER":"NPC";
   const secondOwner=firstOwner==="PLAYER"?"NPC":"PLAYER";
   const sent=await submit(combat,timeline,firstOwner,{kind:"WAIT"},id);
   assert.equal(sent.batches,0);
   assert.equal(sent.combat.tick,prevTick);
   assert.deepEqual(combat,before);
   assert.deepEqual(publicPvPTimelineStatus(sent.timeline,secondOwner)
     .waitingFor,[secondOwner]);
   const resolved=await submit(sent.combat,sent.timeline,
     secondOwner,{kind:"WAIT"},id);
   assert.ok(resolved.batches>=1);
   assert.equal(resolved.combat.tick,cycle*100);
   assert.equal(resolved.combat.round,cycle+1);
   assert.ok(resolved.combat.tick>prevTick);
   assert.equal(resolved.combat.status,"ACTIVE");
   assert.equal(resolved.combat.actors.PLAYER.hp,800);
   assert.equal(resolved.combat.actors.NPC.hp,800);
   assert.equal(resolved.timeline.clock.actors.PLAYER.spentApByRound[String(cycle)]??0,0);
   assert.equal(resolved.timeline.clock.actors.NPC.spentApByRound[String(cycle)]??0,0);
   assert.ok(resolved.timeline.receipts["V2_PLAYER:"+id]);
   assert.ok(resolved.timeline.receipts["V2_NPC:"+id]);
   combat=resolved.combat;timeline=resolved.timeline;prevTick=combat.tick;
 }
 assert.equal(Object.keys(timeline.receipts).length,12);
 assert.equal(publicPvPTimelineStatus(timeline,"PLAYER").waitingFor.length,2);
});

test("V2 public responses do not expose rival inventories or frozen spells",()=>{
 const {combat}=setup();
 const ownerA=JSON.stringify(publicV2CombatState(combat,"PLAYER"));
 const ownerB=JSON.stringify(publicV2CombatState(combat,"NPC"));
 const observer=JSON.stringify(publicV2CombatState(combat,"SPECTATOR"));
 assert.ok(ownerA.includes("Poción propia"));
 assert.ok(!ownerA.includes("Poción oculta"));
 assert.ok(ownerB.includes("Poción oculta"));
 assert.ok(!ownerB.includes("Poción propia"));
 assert.ok(!observer.includes("Poción propia"));
 assert.ok(!observer.includes("Poción oculta"));
});

test("mobile and polling UI never downgrade a completed POST to a stale GET",()=>{
 const root=new URL("../",import.meta.url);
 const encounter=readFileSync(new URL(
   "app/combat/[id]/CombatV2Encounter.tsx",root),"utf8");
 const reactions=readFileSync(new URL(
   "app/combat/[id]/CombatV2Reactions.tsx",root),"utf8");
 const api=readFileSync(new URL(
   "app/api/combat/[id]/timeline/route.ts",root),"utf8");
 assert.match(encounter,/responseSequence\.current/);
 assert.match(encounter,/sequence!==responseSequence\.current/);
 assert.match(encounter,/If-None-Match/);
 assert.match(encounter,/response\.status===304/);
 assert.match(encounter,/document\.visibilityState==="visible"/);
 assert.match(reactions,/aria-label="Posiciones actuales de tu personaje y su rival"/);
 assert.match(reactions,/Rival\s*<\/text>/);
 assert.match(api,/commitV2InventoryMutations\(before,after,tx\)/);
 assert.doesNotMatch(api,/body\.side/);
});
