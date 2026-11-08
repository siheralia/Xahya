import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newCombatState,applyCombatCommand} from "../lib/combat/turn-engine.ts";
import {combatWeaponOperational} from "../lib/combat/weapon-readiness.ts";
import {persistedDurabilityAfterAction,weaponWearSinceSnapshot}
 from "../lib/combat/weapon-persistence.ts";

const rolls={hit:.01,critical:.99,defense:.99};
const throwable=(extra={})=>({
 name:"Jabalina",attackType:"PIERCE",mode:"MELEE",
 effectiveRangeMeters:2,maximumRangeMeters:2,
 throwable:true,throwRangeMeters:6,
 itemId:451,characterItemId:1451,durability:73,
 materialPhysicalResistance:100,...extra,
});
const fighter=(name,id,x,extra={})=>({
 characterId:id,name,hp:180,maxHp:180,speedValue:id===101?90:70,
 agility:80,strength:30,constitution:12,precision:100,dodge:12,
 physicalAttack:25,physicalDefense:4,magicAttack:40,magicDefense:10,
 critical:0,luck:15,race:20,massKg:70,positionMeters:x,
 attackType:"PIERCE",defenseType:"SOLID",weaponIntegrity:73,
 spentTicks:0,spentAp:0,...extra,
});
const initial=(attacker={})=>newCombatState(
 fighter("Lanzadora",101,0,{equippedWeapon:throwable(),...attacker}),
 fighter("Defensor",102,4),
);
const wall=(id,x,durability=90,extra={})=>({
 id,owner:"NPC",sourceSkillId:140,material:"EARTH",form:"BLOCK",
 label:id,center:{x:.5,y:.5},createdRound:1,
 fieldPosition:{x,y:0},heightMeters:0,solidHeightMeters:2,
 footprintRadiusMeters:.18,tangible:true,durability,hitCount:0,...extra,
});
const throwAt=(s,extra={})=>applyCombatCommand(s,"PLAYER",{
 kind:"ATTACK",throwWeapon:true,attackType:"PIERCE",attackSource:"MAIN_HAND",
 areaCenter:{x:.5,y:.5},projectileHeights:{launchMeters:1.5,impactMeters:1.5},
 ...extra,
},rolls);
const settle=(launched,defense="NONE",dice=rolls)=>applyCombatCommand(
 launched,"NPC",{kind:"DEFEND",defense,
 ...(defense==="DODGE"?{predictedCenter:{x:.5,y:.5}}:{})},dice);
const wearEvents=s=>s.log.filter(e=>e.kind==="WEAPON_WEAR");
const copy=s=>s.droppedWeapons?.[0]?.weapon;

test("an actual thrown item, not the bow, loses durability on a measured wall",()=>{
 const s=initial();s.constructions=[wall("front",1.5)];
 const launched=throwAt(s),before=structuredClone(launched);
 assert.equal(copy(launched).durability,73);
 assert.equal(launched.actors.PLAYER.equippedWeapon,undefined);
 const done=settle(launched);
 assert.deepEqual(launched,before,"the authoritative transition is pure");
 assert.equal(done.constructions[0].durability,65);
 assert.equal(copy(done).durability,69);
 assert.equal(copy(done).characterItemId,1451);
 assert.equal(done.actors.PLAYER.weaponIntegrity,69);
 assert.equal(done.droppedWeapons[0].positionMeters,1.5);
 assert.equal(wearEvents(done).length,1);
 assert.equal(wearEvents(done)[0].damage,4);
 assert.equal(done.actors.NPC.hp,180);
 assert.equal(done.actors.PLAYER.spentAp,1);
 assert.equal(weaponWearSinceSnapshot(73,69,0),4);
 assert.equal(persistedDurabilityAfterAction(73,73,69,0),69);
});

test("multiple measured walls consume one wear event, with actual absorbed pressure",()=>{
 const s=initial();
 s.constructions=[wall("back",2.5,90),wall("front",1.5,5)];
 const done=settle(throwAt(s));
 assert.equal(copy(done).durability,69);
 assert.equal(wearEvents(done).length,1);
 assert.equal(done.constructions.find(c=>c.id==="front"),undefined);
 assert.equal(done.constructions.find(c=>c.id==="back")?.durability,70);
 assert.equal(done.droppedWeapons[0].positionMeters,2.5);
});

test("a single fragile wall only wears what it physically absorbs",()=>{
 const s=initial();s.constructions=[wall("fragile",1.5,5)];
 const done=settle(throwAt(s));
 assert.equal(copy(done).durability,72);
 assert.deepEqual(wearEvents(done).map(e=>e.damage),[1]);
 assert.equal(done.constructions.length,0);
 assert.equal(done.droppedWeapons[0].positionMeters,4);
 assert.ok(done.actors.NPC.hp<180);
});

test("real material resistance scales the thrown-item wear without altering wall damage",()=>{
 const s=initial({equippedWeapon:throwable({materialPhysicalResistance:200})});
 s.constructions=[wall("solid",1.5,90)];
 const done=settle(throwAt(s));
 assert.equal(copy(done).durability,71);
 assert.equal(wearEvents(done)[0].damage,2);
 assert.equal(done.constructions[0].durability,65);
});

