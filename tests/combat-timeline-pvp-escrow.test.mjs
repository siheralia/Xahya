import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {newExperimentalTimeline,submitExperimentalTimelineCommand}
 from "../lib/combat/timeline-experiment.ts";
import {publicPvPTimelineStatus,submitPvPTimelineCommand}
 from "../lib/combat/timeline-pvp.ts";
import {inventoryMutationsBetween}
 from "../lib/combat/timeline-inventory-commit.ts";

const fighter=(name,id,pos)=>({
 name,characterId:id,hp:200,maxHp:200,agility:100,
 speedValue:100,strength:35,constitution:20,precision:90,dodge:10,
 physicalAttack:40,physicalDefense:5,magicAttack:30,magicDefense:8,
 critical:0,luck:10,race:20,massKg:70,positionMeters:pos,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,
});
const setup=()=>{
 const c=newCombatState(fighter("A",7,0),fighter("B",8,.5),"PLAYER",true);
 c.mana={PLAYER:{current:20,max:20},NPC:{current:20,max:20}};
 return newExperimentalTimeline(c,{pvp:true});
};
const dice=()=>({hit:.01,critical:.99,defense:.99});
const strike={kind:"ATTACK",attackType:"BLUNT",
 attackSource:"FIST_RIGHT",trajectory:[{x:.1,y:.5},{x:.5,y:.5}]};
const document=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("PvP starts with two free owners, no NPC-generated command",()=>{
 const initial=setup();
 assert.deepEqual(initial.timeline.clock.events,[]);
 assert.equal(initial.combat.actors.NPC.characterId,8);
 assert.deepEqual(publicPvPTimelineStatus(initial.timeline,"PLAYER").waitingFor,
   ["PLAYER","NPC"]);
 assert.equal(initial.combat.tick,0);
});

test("the first PvP commitment stays secret and cannot advance the clock",async()=>{
 const initial=setup(),before=structuredClone(initial.combat);
 const first=await submitPvPTimelineCommand(initial.combat,
   initial.timeline,"PLAYER",strike,"v2-pvp-hit-request-0001",dice);
 assert.equal(first.batches,0);
 assert.equal(first.combat.tick,0);
 assert.deepEqual(first.combat,before);
 assert.deepEqual(first.timeline.clock.events.map(x=>x.owner),["PLAYER"]);
 const opponent=publicPvPTimelineStatus(first.timeline,"NPC");
 assert.deepEqual(opponent.waitingFor,["NPC"]);
 assert.deepEqual(opponent.running,[{owner:"PLAYER",kind:"RESERVED",
   startsAtTick:0,endsAtTick:0}]);
 assert.equal(opponent.pa.PLAYER.used,0,
   "the first player's reserved PA must remain secret");
 const own=publicPvPTimelineStatus(first.timeline,"PLAYER");
 assert.equal(own.running[0].kind,"ATTACK");
 assert.equal(own.pa.PLAYER.used,1);
 assert.ok(!JSON.stringify(opponent).includes("FIST_RIGHT"));
});

test("second authenticated owner commits and resolves same-tick effects once",async()=>{
 const initial=setup();
 const first=await submitPvPTimelineCommand(initial.combat,
   initial.timeline,"PLAYER",strike,"v2-pvp-hit-request-0001",dice);
 const waited=await submitPvPTimelineCommand(first.combat,
   first.timeline,"NPC",{kind:"WAIT"},"v2-pvp-npc-wait-0001",dice);
 assert.equal(waited.batches,1);
 assert.equal(waited.combat.tick,10);
 assert.ok(waited.combat.actors.NPC.hp<200);
 assert.equal(waited.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
 assert.equal(waited.timeline.clock.actors.NPC.spentApByRound["1"]??0,0);
 assert.deepEqual(publicPvPTimelineStatus(waited.timeline,"NPC")
   .waitingFor,["PLAYER"]);
 assert.equal(waited.timeline.receipts["V2_NPC:v2-pvp-npc-wait-0001"].owner,"NPC");
 const retry=await submitPvPTimelineCommand(waited.combat,
   waited.timeline,"NPC",{kind:"WAIT"},"v2-pvp-npc-wait-0001",dice);
 assert.equal(retry.replayed,true);
 assert.equal(retry.combat.tick,10);
 assert.equal(retry.combat.actors.NPC.hp,waited.combat.actors.NPC.hp);
 await assert.rejects(()=>submitPvPTimelineCommand(waited.combat,
   waited.timeline,"NPC",strike,"v2-pvp-npc-wait-0001",dice),
   /diferente/);
});

test("PvP receipt IDs are isolated by actual side, never an untrusted client side",async()=>{
 const {combat,timeline}=setup();
 const first=await submitPvPTimelineCommand(combat,timeline,"PLAYER",
   {kind:"WAIT"},"same-across-owners-0001",dice);
 const second=await submitPvPTimelineCommand(first.combat,
   first.timeline,"NPC",{kind:"WAIT"},"same-across-owners-0001",dice);
 assert.ok(second.timeline.receipts["V2_PLAYER:same-across-owners-0001"]);
 assert.ok(second.timeline.receipts["V2_NPC:same-across-owners-0001"]);
 assert.equal(second.combat.tick,100);
 await assert.rejects(()=>submitExperimentalTimelineCommand(
   second.combat,second.timeline,strike,"same-across-owners-0001",dice),
   /diferente|PA|pendiente/,
   "training-only helper must not replace either owner's PvP receipt");
});

test("real character inventory stays separate for both owners",()=>{
 const {combat}=setup();
 combat.consumables={PLAYER:[{
   itemId:51,characterItemId:3001,name:"Poción A",action:"HEAL_HP",
   amount:10,quantity:2,
 }],NPC:[{
   itemId:51,characterItemId:3002,name:"Poción B",action:"HEAL_HP",
   amount:10,quantity:2,
 }]};
 const next=structuredClone(combat);next.tick=10;
 next.consumables.PLAYER[0].quantity=1;
 next.consumables.NPC[0].quantity=1;
 assert.deepEqual(inventoryMutationsBetween(combat,next),[
   {kind:"CONSUME",characterId:7,characterItemId:3001,itemId:51,units:1},
   {kind:"CONSUME",characterId:8,characterItemId:3002,itemId:51,units:1},
 ]);
});

test("PvP route derives side inside locked session and hides private declarations",()=>{
 const api=document("app/api/combat/[id]/timeline/route.ts");
 const duel=document("app/api/combat/duels/route.ts");
 const hud=document("app/combat/[id]/CombatV2Encounter.tsx");
 assert.match(duel,/newExperimentalTimeline\(initial,\{/);
 assert.match(api,/Number\(rival\.userId\)===Number\(accessInfo\.user\.id\)/);
 assert.match(api,/const owner:Side=pvp\?/);
 assert.match(api,/submitPvPTimelineCommand\(/);
 assert.match(api,/publicPvPTimelineStatus/);
 assert.match(api,/commitV2InventoryMutations\(before,after,tx\)/);
 assert.doesNotMatch(api,/body\.side/);
 assert.match(hud,/viewerSide/);
 assert.match(hud,/visibilityState==="visible"/);
 assert.match(document("app/combat/[id]/CombatV2Reactions.tsx"),
   /ownerSide/);
});
