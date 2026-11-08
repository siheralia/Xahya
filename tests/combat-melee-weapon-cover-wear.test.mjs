import test from "node:test";
import assert from "node:assert/strict";
import {
 calculateMaterialBlockWear,meleeWeaponWearFromCover,
} from "../lib/combat/material-durability.ts";
import {newCombatState,applyCombatCommand} from "../lib/combat/turn-engine.ts";
import {combatWeaponOperational} from "../lib/combat/weapon-readiness.ts";
import {weaponWearSinceSnapshot,persistedDurabilityAfterAction} from "../lib/combat/weapon-persistence.ts";

const bluntWeapon=(name,overrides={})=>({
 name,attackType:"BLUNT",mode:"MELEE",effectiveRangeMeters:3,
 maximumRangeMeters:3,durability:100,materialPhysicalResistance:100,
 ...overrides,
});
const rangedWeapon={
 name:"Arco",attackType:"PIERCE",mode:"RANGED",
 effectiveRangeMeters:6,maximumRangeMeters:6,durability:100,
};
const fighter=(name,id,x,patch={})=>({
 name,characterId:id,hp:100,maxHp:100,agility:80,speedValue:80,
 strength:30,constitution:11,precision:100,dodge:12,
 physicalAttack:25,physicalDefense:4,magicAttack:30,magicDefense:30,
 critical:0,luck:15,race:20,massKg:70,positionMeters:x,
 attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,
 spentTicks:0,spentAp:0,
 equippedWeapon:bluntWeapon("Maza"),
 ...patch,
});
const state=(attacker={})=>newCombatState(
 fighter("Atacante",101,0,attacker),
 fighter("Defensor",102,1.5,{speedValue:75}),
);
const wall=(id,x,durability,patch={})=>({
 id,owner:"NPC",sourceSkillId:140,material:"EARTH",form:"BLOCK",
 label:id,center:{x:.5,y:.5},createdRound:1,
 fieldPosition:{x,y:0},heightMeters:0,solidHeightMeters:2,
 footprintRadiusMeters:.04,tangible:true,durability,hitCount:0,...patch,
});
const dice={hit:.01,critical:.99,defense:.99};
const stroke=[{x:.1,y:.9},{x:.4,y:.9},{x:.5,y:.5}];
const swing=(s,source="MAIN_HAND",points=stroke)=>applyCombatCommand(s,"PLAYER",{
 kind:"ATTACK",attackType:"BLUNT",attackSource:source,trajectory:points,
},dice);
const resolve=s=>applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
const wearLog=s=>s.log.filter(e=>e.kind==="WEAPON_WEAR");
const breakLog=s=>s.log.filter(e=>e.kind==="WEAPON_BREAK");

test("the wear formula scales with absorbed force and material resistance",()=>{
 assert.equal(meleeWeaponWearFromCover(25,25,100),4);
 assert.equal(meleeWeaponWearFromCover(25,25,200),2);
 assert.equal(meleeWeaponWearFromCover(25,25,50),8);
 assert.equal(meleeWeaponWearFromCover(25,5,100),1);
 assert.equal(meleeWeaponWearFromCover(25,0,100),0);
 assert.equal(meleeWeaponWearFromCover(25,99,100),4,
  "cannot wear beyond attack pressure");
 assert.equal(meleeWeaponWearFromCover(25,25),4,
  "missing material is neutral");
 assert.equal(meleeWeaponWearFromCover(25,25,0),4,
  "zero material resistance never grants invulnerability");
 assert.equal(calculateMaterialBlockWear(4,200),2);
 assert.throws(()=>meleeWeaponWearFromCover(25,-1),/presión/);
});

test("weapon striking measured wall loses durability even when fighter receives 0 HP",()=>{
 const s=state();s.constructions=[wall("strong",.2,90)];
 const launched=swing(s);
 const immutable=structuredClone(launched);
 const done=resolve(launched);
 assert.deepEqual(launched,immutable);
 assert.equal(done.actors.NPC.hp,100);
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,96);
 assert.equal(done.actors.PLAYER.weaponIntegrity,96);
 assert.deepEqual(wearLog(done).map(x=>x.damage),[4]);
 assert.equal(wearLog(done)[0].weaponIntegrity,96);
 assert.equal(done.constructions[0].durability,65);
 assert.equal(done.actors.PLAYER.spentAp,1);
 assert.equal(done.actors.NPC.spentAp,0);
 assert.equal(weaponWearSinceSnapshot(100,96,0),4);
 assert.equal(persistedDurabilityAfterAction(100,100,96,0),96);
});

test("multiple walls in one strike cause ONE wear charge, not double wear",()=>{
 const s=state();
 s.constructions=[wall("rear",.5,100),wall("front",.2,5)];
 const done=resolve(swing(s));
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,96);
 assert.equal(wearLog(done).length,1);
 assert.equal(wearLog(done)[0].damage,4);
 assert.equal(done.constructions.find(x=>x.id==="rear").durability,80);
 assert.equal(done.constructions.some(x=>x.id==="front"),false);
});