test("an offhand throw wears only its own real inventory copy",()=>{
 const s=initial({
  equippedWeapon:throwable({name:"Principal",itemId:451,characterItemId:1451,durability:91}),
  offhandWeapon:throwable({name:"Secundaria",itemId:452,characterItemId:1452,
   durability:87,materialPhysicalResistance:200}),
  weaponIntegrity:91,
 });
 s.constructions=[wall("solid",1.5)];
 const done=settle(throwAt(s,{attackSource:"OFF_HAND"}));
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,91);
 assert.equal(done.actors.PLAYER.weaponIntegrity,91);
 assert.equal(done.actors.PLAYER.offhandWeapon,undefined);
 assert.equal(copy(done).characterItemId,1452);
 assert.equal(copy(done).durability,85);
 assert.equal(wearEvents(done).length,1);
 assert.match(wearEvents(done)[0].summary,/Secundaria/);
});

test("a successful dodge does not undo collision damage to the thrown item",()=>{
 const s=initial();s.constructions=[wall("dodge-wall",1.5)];
 const done=settle(throwAt(s),"DODGE",{hit:.99,critical:.99,defense:.01});
 assert.equal(done.actors.NPC.hp,180);
 assert.equal(done.constructions[0].durability,65);
 assert.equal(copy(done).durability,69);
 assert.equal(wearEvents(done).length,1);
});

test("high, off-line and decorative obstacles never wear the thrown item",()=>{
 const s=initial();s.constructions=[
  wall("high",1,90,{heightMeters:5}),
  wall("lateral",2,90,{fieldPosition:{x:2,y:2}}),
  wall("decor",2.5,90,{form:"DECOR"}),
  wall("legacy",3,90,{solidHeightMeters:undefined}),
 ];
 const done=settle(throwAt(s));
 assert.equal(copy(done).durability,73);
 assert.equal(wearEvents(done).length,0);
 for(const w of done.constructions)assert.equal(w.durability,90);
});

test("legacy throws without elevations have no invented obstacle collision or wear",()=>{
 const s=initial();s.constructions=[wall("legacy",1.5)];
 const launched=throwAt(s,{projectileHeights:undefined});
 assert.equal(launched.pending.projectileFlight,undefined);
 const done=settle(launched);
 assert.equal(copy(done).durability,73);
 assert.equal(done.constructions[0].durability,90);
 assert.equal(wearEvents(done).length,0);
});

test("bow-fired arrows do not wear the bow on the same measured wall",()=>{
 const bow={name:"Arco",attackType:"PIERCE",mode:"RANGED",
  effectiveRangeMeters:6,maximumRangeMeters:6,durability:73,
  itemId:500,characterItemId:1500};
 const s=initial({equippedWeapon:bow});s.constructions=[wall("front",1.5)];
 const launched=applyCombatCommand(s,"PLAYER",{
  kind:"ATTACK",attackType:"PIERCE",rangedPhysical:true,
  attackSource:"MAIN_HAND",areaCenter:{x:.5,y:.5},
  projectileHeights:{launchMeters:1.5,impactMeters:1.5}
 },rolls);
 const done=settle(launched);
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,73);
 assert.equal(wearEvents(done).length,0);
 assert.equal(done.constructions[0].durability,65);
});

test("broken thrown item remains broken after encounter settlement and cannot attack",()=>{
 const s=initial({hp:180,equippedWeapon:throwable({durability:3}),weaponIntegrity:3});
 s.actors.NPC.hp=1;s.actors.NPC.maxHp=1;
 s.constructions=[wall("fragile",1.5,5)];
 const done=settle(throwAt(s));
 assert.equal(done.status,"FINISHED");
 assert.equal(done.droppedWeapons.length,0);
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,2,
  "weak cover only takes one wear point");
 assert.equal(done.actors.PLAYER.weaponIntegrity,2);
 const second=initial({equippedWeapon:throwable({durability:3}),weaponIntegrity:3});
 second.constructions=[wall("solid",1.5,90)];
 const broken=settle(throwAt(second));
 assert.equal(copy(broken).durability,0);
 assert.equal(combatWeaponOperational(copy(broken)),false);
 assert.equal(broken.log.filter(e=>e.kind==="WEAPON_BREAK").length,1);
});

test("combat transaction persists dropped weapon copies by ID without double writes",()=>{
 const route=readFileSync(new URL("../app/api/combat/[id]/actions/route.ts",import.meta.url),"utf8");
 assert.match(route,/\.\.\.\(next\.droppedWeapons\?\?\[\]\)\.filter\(d=>d\.owner===who\)\.map\(d=>d\.weapon\)/);
 assert.match(route,/persistedCopies\.has\(weapon\.characterItemId\)/);
 assert.match(route,/SET durability=LEAST\(durability,\$\{integrity\}\)/);
 assert.match(route,/"characterId"=\$\{characterId\}/);
});
