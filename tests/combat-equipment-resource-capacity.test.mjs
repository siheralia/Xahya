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
 applyEquipmentResourceCapacities,applyCombatCommand,canAct,applyResolvedCombatSkill,
} from "../lib/combat/turn-engine.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
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


/** Additional complete, synthetic encounters. No Character, Skill, Item,
 * CharacterResource or production database row is created. Real combat
 * transitions run against fictional approved equipment and skill snapshots.
 */
const simulationDice={hit:.01,critical:.99,defense:.99};
const simulateNextRound=(start)=>{
 let next=start;
 const target=start.round+1;
 for(let step=0;step<24&&next.round<target;step++){
  const who=canAct(next,"PLAYER")?"PLAYER":canAct(next,"NPC")?"NPC":null;
  assert.ok(who,"a live duel must always have an actionable side");
  next=applyCombatCommand(next,who,{kind:"WAIT"},simulationDice);
 }
 assert.equal(next.round,target,"the round advances through actual combat commands");
 return next;
};

test("simulated duel: one real attack breaks two fictional pieces, and round 2 repairs both",()=>{
 const initial=state([
  armor(1,{autoRepair:defaultEquippedItemAutoRepair()}),
  amulet(1,{autoRepair:defaultEquippedItemAutoRepair()}),
 ]);
 const untouched=structuredClone(initial);
 const launched=applyCombatCommand(initial,"PLAYER",{
  kind:"ATTACK",attackType:"BLUNT",
  trajectory:[{x:.1,y:.5},{x:.5,y:.5}],
 },simulationDice);
 assert.ok(launched.pending,"the attack must offer a reaction");
 const defended=applyCombatCommand(launched,"NPC",{
  kind:"DEFEND",defense:"NONE",
 },simulationDice);
 assert.equal(defended.round,1);
 assert.ok(defended.actors.NPC.hp<312,"the physical blow caused real HP damage");
 assert.deepEqual(defended.actors.NPC.equippedWearables.map(x=>x.durability),[0,0]);
 assert.equal(defended.actors.NPC.maxHp,194);
 assert.equal(defended.mana.NPC.max,63);
 assert.equal(count(defended,"EQUIPMENT_BREAK"),2);
 assert.equal(count(defended,"EQUIPMENT_CAPACITY"),2);
 assert.deepEqual(initial,untouched,"the original combat session stays immutable");

 // JSON persistence and normal initiative, not manually forcing round=2.
 const persisted=JSON.parse(JSON.stringify(defended));
 const hpAfterHit=persisted.actors.NPC.hp;
 const manaAfterBreak=persisted.mana.NPC.current;
 const repaired=simulateNextRound(persisted);
 assert.deepEqual(repaired.actors.NPC.equippedWearables.map(x=>x.durability),[5,5]);
 assert.equal(repaired.actors.NPC.maxHp,326);
 assert.equal(repaired.mana.NPC.max,166);
 assert.equal(repaired.actors.NPC.hp,hpAfterHit,"repair does not heal wounds");
 assert.equal(repaired.mana.NPC.current,manaAfterBreak-10,
  "both repairs independently charge their 5 mana");
 assert.deepEqual(repaired.itemRepairsThisRound.map(x=>x.characterItemId),[1600,1601]);
 assert.equal(count(repaired,"EQUIPMENT_REPAIR"),2);
 assert.equal(count(repaired,"EQUIPMENT_BREAK"),2);
 assert.equal(count(repaired,"EQUIPMENT_CAPACITY"),4);
 assert.ok(repaired.actors.NPC.hp>=0&&repaired.actors.NPC.hp<=repaired.actors.NPC.maxHp);
});

