import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {calculateConfiguredDerivedSnapshot}
 from "../lib/stats/configured-derived-pure.ts";
import {buildEquipmentBasicReplay} from "../lib/combat/equipment-basic-replay.ts";
import * as replayEngine from "../lib/combat/equipment-derived-replay.ts";
const {buildEquipmentDerivedReplay}=replayEngine;
import {
 buildEquipmentResourceReplay,evaluateEquipmentResources,
 changedResourceCapacities,resourceCapacity,
} from "../lib/combat/equipment-resource-replay.ts";
import {
 newCombatState,reconcileWearableBonusesAtCombatStart,
 applyWearableOnConfirmedHpHit,applyWeaponSelfRepairAtRoundStart,
 applyEquipmentResourceCapacities,
} from "../lib/combat/turn-engine.ts";
import {defaultEquippedWear} from "../lib/items/equipped-wear.ts";
import {defaultEquippedItemAutoRepair} from "../lib/items/auto-repair.ts";

const original={strength:10,agility:20,constitution:12,intelligence:14,
 wisdom:8,charisma:7,spirit:6,luck:8};
const basicDefs=Object.keys(original).map(key=>({
 key,code:({strength:"STR",agility:"AGI",constitution:"CON",
  intelligence:"INT",wisdom:"WIS",charisma:"CHA",
  spirit:"SPI",luck:"LCK"})[key],kind:"basic",active:true,
}));
const catalog=[...basicDefs,
 {key:"maxHp",code:"HP",kind:"derived",active:true,
  formula:"constitution * constitution + strength * 2"},
 {key:"maxMana",code:"MANA",kind:"derived",active:true,
  formula:"spirit * wisdom + agility / 2"},
];
const armorEffects=[
 {type:"stat_bonus",stat:"CON",value:4},
 {type:"stat_multiplier",stat:"SPI",value:2},
];
const amuletEffects=[
 {type:"stat_bonus",stat:"HP",value:20},
 {type:"stat_multiplier",stat:"MANA",value:1.5},
];
const copyRecords=[
 {characterItemId:1600,itemId:600,effects:armorEffects},
 {characterItemId:1601,itemId:601,effects:amuletEffects},
];
const basicStarting={...original,constitution:16,spirit:12};
const baseFormula=Object.fromEntries(Object.entries(original).map(([key,value])=>[
 key,{original:value,modifier:1,flat:0,factors:[],mechanic:1},
]));
baseFormula.constitution={...baseFormula.constitution,flat:4};
baseFormula.spirit={...baseFormula.spirit,factors:[2]};
const raw=calculateConfiguredDerivedSnapshot(basicStarting,catalog);
const withEquipment={...raw,maxHp:326,maxMana:166.5};
const active=(copies)=>new Set(copies.filter(c=>c.durability>0)
 .map(c=>c.characterItemId));
