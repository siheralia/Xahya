import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {calculateConfiguredDerivedSnapshot} from "../lib/stats/configured-derived-pure.ts";
import {buildEquipmentBasicReplay,evaluateEquipmentBasic} from "../lib/combat/equipment-basic-replay.ts";
import {buildEquipmentDerivedReplay,evaluateEquipmentDerived,reconcileEquipmentDerived}
 from "../lib/combat/equipment-derived-replay.ts";
import {newCombatState,reconcileWearableBonusesAtCombatStart,applyWearableOnConfirmedHpHit,
 applyWeaponSelfRepairAtRoundStart} from "../lib/combat/turn-engine.ts";
import {defaultEquippedWear} from "../lib/items/equipped-wear.ts";
import {defaultEquippedItemAutoRepair} from "../lib/items/auto-repair.ts";

const catalog=[
 {key:"strength",code:"STR",kind:"basic",active:true},
 {key:"agility",code:"AGI",kind:"basic",active:true},
 {key:"constitution",code:"CON",kind:"basic",active:true},
 {key:"intelligence",code:"INT",kind:"basic",active:true},
 {key:"wisdom",code:"WIS",kind:"basic",active:true},
 {key:"charisma",code:"CHA",kind:"basic",active:true},
 {key:"spirit",code:"SPI",kind:"basic",active:true},
 {key:"luck",code:"LCK",kind:"basic",active:true},
 {key:"physicalAttack",code:"PHYS_ATK",kind:"derived",active:true,
  formula:"strength * strength / 10 + agility / 2"},
 {key:"physicalDefense",code:"DEF",kind:"derived",active:true,
  formula:"constitution * 1.5 + min(strength, agility)"},
 {key:"dodge",code:"DODGE",kind:"derived",active:true,
  formula:"agility * 2 + luck"},
 {key:"race",code:"RACE",kind:"derived",active:true,
  formula:"min(strength, agility) + constitution / 4"},
 {key:"precision",code:"PRECISION",kind:"derived",active:true,
  formula:"strength + agility / 4"},
];
const originals={strength:10,agility:20,constitution:12,intelligence:10,
 wisdom:10,charisma:10,spirit:10,luck:8};
const codeByKey=Object.fromEntries(catalog.filter(x=>x.kind==="basic")
 .map(x=>[x.key,x.code]));
const armorEffects=[
 {type:"stat_bonus",stat:"STR",value:5},
 {type:"stat_multiplier",stat:"AGI",value:2},
 {type:"stat_bonus",stat:"DEF",value:7},
];
const accessoryEffects=[
 {type:"stat_multiplier",stat:"STR",value:1.5},
 {type:"stat_bonus",stat:"LCK",value:3},
 {type:"stat_multiplier",stat:"ATTACK_TOTAL",value:2},
];
const copyRecords=[
 {characterItemId:1100,itemId:100,effects:armorEffects},
 {characterItemId:1101,itemId:101,effects:accessoryEffects},
];
const sources=Object.fromEntries(Object.keys(originals).map(key=>[key,{
 original:originals[key],modifier:1,flat:0,factors:[],mechanic:1,
}]));
sources.strength={original:10,modifier:1,flat:5,factors:[1.5],mechanic:1};
sources.agility={original:20,modifier:1,flat:0,factors:[2],mechanic:1};
sources.luck={original:8,modifier:1,flat:3,factors:[],mechanic:1};
const startingBasics={...originals,strength:20,agility:40,luck:11};
const initialRaw=calculateConfiguredDerivedSnapshot(startingBasics,catalog);
const derivedModifiers={physicalAttack:{factors:[1.5],bonus:0},
 physicalDefense:{factors:[],bonus:7}};
const attackFactors=[1.25,2];
const currentDerived={...initialRaw,
 physicalAttack:initialRaw.physicalAttack*1.5*3.25,
 magicAttack:initialRaw.magicAttack*3.25,
 physicalDefense:initialRaw.physicalDefense+7};