test("weak wall only consumes the pressure it absorbs, even if attack penetrates",()=>{
 const baseline=resolve(swing(state()));
 const s=state();s.constructions=[wall("fragile",.2,5)];
 const done=resolve(swing(s));
 assert.equal(done.constructions.length,0);
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,99);
 assert.equal(wearLog(done)[0].damage,1);
 assert.ok(done.actors.NPC.hp<100,"residual attack still reaches fighter");
 assert.ok(done.actors.NPC.hp>baseline.actors.NPC.hp);
});

test("high-resistance metal reduces contact wear without changing barrier consumption",()=>{
 const regular=state();regular.constructions=[wall("strong",.2,90)];
 const steel=resolve(swing(regular));
 const reinforced=state({equippedWeapon:bluntWeapon("Maza reforzada",{
  materialPhysicalResistance:200
 })});
 reinforced.constructions=[wall("strong",.2,90)];
 const upgraded=resolve(swing(reinforced));
 assert.equal(steel.actors.PLAYER.equippedWeapon.durability,96);
 assert.equal(upgraded.actors.PLAYER.equippedWeapon.durability,98);
 assert.equal(upgraded.constructions[0].durability,steel.constructions[0].durability);
 assert.equal(wearLog(upgraded).length,1);
});

test("offhand strike only wears OFF_HAND weapon, never main hand",()=>{
 const s=state({offhandWeapon:bluntWeapon("Maza auxiliar",{durability:87})});
 s.constructions=[wall("strong",.2,90)];
 const done=resolve(swing(s,"OFF_HAND"));
 assert.equal(done.actors.PLAYER.offhandWeapon.durability,83);
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,100);
 assert.equal(done.actors.PLAYER.weaponIntegrity,100,
  "main-hand legacy integrity must not mirror offhand wear");
 assert.equal(wearLog(done).length,1);
 assert.match(wearLog(done)[0].summary,/Maza auxiliar/);
});

test("breaking a weapon against measured cover marks it unusable and logs breakage once",()=>{
 const s=state({equippedWeapon:bluntWeapon("Frágil",{durability:3})});
 s.constructions=[wall("strong",.2,90)];
 const done=resolve(swing(s));
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,0);
 assert.equal(done.actors.PLAYER.weaponIntegrity,0);
 assert.equal(combatWeaponOperational(done.actors.PLAYER.equippedWeapon),false);
 assert.equal(wearLog(done).length,1);
 assert.equal(wearLog(done)[0].damage,3);
 assert.equal(breakLog(done).length,1);
 assert.match(breakLog(done)[0].summary,/Frágil/);
});

test("no wear on a clean hit without cover, or an obstruction outside the stroke",()=>{
 const clear=resolve(swing(state()));
 assert.equal(clear.actors.PLAYER.equippedWeapon.durability,100);
 assert.equal(wearLog(clear).length,0);
 const s=state();s.constructions=[
  wall("high",.2,90,{heightMeters:5}),
  wall("decor",.4,90,{form:"DECOR"}),
  wall("legacy",.5,90,{solidHeightMeters:undefined}),
 ];
 const clean=resolve(swing(s));
 assert.equal(clean.actors.PLAYER.equippedWeapon.durability,100);
 assert.equal(wearLog(clean).length,0);
});

test("unarmed attack does not wear an imaginary weapon or legacy hand-integrity",()=>{
 const s=state({equippedWeapon:undefined});
 s.constructions=[wall("solid",.2,90)];
 const done=resolve(swing(s,"FIST_RIGHT"));
 assert.equal(done.actors.PLAYER.equippedWeapon,undefined);
 assert.equal(done.actors.PLAYER.weaponIntegrity,100);
 assert.equal(wearLog(done).length,0);
 assert.equal(done.actors.NPC.hp,100);
});

test("dodged melee attack causes no wall wear and no weapon wear",()=>{
 const s=state();s.constructions=[wall("front",.2,90)];
 const launched=swing(s);
 const result=applyCombatCommand(launched,"NPC",{kind:"DEFEND",defense:"DODGE"},{
  hit:.99,critical:.99,defense:.01
 });
 assert.equal(result.constructions[0].durability,90);
 assert.equal(result.actors.PLAYER.equippedWeapon.durability,100);
 assert.equal(wearLog(result).length,0);
});

test("a projectile intercepted by measured cover does NOT damage the bow",()=>{
 const s=state({equippedWeapon:rangedWeapon,attackType:"PIERCE"});
 s.constructions=[wall("front",.5,90,{footprintRadiusMeters:.18})];
 const launched=applyCombatCommand(s,"PLAYER",{
  kind:"ATTACK",rangedPhysical:true,attackType:"PIERCE",attackSource:"MAIN_HAND",
  areaCenter:{x:.5,y:.5},projectileHeights:{launchMeters:1.5,impactMeters:1.5}
 },dice);
 const done=resolve(launched);
 assert.equal(done.actors.NPC.hp,100);
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,100);
 assert.equal(wearLog(done).length,0);
 assert.equal(done.constructions[0].durability,65);
});
