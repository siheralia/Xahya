import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 combatWearableStatSnapshots,reconcileWearableStatBonuses
} from "../lib/combat/wearable-stat-bonus.ts";
import {snapshotEquippedWearables} from "../lib/items/combat-wearables.ts";
import {
 newCombatState,reconcileWearableBonusesAtCombatStart,
 applyWearableOnConfirmedHpHit,applyWeaponSelfRepairAtRoundStart,
 applyCombatCommand,
} from "../lib/combat/turn-engine.ts";
import {defaultEquippedWear} from "../lib/items/equipped-wear.ts";
import {defaultEquippedItemAutoRepair} from "../lib/items/auto-repair.ts";

const fighter=(name,id,pos,more={})=>({
 characterId:id,name,hp:150,maxHp:150,agility:80,speedValue:90,
 strength:35,constitution:12,precision:95,dodge:20,physicalAttack:50,
 physicalDefense:40,magicAttack:25,magicDefense:30,critical:10,luck:12,race:20,
 massKg:70,positionMeters:pos,attackType:"BLUNT",defenseType:"SOLID",
 weaponIntegrity:100,spentTicks:0,spentAp:0,...more,
});
const armor=(id,durability,bonus,wear={})=>({
 itemId:id,characterItemId:id+1000,name:"Cota "+id,itemType:"ARMOR",
 slot:id===200?"BODY":"ACCESSORY_1",durability,
 statBonuses:{physicalDefense:bonus},wearOnHit:defaultEquippedWear(),...wear,
});
const state=(items)=> {
 const result=newCombatState(fighter("A",1,0),
  fighter("B",2,.4,{equippedWearables:items}));
 result.mana={PLAYER:{current:35,max:35},NPC:{current:35,max:35}};
 return result;
};
const logs=(s,kind)=>s.log.filter(e=>e.kind===kind);
const rolls={hit:.01,critical:.99,defense:.99};

test("compiler binds approved flat derived bonuses to their exact equipped copy",()=>{
 const catalog=[
  {id:12,name:"Cota",itemType:"ARMOR",
   effects:[{type:"stat_bonus",stat:"PHYS_DEF",value:12},
    {type:"stat_bonus",stat:"MAG_DEF",value:3},
    {type:"stat_multiplier",stat:"PHYS_DEF",value:2},
    {type:"stat_bonus",stat:"STR",value:30}]},
  {id:13,name:"Amuleto",itemType:"ACCESSORY",
   effects:[{type:"stat_bonus",stat:"DODGE",value:2}]},
  {id:14,name:"Espada",itemType:"WEAPON",
   effects:[{type:"stat_bonus",stat:"PHYS_DEF",value:200}]},
 ];
 const equipped=[
  {id:1001,itemId:12,quantity:1,equipped:true},
  {id:1002,itemId:13,quantity:1,equipped:true},
  {id:1003,itemId:14,quantity:1,equipped:true},
  {id:1004,itemId:12,quantity:1,equipped:false},
  {id:1005,itemId:12,quantity:2,equipped:true},
 ];
 const compiled=combatWearableStatSnapshots(equipped,catalog,
  {PHYS_DEF:"physicalDefense",MAG_DEF:"magicDefense",DODGE:"dodge"},
  {physicalDefense:1.5,magicDefense:1,dodge:1});
 assert.deepEqual(compiled,[
  {characterItemId:1001,itemId:12,bonuses:{physicalDefense:18,magicDefense:3}},
  {characterItemId:1002,itemId:13,bonuses:{dodge:2}},
 ]);
});

test("disabled or unrecognized derived codes cannot create a combat modifier",()=>{
 const bonus=combatWearableStatSnapshots([
  {id:12,itemId:9,quantity:1,equipped:true}
 ],[{id:9,itemType:"ARMOR",effects:[
  {type:"stat_bonus",stat:"UNKNOWN",value:500},
  {type:"stat_bonus",stat:"HP",value:300},
  {type:"stat_bonus",stat:"PHYS_DEF",value:5},
 ]}],{HP:"maxHp"},{physicalDefense:1});
 assert.deepEqual(bonus,[]);
});