test("simulated approved healing skill heals only within an equipment-reduced HP ceiling",()=>{
 const fixture=state([armor(0),amulet()]);
 reconcileWearableBonusesAtCombatStart(fixture,"NPC");
 fixture.actors.NPC.hp=196;
 assert.equal(fixture.actors.NPC.maxHp,214);
 assert.equal(fixture.mana.NPC.current,94);
 const mockedApprovedSkill={
  id:99081,name:"Curación ficticia de laboratorio",status:"APPROVED",
  category:"SUPPORT",cost:5,cooldown:"Sin cooldown",duration:"Instantánea",
  effect:[{type:"RESOURCE_BONUS",target:"HP",value:30}],
 };
 const plan=compileCombatSkill(mockedApprovedSkill);
 const ready=applyCombatCommand(fixture,"PLAYER",{kind:"WAIT"},simulationDice);
 assert.ok(canAct(ready,"NPC"));
 const healed=applyResolvedCombatSkill(ready,"NPC",plan,{
  requestId:"synthetic-healing-00001",
 },simulationDice);
 assert.equal(healed.actors.NPC.hp,214,"a real healing skill can heal, but only up to current max");
 assert.equal(healed.actors.NPC.maxHp,214);
 assert.equal(healed.mana.NPC.current,89,"the synthetic skill pays its mana cost");
 assert.ok(healed.log.some(e=>e.kind==="SKILL"&&e.skillId===99081));
 assert.equal(fixture.actors.NPC.hp,196,"the source session was not mutated");
 assert.deepEqual(applyResolvedCombatSkill(healed,"NPC",plan,{
  requestId:"synthetic-healing-00001",
 },simulationDice),healed,"same request cannot heal twice");
});

test("simulated costly skill cannot spend mana removed by broken equipment",()=>{
 const fixture=state([armor(0),amulet()]);
 reconcileWearableBonusesAtCombatStart(fixture,"NPC");
 assert.equal(fixture.mana.NPC.current,94);
 const expensive=compileCombatSkill({
  id:99082,name:"Hechizo ficticio caro",status:"APPROVED",
  category:"SUPPORT",cost:95,cooldown:"Sin cooldown",
  duration:"Instantánea",effect:[{type:"RESOURCE_BONUS",target:"HP",value:5}],
 });
 const ready=applyCombatCommand(fixture,"PLAYER",{kind:"WAIT"},simulationDice);
 const before=structuredClone(ready);
 assert.throws(()=>applyResolvedCombatSkill(ready,"NPC",expensive,{
  requestId:"synthetic-expensive-001",
 },simulationDice),/Maná insuficiente/);
 assert.deepEqual(ready,before,"a denied spell cannot debit mana or alter initiative");
});

test("24 deterministic multi-hit equipment simulations preserve all HP/mana invariants",()=>{
 let checked=0,breaks=0,repairs=0;
 for(let seed=1;seed<=24;seed++){
  const base=state([
   armor(1+(seed%13),{autoRepair:defaultEquippedItemAutoRepair()}),
   amulet(1+((seed*7)%17),{autoRepair:defaultEquippedItemAutoRepair()}),
  ]);
  base.actors.NPC.hp=Math.max(1,base.actors.NPC.maxHp-seed*3);
  base.mana.NPC.current=Math.max(0,base.mana.NPC.max-seed*2);
  reconcileWearableBonusesAtCombatStart(base,"NPC");
  for(let step=0;step<12;step++){
   const beforeHp=base.actors.NPC.hp;
   const beforeMana=base.mana.NPC.current;
   if(step%3===2){
    base.round++;
    applyWeaponSelfRepairAtRoundStart(base,"NPC");
   }else{
    const received=Math.min(5,Math.max(0,base.actors.NPC.hp-1));
    if(received>0){
     base.actors.NPC.hp-=received;
     applyWearableOnConfirmedHpHit(base,"NPC",received,(step+seed)%2===0);
    }
   }
   assert.ok(base.actors.NPC.maxHp>=1&&Number.isInteger(base.actors.NPC.maxHp));
   assert.ok(base.mana.NPC.max>=0&&Number.isInteger(base.mana.NPC.max));
   assert.ok(base.actors.NPC.hp>=0&&base.actors.NPC.hp<=base.actors.NPC.maxHp);
   assert.ok(base.mana.NPC.current>=0&&base.mana.NPC.current<=base.mana.NPC.max);
   assert.ok(base.actors.NPC.hp<=beforeHp,"equipment alone never grants healing");
   assert.ok(base.mana.NPC.current<=beforeMana,"equipment alone never grants mana");
   assert.ok(base.actors.NPC.equippedWearables.every(x=>x.durability>=0&&x.durability<=100));
   checked++;
  }
  breaks+=count(base,"EQUIPMENT_BREAK");
  repairs+=count(base,"EQUIPMENT_REPAIR");
  assert.deepEqual(JSON.parse(JSON.stringify(base)).actors.NPC.equippedWearables,
   base.actors.NPC.equippedWearables,"replays persist across serialization");
 }
 assert.equal(checked,288);
 assert.ok(breaks>0,"at least one random equipment setup reaches broken");
 assert.ok(repairs>0,"at least one setup pays for an actual repair");
});
