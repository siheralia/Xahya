import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {inventoryMutationsBetween}
 from "../lib/combat/timeline-inventory-commit.ts";
import {newExperimentalTimeline,submitExperimentalTimelineCommand}
 from "../lib/combat/timeline-experiment.ts";

const fighter=(name,id,x)=>({
 characterId:id,name,hp:70,maxHp:100,agility:100,
 strength:40,constitution:15,precision:90,dodge:10,
 physicalAttack:25,physicalDefense:6,magicAttack:25,magicDefense:7,
 critical:0,luck:10,race:20,massKg:70,positionMeters:x,
 weaponIntegrity:80,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,
});
const combat=()=>{
 const c=newCombatState(fighter("Hero",41,0),fighter("NPC",null,.6),"PLAYER",true);
 c.mana={PLAYER:{current:5,max:20},NPC:{current:10,max:20}};
 c.consumables={PLAYER:[
   {itemId:51,characterItemId:8001,name:"Poción",action:"HEAL_HP",
     quantity:2,amount:20},
   {itemId:52,characterItemId:8002,name:"Elixir",action:"RESTORE_MANA",
     quantity:1,amount:10},
 ],NPC:[]};
 c.actors.PLAYER.equippedWeapon={
   characterItemId:7001,itemId:301,durability:80,
   name:"Espada de prueba",attackType:"BLUNT",mode:"MELEE",
   effectiveRangeMeters:1.5,maximumRangeMeters:1.5,
 };
 return newExperimentalTimeline(c);
};
const dice=()=>({hit:.01,critical:.99,defense:.99});
const item=(id=51,copy=8001)=>({kind:"USE_ITEM",itemId:id,
 characterItemId:copy,requestId:"v2-inventory-item-001"});
const doc=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("inventory audit determines exact official potion copy and wear",()=>{
 const {combat:before}=combat();
 const after=structuredClone(before);
 after.tick=10;after.actors.PLAYER.equippedWeapon.durability=63;
 after.consumables.PLAYER[0].quantity=1;
 assert.deepEqual(inventoryMutationsBetween(before,after),[
   {kind:"CONSUME",characterId:41,characterItemId:8001,
     itemId:51,units:1},
   {kind:"DURABILITY",characterId:41,characterItemId:7001,
     itemId:301,before:80,after:63,wear:17,repaired:0},
 ]);
 assert.deepEqual(inventoryMutationsBetween(before,before),[],
   "unchanged snapshots cannot write inventory");
});

test("an official repair receipt can increase durability only once",()=>{
 const {combat:before}=combat();
 const after=structuredClone(before);
 after.tick=100;after.round=2;
 after.actors.PLAYER.equippedWeapon.durability=90;
 after.actors.PLAYER.equippedWeapon.autoRepair={
   intervalTurns:1,manaCost:1,repairAmount:10,
 };
 after.actors.PLAYER.equippedWeapon.lastAutoRepairRound=2;
 after.itemRepairsThisRound=[{by:"PLAYER",round:2,
   characterItemId:7001,restored:10}];
 assert.deepEqual(inventoryMutationsBetween(before,after),[
   {kind:"DURABILITY",characterId:41,characterItemId:7001,
     itemId:301,before:80,after:90,wear:0,repaired:10},
 ]);
 const unsupported=structuredClone(after);
 unsupported.itemRepairsThisRound=[];
 assert.throws(()=>inventoryMutationsBetween(before,unsupported),
   /durabilidad|reparación/i);
});

test("forged stock and item swaps are rejected without DB writes",()=>{
 const {combat:before}=combat();
 const bad=structuredClone(before);
 bad.consumables.PLAYER[0].quantity=3;
 assert.throws(()=>inventoryMutationsBetween(before,bad),/cantidad/);
 const modified=structuredClone(before);
 modified.actors.PLAYER.equippedWeapon.itemId=999;
 assert.throws(()=>inventoryMutationsBetween(before,modified),
   /definición/);
 const added=structuredClone(before);
 added.consumables.PLAYER.push({
   itemId:88,characterItemId:9003,name:"Inventado",
   action:"HEAL_HP",amount:100,quantity:2,
 });
 assert.throws(()=>inventoryMutationsBetween(before,added),/añadió inventario/);
});

test("a V2 potion consumes exactly one unit on completed tick, not on retry",async()=>{
 const seed=combat();
 const mutations=[];
 const onBatch=async(before,after)=>
   mutations.push(...inventoryMutationsBetween(before,after));
 const first=await submitExperimentalTimelineCommand(seed.combat,
   seed.timeline,item(),"v2-inventory-item-001",dice,{},onBatch);
 assert.equal(first.replayed,false);
 assert.equal(first.combat.tick,10);
 assert.equal(first.combat.consumables.PLAYER[0].quantity,1);
 assert.equal(first.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
 assert.deepEqual(mutations.filter(m=>m.kind==="CONSUME"),[
   {kind:"CONSUME",characterId:41,characterItemId:8001,itemId:51,units:1},
 ]);
 const repeat=await submitExperimentalTimelineCommand(first.combat,
   first.timeline,item(),"v2-inventory-item-001",dice,{},onBatch);
 assert.equal(repeat.replayed,true);
 assert.equal(mutations.filter(m=>m.kind==="CONSUME").length,1);
});

test("V2 inventory writes belong inside locked CombatSession and per world batch",()=>{
 const route=doc("app/api/combat/[id]/timeline/route.ts");
 const timeline=doc("lib/combat/timeline-experiment.ts");
 const sql=doc("lib/combat/timeline-inventory-commit.ts");
 assert.match(route,/UPDATE public\."combatSession" SET id=id/);
 assert.match(route,/commitV2InventoryMutations\(before,after,tx\)/);
 assert.match(timeline,/await onCommittedBatch\?\.\(combat,resolved\.combat\)/);
 assert.match(sql,/quantity>=\$\{change\.units\}/);
 assert.match(sql,/durability=LEAST\(durability,\$\{change\.after\}\)/);
 assert.match(sql,/LEAST\(durability,\$\{change\.before\}\)/);
 assert.match(doc("app/combat/[id]/CombatV2Encounter.tsx"),
   /<CombatV2Items/);
});