test("combat snapshot accepts only matching item and character-copy bonus records",()=>{
 const catalog=[{id:200,itemType:"ARMOR",allowedSlots:["BODY"],name:"Peto"}];
 const owned=[{id:1200,itemId:200,quantity:1,equipped:true,equippedSlot:"BODY",durability:3}];
 const snaps=[
  {characterItemId:1200,itemId:999,bonuses:{physicalDefense:900}},
  {characterItemId:1200,itemId:200,bonuses:{physicalDefense:5}},
 ];
 const wrong=snapshotEquippedWearables(catalog,owned,[],snaps);
 assert.equal(wrong[0].statBonuses,undefined,"first mismatched id never authorizes other-item stats");
 const exact=snapshotEquippedWearables(catalog,owned,[],[snaps[1]]);
 assert.equal(exact[0].statBonuses.physicalDefense,5);
 assert.equal(exact[0].characterItemId,1200);
});

test("already broken armor loses only captured direct bonuses before round one",()=>{
 const s=state([armor(200,0,8)]);
 const previous=structuredClone(s);
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 assert.equal(s.actors.NPC.physicalDefense,32);
 assert.equal(s.actors.NPC.equippedWearables[0].statBonusActive,false);
 assert.equal(s.actors.NPC.hp,150);
 assert.equal(s.actors.NPC.spentAp,0);
 assert.equal(logs(s,"EQUIPMENT_STATS").length,1);
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 assert.equal(s.actors.NPC.physicalDefense,32);
 assert.equal(logs(s,"EQUIPMENT_STATS").length,1);
 assert.equal(previous.actors.NPC.physicalDefense,40);
});

test("intact equipment starts with its existing bonuses without adding them again",()=>{
 const s=state([armor(200,5,8)]);
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 assert.equal(s.actors.NPC.physicalDefense,40);
 assert.equal(s.actors.NPC.equippedWearables[0].statBonusActive,true);
 assert.equal(logs(s,"EQUIPMENT_STATS").length,0);
});

test("a confirmed lethal durability hit removes only worn armor's flat bonus",()=>{
 const s=state([armor(200,2,8)]);
 const original=structuredClone(s);
 const launched=applyCombatCommand(s,"PLAYER",{
  kind:"ATTACK",attackType:"BLUNT",
  trajectory:[{x:.1,y:.5},{x:.5,y:.5}]
 },rolls);
 const done=applyCombatCommand(launched,"NPC",{kind:"DEFEND",defense:"NONE"},rolls);
 const first=done.actors.NPC;
 assert.equal(first.equippedWearables[0].durability,0);
 assert.equal(first.physicalDefense,32);
 assert.equal(logs(done,"EQUIPMENT_STATS").length,1);
 assert.equal(logs(done,"EQUIPMENT_BREAK").length,1);
 assert.equal(first.hp,150-logs(done,"RESOLVE").at(-1).damage);
 assert.deepEqual(s,original,"combat action never mutates prior snapshot");
});

test("independent copies lose their own bonuses in either order, never twice",()=>{
 const s=state([armor(200,1,5),{...armor(201,90,7),itemType:"ACCESSORY"}]);
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 applyWearableOnConfirmedHpHit(s,"NPC",40,false);
 assert.equal(s.actors.NPC.physicalDefense,35);
 assert.equal(s.actors.NPC.equippedWearables[0].durability,0);
 assert.equal(s.actors.NPC.equippedWearables[1].durability,86);
 applyWearableOnConfirmedHpHit(s,"NPC",40,false);
 assert.equal(s.actors.NPC.physicalDefense,35);
 assert.equal(logs(s,"EQUIPMENT_STATS").length,1);
 s.actors.NPC.equippedWearables[1].durability=1;
 applyWearableOnConfirmedHpHit(s,"NPC",40,false);
 assert.equal(s.actors.NPC.physicalDefense,28);
 assert.equal(logs(s,"EQUIPMENT_STATS").length,2);
});

