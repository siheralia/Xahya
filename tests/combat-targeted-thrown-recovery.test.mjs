import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState,applyCombatCommand} from "../lib/combat/turn-engine.ts";
import {combatWeaponOperational} from "../lib/combat/weapon-readiness.ts";
import {weaponWearSinceSnapshot} from "../lib/combat/weapon-persistence.ts";

const rolls={hit:.01,critical:.99,defense:.99};
const mallet=(more={})=>({
 name:"Maza arrojable",attackType:"BLUNT",mode:"MELEE",
 effectiveRangeMeters:2,maximumRangeMeters:2,
 throwable:true,throwRangeMeters:6,durability:73,
 materialPhysicalResistance:100,itemId:910,characterItemId:1910,...more,
});
const fighter=(name,id,x,extra={})=>({
 characterId:id,name,hp:100,maxHp:100,agility:80,
 speedValue:id===101?90:70,strength:30,constitution:11,
 precision:100,dodge:10,physicalAttack:25,physicalDefense:4,
 magicAttack:20,magicDefense:8,critical:0,luck:10,race:20,massKg:70,
 positionMeters:x,attackType:"BLUNT",defenseType:"SOLID",
 weaponIntegrity:73,spentTicks:0,spentAp:0,...extra,
});
const state=(player={},npc={})=>newCombatState(
 fighter("Atacante",101,0,{equippedWeapon:mallet(),...player}),
 fighter("Rival",102,4,npc)
);
const mirror=(more={})=>({
 id:"mirror-world",owner:"NPC",sourceSkillId:51,material:"MIRROR",
 form:"MIRROR",label:"Espejo físico",center:{x:.5,y:.5},
 createdRound:1,fieldPosition:{x:1.3,y:.7},tangible:true,
 durability:100,hitCount:0,
 mirror:{rayMultiplier:1,reflectionMultiplier:1,rangeMeters:5,attackType:"PIERCE"},
 ...more,
});
const summon=(more={})=>({
 id:"summon-world",owner:"NPC",sourceSkillId:52,entityKey:"SUM",
 label:"Criatura",fieldPosition:{x:1.1,y:1.1},createdRound:1,
 expiresAtRound:10,controlRangeMeters:15,maintenanceMana:0,
 integrity:100,hitCount:0,hitLimit:4,links:[],
 behavior:{mode:"FOLLOW",allowedModes:["FOLLOW"],target:"USER",trigger:"COMMAND"},
 ...more,
});
const throwAt=(s,more={})=>applyCombatCommand(s,"PLAYER",{
 kind:"ATTACK",attackType:"BLUNT",attackSource:"MAIN_HAND",
 throwWeapon:true,areaCenter:{x:.5,y:.5},...more,
},rolls);
const meleeAt=(s,more={})=>applyCombatCommand(s,"PLAYER",{
 kind:"ATTACK",attackType:"BLUNT",attackSource:"MAIN_HAND",
 trajectory:[{x:.1,y:.5},{x:.5,y:.5}],...more
},rolls);
const wears=s=>s.log.filter(e=>e.kind==="WEAPON_WEAR");

test("throwing directly at an anchored physical mirror wears the real dropped copy",()=>{
 const s=state();s.constructions=[mirror()];
 const original=structuredClone(s);
 const done=throwAt(s,{targetConstructionId:"mirror-world"});
 assert.deepEqual(s,original,"the combat transition leaves its source untouched");
 assert.equal(done.pending,null);
 assert.equal(done.constructions[0].durability,75);
 assert.equal(done.actors.PLAYER.equippedWeapon,undefined);
 assert.equal(done.droppedWeapons[0].weapon.durability,69);
 assert.equal(done.actors.PLAYER.weaponIntegrity,69);
 assert.equal(done.droppedWeapons[0].weapon.characterItemId,1910);
 assert.deepEqual(done.droppedWeapons[0].fieldPosition,{x:1.3,y:.7});
 assert.equal(done.droppedWeapons[0].positionMeters,1.3);
 assert.equal(wears(done).length,1);
 assert.equal(wears(done)[0].damage,4);
 assert.equal(weaponWearSinceSnapshot(73,69,0),4);
});

