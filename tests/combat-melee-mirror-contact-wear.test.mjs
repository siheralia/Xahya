import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState,applyCombatCommand} from "../lib/combat/turn-engine.ts";
import {combatWeaponOperational} from "../lib/combat/weapon-readiness.ts";
import {weaponWearSinceSnapshot,persistedDurabilityAfterAction} from "../lib/combat/weapon-persistence.ts";

const dice={hit:.01,critical:.99,defense:.99};
const weapon=(name,extra={})=>({
 name,attackType:"BLUNT",mode:"MELEE",effectiveRangeMeters:3,
 maximumRangeMeters:3,durability:100,materialPhysicalResistance:100,
 itemId:451,characterItemId:1451,...extra,
});
const fighter=(name,id,x,more={})=>({
 name,characterId:id,hp:100,maxHp:100,agility:80,speedValue:80,
 strength:30,constitution:11,precision:100,dodge:10,physicalAttack:25,
 physicalDefense:4,magicAttack:20,magicDefense:8,critical:0,luck:10,
 race:20,massKg:70,positionMeters:x,attackType:"BLUNT",
 defenseType:"SOLID",weaponIntegrity:100,spentTicks:0,spentAp:0,
 equippedWeapon:weapon("Maza"),...more,
});
const mirror=(durability,extra={})=>({
 id:"mirror-direct",owner:"NPC",sourceSkillId:5,material:"MIRROR",
 form:"MIRROR",label:"Espejo tangible",center:{x:.5,y:.5},
 createdRound:1,fieldPosition:{x:1.2,y:0},positionMeters:1.2,
 tangible:true,durability,hitCount:0,
 mirror:{rayMultiplier:1,reflectionMultiplier:1,rangeMeters:5,attackType:"PIERCE"},
 ...extra,
});
function setup(mirrorDurability=100,attacker={}){
 const state=newCombatState(
  fighter("Atacante",101,0,attacker),
  fighter("Defensor",102,1.5,{speedValue:75}),
 );
 state.constructions=[mirror(mirrorDurability)];
 state.mana={PLAYER:{current:20,max:20},NPC:{current:20,max:20}};
 return state;
}
const stroke=[{x:.1,y:.9},{x:.5,y:.5}];
const strike=(state,extra={})=>applyCombatCommand(state,"PLAYER",{
 kind:"ATTACK",attackType:"BLUNT",attackSource:"MAIN_HAND",
 targetConstructionId:"mirror-direct",trajectory:stroke,...extra,
},dice);
const wearLog=state=>state.log.filter(e=>e.kind==="WEAPON_WEAR");

test("a direct melee hit against a tangible mirror wears one real main-hand copy",()=>{
 const before=setup();
 const original=structuredClone(before);
 const done=strike(before);
 assert.deepEqual(before,original,"pure combat resolution must not mutate the input");
 assert.equal(done.constructions[0].durability,75);
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,96);
 assert.equal(done.actors.PLAYER.weaponIntegrity,96);
 assert.equal(done.actors.NPC.hp,100);
 assert.equal(wearLog(done).length,1);
 assert.equal(wearLog(done)[0].damage,4);
 assert.match(wearLog(done)[0].summary,/Maza/);
 assert.equal(done.actors.PLAYER.spentAp,1);
 assert.equal(done.pending,null);
 assert.equal(weaponWearSinceSnapshot(100,96,0),4);
 assert.equal(persistedDurabilityAfterAction(100,100,96,0),96);
});

test("legacy commands without an explicit hand use the server-selected main weapon",()=>{
 const done=strike(setup(),{attackSource:undefined});
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,96);
 assert.equal(done.actors.PLAYER.weaponIntegrity,96);
 assert.equal(wearLog(done).length,1);
});

test("fragile mirrors consume only the impact pressure they absorb",()=>{
 const done=strike(setup(5));
 assert.equal(done.constructions.length,0);
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,99);
 assert.deepEqual(wearLog(done).map(e=>e.damage),[1]);
});

