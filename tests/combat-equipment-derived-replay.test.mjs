import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 buildEquipmentDerivedReplay,evaluateEquipmentDerived,reconcileEquipmentDerived
} from "../lib/combat/equipment-derived-replay.ts";
import {
 newCombatState,applyWearableOnConfirmedHpHit,
 applyWeaponSelfRepairAtRoundStart,reconcileWearableBonusesAtCombatStart,
} from "../lib/combat/turn-engine.ts";
import {defaultEquippedWear} from "../lib/items/equipped-wear.ts";
import {defaultEquippedItemAutoRepair} from "../lib/items/auto-repair.ts";

const copy=(id,itemId,durability,effects,extras={})=>({
 characterItemId:id,itemId,durability,name:"Pieza "+itemId,
 itemType:"ARMOR",slot:itemId===700?"BODY":"ACCESSORY_1",
 wearOnHit:defaultEquippedWear(),...extras,
});
const records=[
 {characterItemId:1700,itemId:700,effects:[
  {type:"stat_multiplier",stat:"PHYS_ATK",value:2},
  {type:"stat_bonus",stat:"PHYS_ATK",value:10},
  {type:"stat_multiplier",stat:"PHYS_DEF",value:2},
 ]},
 {characterItemId:1701,itemId:701,effects:[
  {type:"stat_multiplier",stat:"PHYS_ATK",value:3},
  {type:"stat_bonus",stat:"PHYS_DEF",value:2},
  {type:"stat_multiplier",stat:"ATTACK_TOTAL",value:2},
 ]},
];
const input={
 unmodifiedDerived:{physicalAttack:100,magicAttack:60,physicalDefense:40},
 currentDerived:{physicalAttack:4655,magicAttack:210,physicalDefense:146},
 derivedModifiers:{
  physicalAttack:{factors:[1.5,2,3],bonus:15},
  physicalDefense:{factors:[1.5,2],bonus:6},
 },
 attackFactors:[1.5,2],
 mechanicByStat:{physicalAttack:2,magicAttack:1,physicalDefense:1},
 activeDerivedAliases:{PHYS_ATK:"physicalAttack",PHYS_DEF:"physicalDefense",MAG_ATK:"magicAttack"},
 copies:records,
};
const model=()=>{
 const result=buildEquipmentDerivedReplay(input);
 assert.ok(result,"exact catalog replay must reproduce live effective statistics");
 return result;
};
const pieceA=(durability=60,extras={})=>copy(1700,700,durability,records[0].effects,extras);
const pieceB=(durability=60,extras={})=>copy(1701,701,durability,records[1].effects,extras);
const fighter=(name,id,x,additional={})=>({
 characterId:id,name,hp:200,maxHp:200,
 agility:80,speedValue:90,strength:35,constitution:12,precision:85,
 dodge:20,physicalAttack:4655,physicalDefense:146,magicAttack:210,
 magicDefense:15,critical:0,luck:10,race:20,massKg:70,
 positionMeters:x,attackType:"BLUNT",defenseType:"SOLID",
 weaponIntegrity:100,spentTicks:0,spentAp:0,...additional,
});
const state=(items=[pieceA(),pieceB()])=>{
 const s=newCombatState(fighter("A",1,0),
  fighter("B",2,.4,{equippedWearables:items,equipmentDerivedReplay:model()}));
 s.mana={PLAYER:{current:20,max:20},NPC:{current:20,max:20}};
 return s;
};
const stat=(s,key)=>s.actors.NPC[key];
const logs=(s,k)=>s.log.filter(e=>e.kind===k);

test("compiler exactly reproduces additive multiplier semantics and global factors",()=>{
 const m=model();
 assert.deepEqual(evaluateEquipmentDerived(m,new Set([1700,1701])),{
  physicalAttack:4655,magicAttack:210,physicalDefense:146,
 });
 assert.equal(m.otherAttackFactorCount,1);
 assert.equal(m.otherAttackFactorSum,1.5);
 assert.equal(m.formulas.physicalAttack.factorSum,1.5);
 assert.equal(m.formulas.physicalAttack.factorCount,1);
 assert.equal(m.formulas.physicalAttack.flat,5);
});