const build=()=>{
 const derived=buildEquipmentDerivedReplay({
  unmodifiedDerived:raw,currentDerived:withEquipment,
  derivedModifiers:{maxHp:{factors:[],bonus:20},
   maxMana:{factors:[1.5],bonus:0}},
  attackFactors:[],mechanicByStat:{},
  activeDerivedAliases:{HP:"maxHp",MANA:"maxMana"},
  copies:copyRecords,
 });
 assert.ok(derived);
 const basic=buildEquipmentBasicReplay({
  source:baseFormula,currentBasic:basicStarting,referenceDerived:raw,
  catalog,codeByKey:Object.fromEntries(basicDefs.map(x=>[x.key,x.code])),
  wearableCopies:copyRecords,
 });
 assert.ok(basic);
 const resource=buildEquipmentResourceReplay({
  unmodifiedDerived:raw,currentDerived:withEquipment,
  derivedModifiers:{maxHp:{factors:[],bonus:20},
   maxMana:{factors:[1.5],bonus:0}},
  externalResourceBonuses:{maxHp:30,maxMana:5},
  mechanicByStat:{},activeDerivedAliases:{HP:"maxHp",MANA:"maxMana"},
  copies:copyRecords,
 });
 assert.ok(resource);
 derived.basicReplay=basic;
 derived.resourceReplay=resource;
 return derived;
};
const armor=(durability=60,more={})=>({
 characterItemId:1600,itemId:600,name:"Coraza de constitución",
 itemType:"ARMOR",slot:"BODY",durability,
 wearOnHit:defaultEquippedWear(),...more,
});
const amulet=(durability=60,more={})=>({
 characterItemId:1601,itemId:601,name:"Talismán de vitalidad",
 itemType:"ACCESSORY",slot:"ACCESSORY_1",durability,
 wearOnHit:defaultEquippedWear(),...more,
});
const fighter=(name,id,x,more={})=>({
 characterId:id,name,hp:312,maxHp:326,
 agility:20,speedValue:20,strength:10,constitution:16,
 precision:20,dodge:20,physicalAttack:25,physicalDefense:20,
 magicAttack:25,magicDefense:20,critical:0,luck:8,race:20,massKg:70,
 positionMeters:x,attackType:"BLUNT",defenseType:"SOLID",
 weaponIntegrity:100,spentTicks:0,spentAp:0,...more,
});
const state=(items=[armor(),amulet()])=>{
 const s=newCombatState(fighter("A",1,0),
  fighter("B",2,.4,{equippedWearables:items,
   equipmentDerivedReplay:build()}));
 s.mana={PLAYER:{current:150,max:166},NPC:{current:150,max:166}};
 return s;
};
const count=(s,k)=>s.log.filter(e=>e.kind===k).length;

test("configured nonlinear HP/mana maxima exactly match server resource offsets",()=>{
 assert.equal(raw.maxHp,276);
 assert.equal(raw.maxMana,106);
 const m=build().resourceReplay;
 assert.equal(m.applied.maxHp,326);
 assert.equal(m.applied.maxMana,166.5);
 assert.equal(m.formulas.maxHp.external,30);
 assert.equal(m.formulas.maxMana.external,5);
 assert.equal(resourceCapacity(166.5,"maxMana"),166);
});

test("removing armor recalculates CON and SPI through frozen resource formulas",()=>{
 const model=build();
 const basics=model.basicReplay;
 const nextBasic=Object.fromEntries(Object.entries(basicStarting).map(([k,v])=>
  [k,k==="constitution"?12:k==="spirit"?6:v]));
 const newRaw=calculateConfiguredDerivedSnapshot(nextBasic,catalog);
 const result=evaluateEquipmentResources(model.resourceReplay,
  new Set([1601]),newRaw);
 assert.equal(result.maxHp,214);
 assert.equal(result.maxMana,94.5);
 assert.deepEqual(changedResourceCapacities(model.resourceReplay,result),
  {maxHp:-112,maxMana:-72});
});

test("breaking HP/MANA accessory keeps permanent perk resource bonuses",()=>{
 const m=build().resourceReplay;
 const noAmulet=evaluateEquipmentResources(m,new Set([1600]));
 assert.equal(noAmulet.maxHp,306);
 assert.equal(noAmulet.maxMana,111);
 assert.deepEqual(changedResourceCapacities(m,noAmulet),
  {maxHp:-20,maxMana:-55});
});

test("a confirmed HP hit wears armor and clamps only when new capacity is smaller",()=>{
 const s=state([armor(1),amulet()]);
 const snapshot=structuredClone(s);
 applyWearableOnConfirmedHpHit(s,"NPC",20,false);
 assert.equal(s.actors.NPC.equippedWearables[0].durability,0);
 assert.equal(s.actors.NPC.maxHp,214);
 assert.equal(s.actors.NPC.hp,214);
 assert.equal(s.mana.NPC.max,94);
 assert.equal(s.mana.NPC.current,94);
 assert.equal(count(s,"EQUIPMENT_CAPACITY"),1);
 assert.equal(count(s,"EQUIPMENT_BREAK"),1);
 assert.equal(snapshot.actors.NPC.maxHp,326);
 assert.equal(snapshot.mana.NPC.current,150);
 applyWearableOnConfirmedHpHit(s,"NPC",20,false);
 assert.equal(count(s,"EQUIPMENT_CAPACITY"),1,"a broken piece cannot trigger repeatedly");
});