test("material resistance reduces mirror contact wear as with physical cover",()=>{
 const s=setup(100,{equippedWeapon:weapon("Maza reforzada",{
  materialPhysicalResistance:200,
 })});
 const done=strike(s);
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,98);
 assert.equal(done.constructions[0].durability,75);
});

test("offhand melee strike wears only the selected offhand copy",()=>{
 const s=setup(100,{
  offhandWeapon:weapon("Maza auxiliar",{
   itemId:452,characterItemId:1452,durability:72,materialPhysicalResistance:200,
  }),
 });
 const done=strike(s,{attackSource:"OFF_HAND"});
 assert.equal(done.actors.PLAYER.offhandWeapon.durability,70);
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,100);
 assert.equal(done.actors.PLAYER.weaponIntegrity,100);
 assert.match(wearLog(done)[0].summary,/auxiliar/);
 assert.equal(persistedDurabilityAfterAction(72,72,70,0),70);
});

test("broken melee weapons cannot strike again until authorized repair",()=>{
 const done=strike(setup(100,{equippedWeapon:weapon("Frágil",{durability:3}),
  weaponIntegrity:3}));
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,0);
 assert.equal(done.actors.PLAYER.weaponIntegrity,0);
 assert.equal(combatWeaponOperational(done.actors.PLAYER.equippedWeapon),false);
 assert.equal(wearLog(done).length,1);
 assert.equal(wearLog(done)[0].damage,3);
 assert.equal(done.log.filter(e=>e.kind==="WEAPON_BREAK").length,1);
 assert.throws(()=>strike(done),/rota/);
});

test("misses, non-tangible mirrors and unarmed strikes do not wear an equipped weapon",()=>{
 const miss=strike(setup(),{trajectory:[{x:0,y:0},{x:.9,y:0}]});
 assert.equal(miss.constructions[0].durability,100);
 assert.equal(miss.actors.PLAYER.equippedWeapon.durability,100);
 assert.equal(wearLog(miss).length,0);
 const ghost=setup();
 ghost.constructions=[mirror(100,{tangible:false})];
 const hit=strike(ghost);
 assert.equal(hit.actors.PLAYER.equippedWeapon.durability,100);
 assert.equal(wearLog(hit).length,0);
 const fist=strike(setup(100,{
  equippedWeapon:undefined,unarmedReachMeters:2,
 }),{attackSource:"FIST_RIGHT"});
 assert.equal(fist.actors.PLAYER.weaponIntegrity,100);
 assert.equal(wearLog(fist).length,0);
});

test("ranged shots and thrown weapons may strike a mirror without wearing the bow or the hand weapon",()=>{
 const bow={name:"Arco",attackType:"PIERCE",mode:"RANGED",
  effectiveRangeMeters:6,maximumRangeMeters:6,durability:67,
  itemId:500,characterItemId:1500};
 const shot=setup(100,{equippedWeapon:bow,attackType:"PIERCE"});
 const shotDone=strike(shot,{attackType:"PIERCE",rangedPhysical:true,areaCenter:{x:.5,y:.5}});
 assert.equal(shotDone.actors.PLAYER.equippedWeapon.durability,67);
 assert.equal(wearLog(shotDone).length,0);
 const thrown=setup(100,{equippedWeapon:weapon("Maza arrojable",{
  durability:55,throwable:true,throwRangeMeters:4,
 })});
 const thrownDone=strike(thrown,{throwWeapon:true,areaCenter:{x:.5,y:.5}});
 assert.equal(thrownDone.droppedWeapons[0].weapon.durability,55);
 assert.equal(wearLog(thrownDone).length,0);
});

test("basic magic reflects without physical weapon wear",()=>{
 const s=setup();
 const done=strike(s,{usesMagic:true,areaCenter:{x:.5,y:.5}});
 assert.equal(done.actors.PLAYER.equippedWeapon.durability,100);
 assert.equal(wearLog(done).length,0);
 assert.equal(done.constructions[0].durability,100);
 assert.ok(done.log.some(e=>e.kind==="REFLECTION"));
});