test("breaking one of two different multiplying items recalculates whole derived stat",()=>{
 const s=state();
 const original=structuredClone(s);
 s.actors.NPC.equippedWearables[0].durability=0;
 const changes=reconcileEquipmentDerived(s.actors.NPC,s.actors.NPC.equippedWearables);
 assert.equal(stat(s,"physicalAttack"),3185);
 assert.equal(stat(s,"physicalDefense"),66);
 assert.equal(stat(s,"magicAttack"),210);
 assert.equal(changes.physicalAttack,-1470);
 assert.equal(changes.physicalDefense,-80);
 assert.equal(original.actors.NPC.physicalAttack,4655);
 assert.deepEqual(reconcileEquipmentDerived(s.actors.NPC,s.actors.NPC.equippedWearables),{});
 assert.equal(stat(s,"physicalAttack"),3185,"must not remove the same bonus again");
});

test("breaking ATTACK_TOTAL accessory updates BOTH attacks and remaining multipliers",()=>{
 const s=state();
 s.actors.NPC.equippedWearables[1].durability=0;
 reconcileEquipmentDerived(s.actors.NPC,s.actors.NPC.equippedWearables);
 assert.equal(stat(s,"physicalAttack"),1095); // (100*(1.5+2)+15)*2*1.5
 assert.equal(stat(s,"magicAttack"),90); // 60 * 1.5
 assert.equal(stat(s,"physicalDefense"),144); // 40*(1.5+2)+4
});

test("two broken pieces replay all remaining external factors, never invert a ratio",()=>{
 const s=state();
 s.actors.NPC.equippedWearables[0].durability=0;
 s.actors.NPC.equippedWearables[1].durability=0;
 reconcileEquipmentDerived(s.actors.NPC,s.actors.NPC.equippedWearables);
 assert.equal(stat(s,"physicalAttack"),465); // (100*1.5+5)*2*1.5
 assert.equal(stat(s,"magicAttack"),90);
 assert.equal(stat(s,"physicalDefense"),64);
});

test("re-enabling either copy restores precisely its original contributions",()=>{
 const s=state([pieceA(0),pieceB(0)]);
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 assert.equal(stat(s,"physicalAttack"),465);
 s.actors.NPC.equippedWearables[0].durability=1;
 reconcileEquipmentDerived(s.actors.NPC,s.actors.NPC.equippedWearables);
 assert.equal(stat(s,"physicalAttack"),1095); // (100*(1.5+2)+15)*2*1.5
 assert.equal(stat(s,"physicalDefense"),144);
 s.actors.NPC.equippedWearables[1].durability=1;
 reconcileEquipmentDerived(s.actors.NPC,s.actors.NPC.equippedWearables);
 assert.equal(stat(s,"physicalAttack"),4655);
 assert.equal(stat(s,"magicAttack"),210);
 assert.equal(stat(s,"physicalDefense"),146);
});

test("stat buffs accumulated during combat remain when gear breaks and returns",()=>{
 const s=state();
 s.actors.NPC.physicalAttack+=17;
 s.actors.NPC.physicalDefense+=11;
 s.actors.NPC.equippedWearables[0].durability=0;
 reconcileEquipmentDerived(s.actors.NPC,s.actors.NPC.equippedWearables);
 assert.equal(stat(s,"physicalAttack"),3202);
 assert.equal(stat(s,"physicalDefense"),77);
 s.actors.NPC.equippedWearables[0].durability=80;
 reconcileEquipmentDerived(s.actors.NPC,s.actors.NPC.equippedWearables);
 assert.equal(stat(s,"physicalAttack"),4672);
 assert.equal(stat(s,"physicalDefense"),157);
});

