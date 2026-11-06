import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 combatWeaponOperational,equipmentCopyDurability,
} from "../lib/combat/weapon-readiness.ts";
import {
 newCombatState,applyCombatCommand,basicCounterAttack,defaultAttackSource,
 effectiveWeaponReachMeters,weaponForSource,
} from "../lib/combat/turn-engine.ts";

const rolls={hit:0.01,critical:0.99,defense:0.01};
const weapon=(name,type,durability,id)=>({
 name,attackType:type,mode:"MELEE",effectiveRangeMeters:1.8,
 maximumRangeMeters:2,itemId:id,characterItemId:id+1000,durability,
 materialPhysicalResistance:100,
});
const fighter=(name,id,pos,patch={})=>({
 characterId:id,name,hp:150,maxHp:150,agility:80,speedValue:id===1?100:70,
 strength:35,constitution:12,precision:100,dodge:12,
 physicalAttack:40,physicalDefense:8,magicAttack:0,magicDefense:8,
 critical:0,luck:15,race:20,massKg:70,positionMeters:pos,
 attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,
 spentTicks:0,spentAp:0,
 ...patch,
});
const base=()=>newCombatState(
 fighter("Atacante",1,0,{equippedWeapon:weapon("Martillo","BLUNT",100,501)}),
 fighter("Defensor",2,1,{equippedWeapon:weapon("Espada","CUT",100,502)})
);
const attack=(state)=>applyCombatCommand(state,"PLAYER",
 {kind:"ATTACK",attackType:"BLUNT",attackSource:"MAIN_HAND",
  trajectory:[{x:0.1,y:0.5},{x:0.5,y:0.5}]},rolls);
const defend=(state,command)=>applyCombatCommand(state,"NPC",
 {kind:"DEFEND",...command},rolls);
const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("weapon status is determined by exact instance durability, never item name",()=>{
 const intact=weapon("Espada","CUT",100,501);
 const worn=weapon("Espada","CUT",1,501);
 const broken=weapon("Espada","CUT",0,501);
 assert.equal(combatWeaponOperational(intact),true);
 assert.equal(combatWeaponOperational(worn),true);
 assert.equal(combatWeaponOperational(broken),false);
 assert.equal(combatWeaponOperational({...intact,durability:-1}),false);
 assert.equal(combatWeaponOperational({...intact,durability:NaN}),false);
 assert.equal(combatWeaponOperational({...intact,durability:undefined}),true,
  "legacy snapshots without per-item durability are initially usable");
 assert.equal(combatWeaponOperational(undefined),false);
});

test("the default physical source skips broken main hand, then uses secondary hand, then fists",()=>{
 const f=fighter("A",1,0,{
  equippedWeapon:weapon("Broken","CUT",0,501),
  offhandWeapon:weapon("Good","PIERCE",35,502),
 });
 assert.equal(defaultAttackSource(f),"OFF_HAND");
 assert.equal(weaponForSource(f,"OFF_HAND").durability,35);
 assert.equal(effectiveWeaponReachMeters(f,false,"MAIN_HAND"),0,
  "a broken sword must not lend its reach to an unarmed strike");
 assert.equal(effectiveWeaponReachMeters(f,false,"OFF_HAND"),2);
 f.offhandWeapon.durability=0;
 assert.equal(defaultAttackSource(f),"FIST_RIGHT");
 assert.ok(effectiveWeaponReachMeters(f,false,"FIST_RIGHT")>0);
});

test("a zero-durability weapon cannot attack as melee or be thrown",()=>{
 const s=base();
 s.actors.PLAYER.equippedWeapon={
  ...s.actors.PLAYER.equippedWeapon,throwable:true,throwRangeMeters:5,
  durability:0,
 };
 const before=structuredClone(s);
 for(const command of [
  {kind:"ATTACK",attackType:"BLUNT",attackSource:"MAIN_HAND",
   trajectory:[{x:.1,y:.5},{x:.5,y:.5}]},
  {kind:"ATTACK",attackType:"BLUNT",attackSource:"MAIN_HAND",throwWeapon:true,
   areaCenter:{x:.5,y:.5}},
 ]){
  assert.throws(()=>applyCombatCommand(s,"PLAYER",command,rolls),/rota/);
 }
 assert.deepEqual(s,before,"rejected actions cannot spend PA/ticks or drop items");
 s.actors.NPC.positionMeters=0.5; // within the unarmed reach, not broken weapon reach
 const fist=applyCombatCommand(s,"PLAYER",
  {kind:"ATTACK",attackType:"BLUNT",attackSource:"FIST_RIGHT",
   trajectory:[{x:.1,y:.5},{x:.5,y:.5}]},rolls);
 assert.equal(fist.pending.attackSource,"FIST_RIGHT");
 assert.equal(fist.actors.PLAYER.equippedWeapon.durability,0);
});

test("only the broken hand becomes unusable; a live offhand keeps its attack and own durability",()=>{
 const s=base();
 s.actors.PLAYER.equippedWeapon.durability=0;
 s.actors.PLAYER.offhandWeapon=weapon("Daga","PIERCE",38,503);
 assert.equal(defaultAttackSource(s.actors.PLAYER),"OFF_HAND");
 const launched=applyCombatCommand(s,"PLAYER",
  {kind:"ATTACK",attackType:"PIERCE",attackSource:"OFF_HAND",
   trajectory:[{x:.1,y:.5},{x:.5,y:.5}]},rolls);
 assert.equal(launched.pending.attackSource,"OFF_HAND");
 assert.equal(launched.actors.PLAYER.offhandWeapon.durability,38);
 assert.equal(launched.actors.PLAYER.equippedWeapon.durability,0);
});