test("repairing a broken item restores the bonus once and charges encounter mana",()=>{
 const piece=armor(200,0,6,{autoRepair:defaultEquippedItemAutoRepair()});
 const s=state([piece]);reconcileWearableBonusesAtCombatStart(s,"NPC");
 assert.equal(s.actors.NPC.physicalDefense,34);
 s.round=2;
 applyWeaponSelfRepairAtRoundStart(s,"NPC");
 assert.equal(s.actors.NPC.physicalDefense,40);
 assert.equal(s.actors.NPC.equippedWearables[0].durability,5);
 assert.equal(s.actors.NPC.equippedWearables[0].statBonusActive,true);
 assert.equal(s.mana.NPC.current,30);
 assert.equal(s.itemRepairsThisRound[0].characterItemId,1200);
 assert.equal(logs(s,"EQUIPMENT_STATS").length,2);
 applyWeaponSelfRepairAtRoundStart(s,"NPC");
 assert.equal(s.actors.NPC.physicalDefense,40);
 assert.equal(s.mana.NPC.current,30);
});

test("not enough mana cannot restore a broken item's stats",()=>{
 const s=state([armor(200,0,6,{autoRepair:defaultEquippedItemAutoRepair()})]);
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 s.mana.NPC.current=1;s.round=2;
 applyWeaponSelfRepairAtRoundStart(s,"NPC");
 assert.equal(s.actors.NPC.physicalDefense,34);
 assert.equal(s.actors.NPC.equippedWearables[0].durability,0);
 assert.equal(s.mana.NPC.current,1);
});

test("offhand shield loss at BLOCK removes flat stats without erasing main gauge",()=>{
 const piece={...armor(200,2,8),slot:"OFF_HAND"};
 const s=state([piece]);
 const launched=applyCombatCommand(s,"PLAYER",{
  kind:"ATTACK",attackType:"BLUNT",
  trajectory:[{x:.1,y:.5},{x:.5,y:.5}]
 },rolls);
 const done=applyCombatCommand(launched,"NPC",
  {kind:"DEFEND",defense:"BLOCK",weaponSlot:"OFF_HAND"},
  {hit:.01,critical:.99,defense:.01});
 assert.equal(done.actors.NPC.equippedWearables[0].durability,0);
 assert.equal(done.actors.NPC.physicalDefense,32);
 assert.equal(done.actors.NPC.weaponIntegrity,100);
 assert.equal(logs(done,"EQUIPMENT_STATS").length,1);
 assert.equal(logs(done,"EQUIPMENT_BREAK").length,1);
});

test("legacy combat items and unsupported stat changes never alter fighter values",()=>{
 const s=state([{...armor(200,0,10),statBonuses:undefined}]);
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 assert.equal(s.actors.NPC.physicalDefense,40);
 assert.equal(s.actors.NPC.equippedWearables[0].statBonusActive,undefined);
 applyWearableOnConfirmedHpHit(s,"NPC",10,false);
 assert.equal(s.actors.NPC.physicalDefense,40);
 assert.equal(logs(s,"EQUIPMENT_STATS").length,0);
 const copy=armor(200,0,10,{statBonusActive:false});
 assert.equal(reconcileWearableStatBonuses(s.actors.NPC,copy),null);
});

test("temporary buffs remain in place when an equipped stat bonus disappears",()=>{
 const s=state([armor(200,1,8)]);
 s.actors.NPC.physicalDefense+=15;
 applyWearableOnConfirmedHpHit(s,"NPC",40,false);
 assert.equal(s.actors.NPC.physicalDefense,47,"only 8 points from armor disappear");
 assert.equal(s.actors.NPC.physicalAttack,50);
 assert.equal(s.actors.NPC.magicDefense,30);
});

test("duel creation passes approved stat snapshots and engine hooks reconcile",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const duel=read("app/api/combat/duels/route.ts");
 const effective=read("lib/stats/effective.ts");
 const engine=read("lib/combat/turn-engine.ts");
 assert.match(duel,/first\.combatWearableStatBonuses/);
 assert.match(duel,/rivalWearableStatBonuses/);
 assert.match(duel,/reconcileWearableBonusesAtCombatStart\(initial,"PLAYER"\)/);
 assert.match(effective,/combatWearableStatSnapshots\(/);
 assert.match(engine,/syncWearableBonuses\(state,defender,item\)/);
 assert.match(engine,/syncWearableBonuses\(state,side,weapon\)/);
});