test("paid repair restores both ceilings but never grants HP or mana back",()=>{
 const s=state([armor(0,{autoRepair:defaultEquippedItemAutoRepair()}),amulet()]);
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 assert.equal(s.actors.NPC.maxHp,214);
 assert.equal(s.actors.NPC.hp,214);
 assert.equal(s.mana.NPC.max,94);
 assert.equal(s.mana.NPC.current,94);
 s.round=2;
 applyWeaponSelfRepairAtRoundStart(s,"NPC");
 assert.equal(s.actors.NPC.equippedWearables[0].durability,5);
 assert.equal(s.actors.NPC.maxHp,326);
 assert.equal(s.actors.NPC.hp,214,"repaired armor is not a healing spell");
 assert.equal(s.mana.NPC.max,166);
 assert.equal(s.mana.NPC.current,89,"repair costs 5 of the old available mana");
 assert.equal(count(s,"EQUIPMENT_REPAIR"),1);
 applyWeaponSelfRepairAtRoundStart(s,"NPC");
 assert.equal(s.actors.NPC.hp,214);
 assert.equal(s.mana.NPC.current,89);
 assert.equal(count(s,"EQUIPMENT_REPAIR"),1);
});

test("existing wounds and spent mana persist when maximum increases",()=>{
 const s=state([armor(0),amulet()]);
 s.actors.NPC.hp=70;s.mana.NPC.current=21;
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 assert.equal(s.actors.NPC.maxHp,214);
 assert.equal(s.actors.NPC.hp,70);
 assert.equal(s.mana.NPC.max,94);
 assert.equal(s.mana.NPC.current,21);
 s.actors.NPC.equippedWearables[0].durability=1;
 const actor=s.actors.NPC;
 // Use the same durability transition as a field repair, without consuming
 // mana in this independent preservation assertion.
 const {reconcileEquipmentDerived}=replayEngine;
 const diff=reconcileEquipmentDerived(actor,actor.equippedWearables);
 applyEquipmentResourceCapacities(s,"NPC",diff);
 assert.equal(s.actors.NPC.maxHp,326);
 assert.equal(s.actors.NPC.hp,70);
 assert.equal(s.mana.NPC.max,166);
 assert.equal(s.mana.NPC.current,21);
});
test("independent copies can break in sequence without duplicating resource deltas",()=>{
 const s=state([armor(1),amulet(1)]);
 applyWearableOnConfirmedHpHit(s,"NPC",20,false);
 assert.equal(s.actors.NPC.maxHp,194);
 assert.equal(s.mana.NPC.max,63);
 assert.equal(s.actors.NPC.hp,194);
 assert.equal(s.mana.NPC.current,63);
 assert.equal(count(s,"EQUIPMENT_CAPACITY"),2);
 applyWearableOnConfirmedHpHit(s,"NPC",20,false);
 assert.equal(count(s,"EQUIPMENT_CAPACITY"),2);
});

test("insufficient mana does not repair or restore maximum capacity",()=>{
 const s=state([armor(0,{autoRepair:defaultEquippedItemAutoRepair()}),amulet()]);
 s.mana.NPC.current=3;
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 s.round=2;
 applyWeaponSelfRepairAtRoundStart(s,"NPC");
 assert.equal(s.actors.NPC.maxHp,214);
 assert.equal(s.mana.NPC.max,94);
 assert.equal(s.mana.NPC.current,3);
 assert.equal(count(s,"EQUIPMENT_REPAIR"),0);
});