test("blocking can break exactly the selected weapon, leave the other copy alone and log breakage",()=>{
 const s=base();
 s.actors.NPC.equippedWeapon.durability=2;
 s.actors.NPC.offhandWeapon=weapon("Daga","PIERCE",70,503);
 const result=defend(attack(s),{defense:"BLOCK",weaponSlot:"MAIN_HAND"});
 assert.equal(result.actors.NPC.equippedWeapon.durability,0);
 assert.equal(result.actors.NPC.offhandWeapon.durability,70);
 assert.equal(result.actors.NPC.weaponIntegrity,0);
 assert.ok(result.log.some(e=>e.kind==="WEAPON_BREAK"&&/Espada/.test(e.summary)));
 assert.equal(result.log.filter(e=>e.kind==="WEAPON_BREAK").length,1);
 assert.equal(defaultAttackSource(result.actors.NPC),"OFF_HAND");
});

test("explicit blocking with a broken copy is rejected; implicit block uses intact offhand",()=>{
 const s=base();
 s.actors.NPC.equippedWeapon.durability=0;
 s.actors.NPC.offhandWeapon=weapon("Daga","PIERCE",90,503);
 const launched=attack(s);
 assert.throws(()=>defend(launched,{defense:"BLOCK",weaponSlot:"MAIN_HAND"}),/rota/);
 assert.equal(launched.actors.NPC.spentAp,0);
 const fallback=defend(launched,{defense:"BLOCK"});
 assert.equal(fallback.actors.NPC.equippedWeapon.durability,0);
 assert.ok(fallback.actors.NPC.offhandWeapon.durability<90);
 assert.ok(fallback.actors.NPC.offhandWeapon.durability>0);
 assert.equal(fallback.actors.NPC.weaponIntegrity,
  fallback.actors.NPC.offhandWeapon.durability);
});

test("legacy unarmed BLOCK remains compatible and does not invent a new weapon",()=>{
 const s=base();
 s.actors.NPC.equippedWeapon=undefined;
 s.actors.NPC.offhandWeapon=undefined;
 const outcome=defend(attack(s),{defense:"BLOCK"});
 assert.equal(outcome.actors.NPC.equippedWeapon,undefined);
 assert.equal(outcome.actors.NPC.offhandWeapon,undefined);
 assert.ok(outcome.actors.NPC.weaponIntegrity<100);
 assert.ok(outcome.actors.NPC.spentAp>0);
});

test("counterattack can continue unarmed or with an intact offhand when the main armament breaks",()=>{
 const s=base();
 s.actors.NPC.equippedWeapon.durability=0;
 s.actors.NPC.offhandWeapon=undefined;
 s.actors.NPC.positionMeters=.5; // a fist is shorter than the broken sword
 let launched=attack(s);
 const plan=basicCounterAttack(launched,"NPC",false);
 assert.equal(plan.attackSource,"FIST_RIGHT");
 assert.equal(plan.attackType,"BLUNT");
 const counter=defend(launched,{defense:"COUNTER",counterMagic:false});
 assert.equal(counter.pending,null);
 assert.ok(counter.log.some(e=>e.kind==="RESOLVE"&&e.by==="NPC"));
 assert.equal(counter.actors.NPC.equippedWeapon.durability,0);
});

test("separating an inventory stack keeps the exact original instance wear",()=>{
 for(const d of [0,1,23,76,100]){
  assert.equal(equipmentCopyDurability(d),d);
 }
 assert.equal(equipmentCopyDurability(undefined),100);
 assert.equal(equipmentCopyDurability(null),100);
 for(const invalid of [-1,101,2.5,NaN,Infinity]){
  assert.throws(()=>equipmentCopyDurability(invalid),/Durabilidad/);
 }
 const equipment=source("app/api/characters/[id]/equipment/route.ts");
 assert.match(equipment,/durability: equipmentCopyDurability\(owned\.durability\)/,
  "the newly equipped copy cannot reset to the DB default 100");
 assert.match(equipment,/quantity: Number\(owned\.quantity\) - 1/);
 assert.match(equipment,/characterItemId: equippedId/);
});

test("combat API saves per-copy wear by inventory ID and guards against write-back repairs",()=>{
 const api=source("app/api/combat/[id]/actions/route.ts");
 assert.match(api,/for\(const weapon of \[fighter\.equippedWeapon,fighter\.offhandWeapon,/);
 assert.match(api,/"characterItemId"|weapon\.characterItemId/);
 assert.match(api,/durability=LEAST\(durability/);
 assert.doesNotMatch(api,/AND equipped=true/,
  "item identity must survive a slot change while the battle snapshot is active");
 assert.match(api,/AND "itemId"=\$\{weapon\.itemId\?\?0\}/);
 const encounter=source("app/api/combat/duels/route.ts");
 assert.match(encounter,/characterItemId:Number\(equipped\.id\)/);
 assert.match(encounter,/durability:Math\.max\(0,Math\.min\(100,Number\(equipped\.durability\?\?100\)\)\)/);
});

test("combat editor indicates a broken weapon and never selects it as an active BLOCK hand",()=>{
 const view=source("app/combat/[id]/CombatEncounter.tsx");
 assert.match(view,/ROTA \(no utilizable\)/);
 assert.match(view,/combatWeaponOperational\(actor\?\.equippedWeapon\)/);
 assert.match(view,/combatWeaponOperational\(actor\?\.offhandWeapon\)/);
 assert.match(view,/Arma con la que bloquear/);
});