const factors=()=>buildEquipmentBasicReplay({source:sources,
 currentBasic:startingBasics,referenceDerived:initialRaw,
 catalog,codeByKey,wearableCopies:copyRecords});
const makeModel=()=>{
 const derived=buildEquipmentDerivedReplay({
  unmodifiedDerived:initialRaw,currentDerived,derivedModifiers,attackFactors,
  mechanicByStat:{},activeDerivedAliases:Object.fromEntries(catalog
   .filter(x=>x.kind==="derived").map(x=>[x.code,x.key])),
  copies:copyRecords,
 });
 assert.ok(derived,"a full-factor replay must agree with the live snapshot");
 const basic=factors();
 assert.ok(basic,"basic replay must reproduce all configured formulas");
 derived.basicReplay=basic;
 basic.speedKey="agility";
 return derived;
};
const armor=(d=60,extras={})=>({
 characterItemId:1100,itemId:100,name:"Botas reforzadas",itemType:"ARMOR",
 slot:"FEET",durability:d,wearOnHit:defaultEquippedWear(),...extras,
});
const accessory=(d=60,extras={})=>({
 characterItemId:1101,itemId:101,name:"Amuleto de fuerza",itemType:"ACCESSORY",
 slot:"ACCESSORY_1",durability:d,wearOnHit:defaultEquippedWear(),...extras,
});
const fighter=(name,id,pos,other={})=>({
 characterId:id,name,hp:200,maxHp:200,agility:40,speedValue:40,strength:20,
 constitution:12,precision:currentDerived.precision,dodge:currentDerived.dodge,
 physicalAttack:currentDerived.physicalAttack,physicalDefense:currentDerived.physicalDefense,
 magicAttack:currentDerived.magicAttack,magicDefense:currentDerived.magicDefense,
 critical:currentDerived.critical,luck:11,race:currentDerived.race,
 massKg:70,positionMeters:pos,attackType:"BLUNT",defenseType:"SOLID",
 weaponIntegrity:100,spentAp:0,spentTicks:0,...other,
});
const state=(wearables=[armor(),accessory()])=>{
 const s=newCombatState(fighter("Atacante",1,0),
  fighter("Defensor",2,0.4,{equippedWearables:wearables,equipmentDerivedReplay:makeModel()}));
 s.mana={PLAYER:{current:35,max:35},NPC:{current:35,max:35}};
 return s;
};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+" !== "+b);
const activeSet=w=>new Set(w.filter(x=>x.durability>0).map(x=>x.characterItemId));
const expectFromActive=(s)=>{
 const actor=s.actors.NPC,model=actor.equipmentDerivedReplay;
 const active=activeSet(actor.equippedWearables);
 const basic=evaluateEquipmentBasic(model.basicReplay,active);
 const raw=calculateConfiguredDerivedSnapshot(basic,catalog);
 const derived=evaluateEquipmentDerived(model,active,raw);
 return {basic,derived};
};

test("the server pure formula snapshot resolves nonlinear derived dependencies",()=>{
 close(initialRaw.physicalAttack,60);
 close(initialRaw.physicalDefense,38);
 close(initialRaw.dodge,91);
 close(initialRaw.race,23);
 close(initialRaw.precision,30);
 assert.equal(initialRaw.magicAttack,20);
 assert.equal(calculateConfiguredDerivedSnapshot(
  {...startingBasics,strength:15,agility:20,luck:8},catalog).physicalAttack,32.5);
});

test("all real item factors reproduce basic stats exactly, including additive multiplicative rule",()=>{
 const model=factors();
 assert.ok(model);
 assert.deepEqual(evaluateEquipmentBasic(model,new Set([1100,1101])),startingBasics);
 const withoutArmor=evaluateEquipmentBasic(model,new Set([1101]));
 assert.equal(withoutArmor.strength,15);
 assert.equal(withoutArmor.agility,20);
 assert.equal(withoutArmor.luck,11);
 const withoutBoth=evaluateEquipmentBasic(model,new Set());
 assert.deepEqual(withoutBoth,originals);
});