test("real HP wear disables multipliers once and logs equipment stats",()=>{
 const s=state([pieceA(1),pieceB()]);
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 applyWearableOnConfirmedHpHit(s,"NPC",20,false);
 assert.equal(s.actors.NPC.equippedWearables[0].durability,0);
 assert.equal(stat(s,"physicalAttack"),3185);
 assert.equal(stat(s,"physicalDefense"),66);
 assert.equal(logs(s,"EQUIPMENT_STATS").length,1);
 assert.equal(logs(s,"EQUIPMENT_BREAK").length,1);
 applyWearableOnConfirmedHpHit(s,"NPC",20,false);
 assert.equal(logs(s,"EQUIPMENT_BREAK").length,1);
 assert.equal(stat(s,"physicalAttack"),3185);
});

test("paid authorized repair re-enables exact multipliers once per round",()=>{
 const s=state([pieceA(0,{autoRepair:defaultEquippedItemAutoRepair()}),pieceB()]);
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 assert.equal(stat(s,"physicalAttack"),3185);
 s.round=2;
 applyWeaponSelfRepairAtRoundStart(s,"NPC");
 assert.equal(stat(s,"physicalAttack"),4655);
 assert.equal(stat(s,"physicalDefense"),146);
 assert.equal(s.mana.NPC.current,15);
 assert.equal(s.itemRepairsThisRound[0].characterItemId,1700);
 assert.equal(logs(s,"EQUIPMENT_REPAIR").length,1);
 applyWeaponSelfRepairAtRoundStart(s,"NPC");
 assert.equal(stat(s,"physicalAttack"),4655);
 assert.equal(s.mana.NPC.current,15);
});

test("failed repair or an ineligible copy changes no derived value",()=>{
 const s=state([pieceA(0,{autoRepair:defaultEquippedItemAutoRepair()}),pieceB()]);
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 s.round=2;s.mana.NPC.current=4;
 applyWeaponSelfRepairAtRoundStart(s,"NPC");
 assert.equal(stat(s,"physicalAttack"),3185);
 assert.equal(s.mana.NPC.current,4);
 const before=stat(s,"physicalAttack");
 s.actors.NPC.equippedWearables[0].itemId=9999;
 reconcileEquipmentDerived(s.actors.NPC,s.actors.NPC.equippedWearables);
 assert.equal(stat(s,"physicalAttack"),before);
});

test("legacy sessions without replay keep their direct-flat stat contract",()=>{
 const s=state([pieceA(1),pieceB()]);
 s.actors.NPC.equipmentDerivedReplay=undefined;
 s.actors.NPC.equippedWearables[0].statBonuses={physicalDefense:6};
 applyWearableOnConfirmedHpHit(s,"NPC",20,false);
 assert.equal(stat(s,"physicalDefense"),140);
 assert.equal(stat(s,"physicalAttack"),4655);
});

test("a broken item whose stat contribution is unsupported cannot change other stats",()=>{
 const m=buildEquipmentDerivedReplay({
  ...input,
  copies:records.map((record,i)=>({...record,itemId:800+i})),
 });
 assert.ok(m,"item IDs are labels; math uses exact validated copy snapshots");
 const invalid=buildEquipmentDerivedReplay({
  ...input,
  currentDerived:{...input.currentDerived,physicalAttack:9999},
 });
 assert.equal(invalid,null,"fail closed when stored totals cannot match effective stats");
 const bad=buildEquipmentDerivedReplay({...input,copies:[records[0],records[0]]});
 assert.equal(bad,null,"a duplicate inventory instance must not receive two modifiers");
});

test("duel and engine attach replay only from stat resolver, never from a combat command",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const duel=read("app/api/combat/duels/route.ts");
 const stats=read("lib/stats/effective.ts");
 const engine=read("lib/combat/turn-engine.ts");
 assert.match(stats,/buildEquipmentDerivedReplay\(/);
 assert.match(duel,/attachReplay\("PLAYER",first\.combatEquipmentDerivedReplay\)/);
 assert.match(duel,/copy\.characterItemId===item\.characterItemId|item\.characterItemId===copy\.characterItemId/);
 assert.match(engine,/reconcileEquipmentDerived\(fighter,fighter\.equippedWearables/);
});