test("broken at duel creation has lower ceilings, never a free fill",()=>{
 const s=state([armor(0),amulet(0)]);
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 assert.equal(s.actors.NPC.maxHp,194);
 assert.equal(s.mana.NPC.max,63);
 assert.equal(s.actors.NPC.hp,194);
 assert.equal(s.mana.NPC.current,63);
 assert.equal(count(s,"EQUIPMENT_CAPACITY"),1);
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 assert.equal(count(s,"EQUIPMENT_CAPACITY"),1);
});

test("zero HP never resurrects when equipment capacity changes",()=>{
 const s=state();
 s.actors.NPC.hp=0;
 applyEquipmentResourceCapacities(s,"NPC",{maxHp:-200,maxMana:-90});
 assert.equal(s.actors.NPC.maxHp,126);
 assert.equal(s.actors.NPC.hp,0);
 assert.equal(s.mana.NPC.max,76);
 assert.equal(s.mana.NPC.current,76);
 applyEquipmentResourceCapacities(s,"NPC",{maxHp:200,maxMana:90});
 assert.equal(s.actors.NPC.maxHp,326);
 assert.equal(s.actors.NPC.hp,0);
 assert.equal(s.mana.NPC.max,166);
 assert.equal(s.mana.NPC.current,76);
});

test("fractional resource formulas change limits by integer steps, never fractions",()=>{
 assert.equal(resourceCapacity(10.99,"maxMana"),10);
 assert.equal(resourceCapacity(.01,"maxMana"),0);
 assert.equal(resourceCapacity(-10,"maxHp"),1);
 const m=build().resourceReplay;
 assert.deepEqual(changedResourceCapacities(m,{
  maxHp:325.99,maxMana:166.99,
 }),{maxHp:-1});
});

test("replays fail closed for mismatched formulas, corrupt perks and duplicate copies",()=>{
 const m=build();
 assert.equal(buildEquipmentResourceReplay({
  unmodifiedDerived:raw,currentDerived:{...withEquipment,maxHp:9999},
  derivedModifiers:{maxHp:{factors:[],bonus:20},
   maxMana:{factors:[1.5],bonus:0}},
  externalResourceBonuses:{maxHp:30,maxMana:5},mechanicByStat:{},
  activeDerivedAliases:{HP:"maxHp",MANA:"maxMana"},
  copies:copyRecords,
 }),null);
 assert.equal(buildEquipmentResourceReplay({
  unmodifiedDerived:raw,currentDerived:withEquipment,
  derivedModifiers:{maxHp:{factors:[],bonus:20},
   maxMana:{factors:[1.5],bonus:0}},
  externalResourceBonuses:{maxHp:30,maxMana:5},mechanicByStat:{},
  activeDerivedAliases:{HP:"maxHp",MANA:"maxMana"},
  copies:[copyRecords[0],copyRecords[0]],
 }),null);
 assert.equal(m.resourceReplay.copies.length,2);
});

test("historical combats without resource replay keep HP and mana caps unchanged",()=>{
 const s=state([armor(1),amulet()]);
 s.actors.NPC.equipmentDerivedReplay.resourceReplay=undefined;
 applyWearableOnConfirmedHpHit(s,"NPC",20,false);
 assert.equal(s.actors.NPC.maxHp,326);
 assert.equal(s.mana.NPC.max,166);
 assert.equal(count(s,"EQUIPMENT_CAPACITY"),0);
});

test("server wiring protects encounter pools and never writes persistent mana",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 assert.match(read("lib/stats/effective.ts"),/buildEquipmentResourceReplay\(/);
 assert.match(read("lib/combat/equipment-derived-replay.ts"),
  /changedResourceCapacities\(resources,nextResources\)/);
 assert.match(read("lib/combat/turn-engine.ts"),
  /applyEquipmentResourceCapacities\(state,side,capacity\)/);
 assert.match(read("app/api/combat/duels/route.ts"),
  /initial\.mana=/);
});