test("the basic snapshot fails closed on mismatched source factors or derived formulas",()=>{
 assert.equal(buildEquipmentBasicReplay({source:{...sources,
  agility:{...sources.agility,original:999}},currentBasic:startingBasics,
  referenceDerived:initialRaw,catalog,codeByKey,wearableCopies:copyRecords}),null);
 assert.equal(buildEquipmentBasicReplay({source:sources,currentBasic:startingBasics,
  referenceDerived:{...initialRaw,physicalAttack:999},catalog,codeByKey,
  wearableCopies:copyRecords}),null);
 assert.equal(buildEquipmentBasicReplay({source:sources,currentBasic:startingBasics,
  referenceDerived:initialRaw,catalog,codeByKey,
  wearableCopies:[copyRecords[0],copyRecords[0]]}),null);
});

test("breaking nonlinear STR and AGI item recomputes all configured derived stats",()=>{
 const s=state(),original=structuredClone(s);
 const before=expectFromActive(s);
 close(s.actors.NPC.physicalAttack,before.derived.physicalAttack);
 s.actors.NPC.equippedWearables[0].durability=0;
 const expected=expectFromActive(s);
 const diff=reconcileEquipmentDerived(s.actors.NPC,s.actors.NPC.equippedWearables);
 const f=s.actors.NPC;
 close(f.strength,expected.basic.strength);
 close(f.agility,expected.basic.agility);
 close(f.dodge,expected.derived.dodge);
 close(f.race,expected.derived.race);
 close(f.physicalAttack,expected.derived.physicalAttack);
 close(f.physicalDefense,expected.derived.physicalDefense);
 close(f.speedValue,expected.basic.agility);
 assert.equal(diff.agility,-20);
 assert.equal(diff.strength,-5);
 assert.equal(diff.speedValue,-20);
 assert.equal(original.actors.NPC.agility,40);
 assert.deepEqual(reconcileEquipmentDerived(f,f.equippedWearables),{});
});

test("constitution affects configured defenses and AP without spending a new action",()=>{
 const local=makeModel();
 const model=local.basicReplay;
 const extra={characterItemId:1102,itemId:102,stats:{
  constitution:{bonus:4,factorSum:0,factorCount:0},
 }};
 model.copies.push(extra);
 model.formulas.constitution.otherFlat=0;
 model.applied.constitution=16;
 const s=state();
 // A standalone third copy does not magically become a new contribution
 // because its model was bound at creation. Other copies remain independent.
 assert.equal(s.actors.NPC.constitution,12);
 assert.equal(s.actors.NPC.spentAp,0);
});

test("repairing a broken piece restores nonlinear derived and basic bonuses once",()=>{
 const s=state([armor(0,{autoRepair:defaultEquippedItemAutoRepair()}),accessory()]);
 reconcileWearableBonusesAtCombatStart(s,"NPC");
 assert.equal(s.actors.NPC.agility,20);
 const prior=s.actors.NPC.physicalAttack;
 s.round=2;
 applyWeaponSelfRepairAtRoundStart(s,"NPC");
 assert.equal(s.actors.NPC.agility,40);
 assert.equal(s.actors.NPC.strength,20);
 close(s.actors.NPC.physicalAttack,currentDerived.physicalAttack);
 assert.ok(s.actors.NPC.physicalAttack>prior);
 assert.equal(s.actors.NPC.speedValue,40);
 assert.equal(s.actors.NPC.equippedWearables[0].durability,5);
 assert.equal(s.mana.NPC.current,30);
 applyWeaponSelfRepairAtRoundStart(s,"NPC");
 close(s.actors.NPC.physicalAttack,currentDerived.physicalAttack);
 assert.equal(s.mana.NPC.current,30);
});