test("a miss or an intangible mirror cannot damage the thrown copy",()=>{
 const s=state();s.constructions=[mirror()];
 const miss=throwAt(s,{targetConstructionId:"mirror-world",areaCenter:{x:.9,y:.9}});
 assert.equal(miss.constructions[0].durability,100);
 assert.equal(miss.droppedWeapons[0].weapon.durability,73);
 assert.equal(wears(miss).length,0);
 const ghost=state();ghost.constructions=[mirror({tangible:false})];
 const ignored=throwAt(ghost,{targetConstructionId:"mirror-world"});
 assert.equal(ignored.droppedWeapons[0].weapon.durability,73);
 assert.equal(wears(ignored).length,0);
});

test("throwing an offhand weapon into the mirror preserves the main-hand gauge",()=>{
 const s=state({equippedWeapon:mallet({durability:92}),
  offhandWeapon:mallet({name:"Maza secundaria",itemId:911,
   characterItemId:1911,durability:66,materialPhysicalResistance:200}),
  weaponIntegrity:92});
 s.constructions=[mirror()];
 const done=throwAt(s,{targetConstructionId:"mirror-world",attackSource:"OFF_HAND"});
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,92);
 assert.equal(done.actors.PLAYER.weaponIntegrity,92);
 assert.equal(done.actors.PLAYER.offhandWeapon,undefined);
 assert.equal(done.droppedWeapons[0].slot,"OFF_HAND");
 assert.equal(done.droppedWeapons[0].weapon.durability,64);
 assert.equal(wears(done).length,1);
});

test("a fragile mirror wears only pressure absorbed and a broken thrown copy stays broken",()=>{
 const fragile=state({equippedWeapon:mallet({durability:3}),weaponIntegrity:3});
 fragile.constructions=[mirror({durability:5})];
 const weak=throwAt(fragile,{targetConstructionId:"mirror-world"});
 assert.equal(weak.constructions.length,0);
 assert.equal(weak.droppedWeapons[0].weapon.durability,2);
 assert.equal(wears(weak)[0].damage,1);
 const solid=state({equippedWeapon:mallet({durability:3}),weaponIntegrity:3});
 solid.constructions=[mirror()];
 const broken=throwAt(solid,{targetConstructionId:"mirror-world"});
 assert.equal(broken.droppedWeapons[0].weapon.durability,0);
 assert.equal(combatWeaponOperational(broken.droppedWeapons[0].weapon),false);
 assert.equal(broken.log.filter(e=>e.kind==="WEAPON_BREAK").length,1);
});

test("bow shots at tangible mirrors never wear the equipped bow",()=>{
 const s=state({equippedWeapon:{
  name:"Arco",attackType:"BLUNT",mode:"RANGED",
  effectiveRangeMeters:6,maximumRangeMeters:6,durability:45,
  itemId:912,characterItemId:1912
 }});
 s.constructions=[mirror()];
 const hit=applyCombatCommand(s,"PLAYER",{
  kind:"ATTACK",attackType:"BLUNT",attackSource:"MAIN_HAND",
  rangedPhysical:true,targetConstructionId:"mirror-world",areaCenter:{x:.5,y:.5}
 },rolls);
 assert.equal(hit.actors.PLAYER.equippedWeapon.durability,45);
 assert.equal(wears(hit).length,0);
});

test("an anchored mirror can be struck at its real range, not the distant fighter's range",()=>{
 const s=state({}, {positionMeters:6});
 s.constructions=[mirror({fieldPosition:{x:1,y:0}})];
 const hit=meleeAt(s,{targetConstructionId:"mirror-world"});
 assert.equal(hit.constructions[0].durability,75);
 assert.equal(hit.actors.PLAYER.equippedWeapon.durability,69);
 const far=state({}, {positionMeters:1});
 far.constructions=[mirror({fieldPosition:{x:6,y:0}})];
 assert.throws(()=>meleeAt(far,{targetConstructionId:"mirror-world"}),/fuera del alcance/);
});

test("a thrown weapon targeting a distant creature lands at the creature, not the owner",()=>{
 const s=state();s.summons=[summon()];
 const done=throwAt(s,{targetSummonId:"summon-world"});
 assert.equal(done.pending,null);
 assert.deepEqual(done.droppedWeapons[0].fieldPosition,{x:1.1,y:1.1});
 assert.equal(done.droppedWeapons[0].positionMeters,1.1);
 assert.equal(done.droppedWeapons[0].weapon.durability,73,
  "hitting a living creature is not a solid-cover material collision");
 assert.equal(wears(done).length,0);
 assert.equal(done.summons[0].hitCount,1);
});