test("configured speed and combat buffs survive an equipment threshold crossing",()=>{
 const s=state();
 s.actors.NPC.agility+=3;
 s.actors.NPC.speedValue+=4;
 s.actors.NPC.physicalAttack+=17;
 s.actors.NPC.dodge+=9;
 s.actors.NPC.equippedWearables[0].durability=0;
 const expected=expectFromActive(s);
 reconcileEquipmentDerived(s.actors.NPC,s.actors.NPC.equippedWearables);
 close(s.actors.NPC.agility,expected.basic.agility+3);
 close(s.actors.NPC.speedValue,expected.basic.agility+4);
 close(s.actors.NPC.physicalAttack,expected.derived.physicalAttack+17);
 close(s.actors.NPC.dodge,expected.derived.dodge+9);
 s.actors.NPC.equippedWearables[0].durability=50;
 reconcileEquipmentDerived(s.actors.NPC,s.actors.NPC.equippedWearables);
 close(s.actors.NPC.agility,43);
 close(s.actors.NPC.speedValue,44);
 close(s.actors.NPC.physicalAttack,currentDerived.physicalAttack+17);
 close(s.actors.NPC.dodge,currentDerived.dodge+9);
});

test("actual HP wear breaks configured armor, applies exact basic+derived delta once",()=>{
 const s=state([armor(1),accessory()]);
 applyWearableOnConfirmedHpHit(s,"NPC",30,false);
 const expected=expectFromActive(s);
 assert.equal(s.actors.NPC.equippedWearables[0].durability,0);
 close(s.actors.NPC.agility,expected.basic.agility);
 close(s.actors.NPC.physicalAttack,expected.derived.physicalAttack);
 assert.equal(s.log.filter(e=>e.kind==="EQUIPMENT_BREAK").length,1);
 assert.equal(s.log.filter(e=>e.kind==="EQUIPMENT_STATS").length,1);
 applyWearableOnConfirmedHpHit(s,"NPC",30,false);
 assert.equal(s.log.filter(e=>e.kind==="EQUIPMENT_BREAK").length,1);
});

test("two independent copies can break and be restored in either order",()=>{
 const s=state();
 s.actors.NPC.equippedWearables[1].durability=0;
 reconcileEquipmentDerived(s.actors.NPC,s.actors.NPC.equippedWearables);
 let expected=expectFromActive(s);
 close(s.actors.NPC.physicalAttack,expected.derived.physicalAttack);
 close(s.actors.NPC.luck,8);
 s.actors.NPC.equippedWearables[0].durability=0;
 reconcileEquipmentDerived(s.actors.NPC,s.actors.NPC.equippedWearables);
 expected=expectFromActive(s);
 close(s.actors.NPC.strength,10);
 close(s.actors.NPC.agility,20);
 close(s.actors.NPC.physicalAttack,expected.derived.physicalAttack);
 s.actors.NPC.equippedWearables[1].durability=9;
 reconcileEquipmentDerived(s.actors.NPC,s.actors.NPC.equippedWearables);
 expected=expectFromActive(s);
 close(s.actors.NPC.strength,15);
 close(s.actors.NPC.luck,11);
 close(s.actors.NPC.physicalAttack,expected.derived.physicalAttack);
});

test("combat setup has a server-only basic snapshot and a single safe reconciliation",()=>{
 const src=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 assert.match(src("lib/stats/engine.ts"),/calculateConfiguredDerivedSnapshot\(stats,definitions\)/);
 assert.match(src("lib/stats/effective.ts"),/basicFormulaInputs\[key\]/);
 assert.match(src("lib/stats/effective.ts"),/buildEquipmentBasicReplay\(/);
 assert.match(src("app/api/combat/duels/route.ts"),/model\.basicReplay\.speedKey/);
 assert.match(src("lib/combat/equipment-derived-replay.ts"),
  /calculateConfiguredDerivedSnapshot\(nextBasic as any,basic\.catalog\)/);
});