test("world-position pickup moves diagonally and cannot recover from the wrong lane",()=>{
 const s=state({equippedWeapon:undefined,fieldPosition:{x:0,y:0}});
 s.droppedWeapons=[{owner:"PLAYER",slot:"MAIN_HAND",weapon:mallet(),
  positionMeters:0,fieldPosition:{x:0,y:1}}];
 const half=applyCombatCommand(s,"PLAYER",{
  kind:"MOVE",direction:"WEAPON",meters:.4
 },rolls);
 assert.ok(Math.abs(half.actors.PLAYER.fieldPosition.y-.4)<1e-9);
 assert.equal(half.actors.PLAYER.equippedWeapon,undefined);
 assert.equal(half.droppedWeapons.length,1);
 const fresh=state({equippedWeapon:undefined,fieldPosition:{x:0,y:0}});
 fresh.droppedWeapons=[{owner:"PLAYER",slot:"MAIN_HAND",weapon:mallet(),
  positionMeters:1,fieldPosition:{x:1,y:1}}];
 const done=applyCombatCommand(fresh,"PLAYER",{kind:"MOVE",direction:"WEAPON",meters:2},rolls);
 assert.ok(Math.abs(done.actors.PLAYER.fieldPosition.x-1)<1e-9);
 assert.ok(Math.abs(done.actors.PLAYER.fieldPosition.y-1)<1e-9);
 assert.equal(done.actors.PLAYER.equippedWeapon.characterItemId,1910);
 assert.equal(done.droppedWeapons.length,0);
});

test("old dropped weapon snapshots still support x-only recovery",()=>{
 const s=state({equippedWeapon:undefined,fieldPosition:{x:0,y:.7}});
 s.droppedWeapons=[{owner:"PLAYER",slot:"MAIN_HAND",weapon:mallet(),
  positionMeters:1}];
 const done=applyCombatCommand(s,"PLAYER",{
  kind:"MOVE",direction:"WEAPON",meters:1
 },rolls);
 assert.equal(done.actors.PLAYER.equippedWeapon.characterItemId,1910);
 assert.equal(done.actors.PLAYER.fieldPosition.y,.7);
 assert.equal(done.droppedWeapons.length,0);
});

test("measured cover catches a thrown weapon at the cover's complete world point",()=>{
 const s=state();
 s.constructions=[{
  id:"wall",owner:"NPC",sourceSkillId:55,material:"EARTH",form:"BLOCK",
  label:"Muro",center:{x:.5,y:.5},createdRound:1,
  fieldPosition:{x:1.5,y:0},heightMeters:0,solidHeightMeters:2,
  footprintRadiusMeters:.18,tangible:true,durability:90,hitCount:0,
 }];
 const launched=throwAt(s,{projectileHeights:{launchMeters:1.5,impactMeters:1.5}});
 const done=applyCombatCommand(launched,"NPC",{kind:"DEFEND",defense:"NONE"},rolls);
 assert.equal(done.droppedWeapons[0].positionMeters,1.5);
 assert.deepEqual(done.droppedWeapons[0].fieldPosition,{x:1.5,y:0});
 assert.equal(done.droppedWeapons[0].weapon.durability,69);
});

test("a successful dodge toward a dropped weapon respects the lateral world coordinate",()=>{
 const s=state({
  equippedWeapon:undefined,fieldPosition:{x:0,y:0},speedValue:50,
 },{positionMeters:.5,speedValue:110});
 s.droppedWeapons=[{owner:"PLAYER",slot:"MAIN_HAND",weapon:mallet(),
  positionMeters:0,fieldPosition:{x:0,y:.4}}];
 const launched=applyCombatCommand(s,"NPC",{
  kind:"ATTACK",attackType:"BLUNT",
  trajectory:[{x:.1,y:.5},{x:.5,y:.5}]
 },rolls);
 assert.ok(launched.pending);
 const done=applyCombatCommand(launched,"PLAYER",{
  kind:"DEFEND",defense:"DODGE",dodgeDirection:"WEAPON"
 },{hit:.99,critical:.99,defense:.99});
 assert.ok(Math.abs(done.actors.PLAYER.fieldPosition.y-.4)<1e-9);
 assert.equal(done.actors.PLAYER.equippedWeapon.characterItemId,1910);
 assert.equal(done.droppedWeapons.length,0);
});
