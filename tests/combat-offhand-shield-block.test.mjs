import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newCombatState,applyCombatCommand,applyWearableOnConfirmedHpHit,
 applyWeaponSelfRepairAtRoundStart} from "../lib/combat/turn-engine.ts";
import {snapshotEquippedWearables,offhandArmorShield} from "../lib/items/combat-wearables.ts";
import {defaultEquippedItemAutoRepair} from "../lib/items/auto-repair.ts";
import {defaultEquippedWear} from "../lib/items/equipped-wear.ts";
import {weaponWearSinceSnapshot,persistedDurabilityAfterAction}
 from "../lib/combat/weapon-persistence.ts";

const rolls={hit:.01,critical:.99,defense:.01};
const weapon=(durability=90)=>({
 name:"Espada",attackType:"BLUNT",mode:"MELEE",
 effectiveRangeMeters:1.5,maximumRangeMeters:2,
 itemId:201,characterItemId:1201,durability,
 materialPhysicalResistance:100,
});
const shield=(durability=70,more={})=>({
 itemId:202,characterItemId:1202,name:"Escudo",
 itemType:"ARMOR",slot:"OFF_HAND",durability,
 materialPhysicalResistance:100,...more,
});
const fighter=(name,id,x,extra={})=>({
 characterId:id,name,hp:180,maxHp:180,
 agility:80,speedValue:id===1?100:70,strength:35,constitution:12,
 precision:100,dodge:12,physicalAttack:40,physicalDefense:8,
 magicAttack:20,magicDefense:8,critical:0,luck:15,race:20,massKg:70,
 positionMeters:x,attackType:"BLUNT",defenseType:"SOLID",
 weaponIntegrity:100,spentTicks:0,spentAp:0,...extra,
});
const state=(defender={})=>{
 const s=newCombatState(fighter("Atacante",1,0),
  fighter("Defensor",2,1,{equippedWearables:[shield()],...defender}));
 s.mana={PLAYER:{current:50,max:50},NPC:{current:50,max:50}};
 return s;
};
const attack=s=>applyCombatCommand(s,"PLAYER",{
 kind:"ATTACK",attackType:"BLUNT",trajectory:[{x:.1,y:.5},{x:.5,y:.5}],
},rolls);
const block=(s,slot)=>applyCombatCommand(attack(s),"NPC",{
 kind:"DEFEND",defense:"BLOCK",...(slot?{weaponSlot:slot}:{}),
},rolls);
const events=(s,kind)=>s.log.filter(e=>e.kind===kind);

test("an OFF_HAND armor shield is recognized by category and slot, not its name",()=>{
 assert.equal(offhandArmorShield([shield()])?.characterItemId,1202);
 assert.equal(offhandArmorShield([{...shield(),name:"Manopla"}])?.name,"Manopla");
 assert.equal(offhandArmorShield([{...shield(),itemType:"ACCESSORY"}]),undefined);
 assert.equal(offhandArmorShield([{...shield(),slot:"BODY"}]),undefined);
 assert.equal(offhandArmorShield(undefined),undefined);
});

test("explicit shield BLOCK wears only the real armor copy, not a legacy hand gauge",()=>{
 const before=state(),original=structuredClone(before);
 const done=block(before,"OFF_HAND");
 assert.deepEqual(before,original);
 assert.equal(done.pending,null);
 assert.equal(done.actors.NPC.equippedWearables[0].durability,65);
 assert.equal(done.actors.NPC.weaponIntegrity,100);
 assert.equal(done.actors.NPC.equippedWeapon,undefined);
 assert.equal(done.actors.NPC.offhandWeapon,undefined);
 assert.equal(done.actors.NPC.spentAp,1);
 assert.equal(events(done,"EQUIPMENT_BREAK").length,0);
 assert.equal(weaponWearSinceSnapshot(70,65,0),5);
 assert.equal(persistedDurabilityAfterAction(70,70,65,0),65);
});

test("automatic BLOCK chooses a real main weapon before a shield",()=>{
 const s=state({equippedWeapon:weapon(),weaponIntegrity:90});
 const done=block(s);
 assert.equal(done.actors.NPC.equippedWeapon.durability,85);
 assert.equal(done.actors.NPC.weaponIntegrity,85);
 assert.equal(done.actors.NPC.equippedWearables[0].durability,70);
});

test("a broken main weapon falls back to an intact secondary shield without cross-wear",()=>{
 const s=state({equippedWeapon:weapon(0),weaponIntegrity:0});
 const done=block(s);
 assert.equal(done.actors.NPC.equippedWeapon.durability,0);
 assert.equal(done.actors.NPC.weaponIntegrity,0);
 assert.equal(done.actors.NPC.equippedWearables[0].durability,65);
 assert.equal(events(done,"EQUIPMENT_BREAK").length,0);
});

test("material resistance of a shield reduces blocking wear just like a weapon",()=>{
 const s=state({equippedWearables:[shield(70,{materialPhysicalResistance:200})]});
 const done=block(s,"OFF_HAND");
 assert.equal(done.actors.NPC.equippedWearables[0].durability,67);
 assert.equal(done.actors.NPC.weaponIntegrity,100);
});

test("an OFF_HAND armor shield can break on impact without inventing a broken weapon",()=>{
 const s=state({equippedWearables:[shield(2)]});
 const done=block(s,"OFF_HAND");
 assert.equal(done.actors.NPC.equippedWearables[0].durability,0);
 assert.equal(done.actors.NPC.weaponIntegrity,100);
 assert.equal(events(done,"EQUIPMENT_BREAK").length,1);
 assert.equal(events(done,"WEAPON_BREAK").length,0);
 assert.match(events(done,"EQUIPMENT_BREAK")[0].summary,/Escudo/);
});

test("explicitly blocking with a broken shield rejects before spending PA or mutating combat",()=>{
 const s=state({equippedWearables:[shield(0)]}),before=structuredClone(s);
 assert.throws(()=>block(s,"OFF_HAND"),/roto/);
 assert.deepEqual(s,before);
});

test("a broken shield never grants free unarmed full-integrity BLOCK",()=>{
 const s=state({equippedWearables:[shield(0)]});
 const done=block(s);
 assert.equal(done.actors.NPC.equippedWearables[0].durability,0);
 assert.equal(done.actors.NPC.weaponIntegrity,100);
 assert.equal(events(done,"EQUIPMENT_BREAK").length,0);
 assert.ok(done.actors.NPC.hp<180,"a zero-integrity shield cannot intercept the hit");
});

test("an accessory or body armor cannot masquerade as an OFF_HAND shield",()=>{
 for(const bad of [{itemType:"ACCESSORY"},{slot:"BODY"}]){
  const s=state({equippedWearables:[shield(80,bad)]});
  const before=structuredClone(s);
  assert.throws(()=>block(s,"OFF_HAND"),/No tienes un arma o escudo/);
  assert.deepEqual(s,before);
 }
});

test("a broken shield can auto-repair its own copy on an authorized round start",()=>{
 const s=state({equippedWearables:[shield(0,{autoRepair:defaultEquippedItemAutoRepair()})]});
 s.round=2;
 applyWeaponSelfRepairAtRoundStart(s,"NPC");
 assert.equal(s.actors.NPC.equippedWearables[0].durability,5);
 assert.equal(s.actors.NPC.weaponIntegrity,100);
 assert.equal(s.mana.NPC.current,45);
 assert.equal(s.itemRepairsThisRound[0].characterItemId,1202);
 assert.equal(events(s,"EQUIPMENT_REPAIR").length,1);
 applyWeaponSelfRepairAtRoundStart(s,"NPC");
 assert.equal(s.mana.NPC.current,45);
 const fixed=block({...s,round:1,
   actors:{...s.actors,NPC:{...s.actors.NPC,spentAp:0,spentTicks:0}}},"OFF_HAND");
 assert.equal(fixed.actors.NPC.equippedWearables[0].durability,0,
  "a freshly repaired five-point shield can be used and wear back to zero");
});

test("HP wear on armor or accessories logs only actual transition to broken",()=>{
 const s=state({equippedWearables:[
  {...shield(1),wearOnHit:defaultEquippedWear()},
  {...shield(2),slot:"ACCESSORY_1",itemType:"ACCESSORY",
   characterItemId:1203,itemId:203,wearOnHit:defaultEquippedWear()},
 ]});
 applyWearableOnConfirmedHpHit(s,"NPC",40,false);
 assert.deepEqual(s.actors.NPC.equippedWearables.map(w=>w.durability),[0,0]);
 assert.equal(events(s,"EQUIPMENT_BREAK").length,2);
 applyWearableOnConfirmedHpHit(s,"NPC",40,false);
 assert.equal(events(s,"EQUIPMENT_BREAK").length,2,"broken gear cannot break again");
});

test("server snapshot binds shield material and the exact inventory copy",()=>{
 const definitions=[{id:202,name:"Escudo de acero",itemType:"ARMOR",
  allowedSlots:["OFF_HAND"],materialId:900,effects:[]}];
 const materials=[{id:900,name:"Acero reforzado",physicalResistance:250}];
 const copies=[{id:1202,itemId:202,quantity:1,equipped:true,
  equippedSlot:"OFF_HAND",durability:36}];
 const result=snapshotEquippedWearables(definitions,copies,materials);
 assert.equal(result.length,1);
 assert.equal(result[0].characterItemId,1202);
 assert.equal(result[0].materialPhysicalResistance,250);
 assert.equal(result[0].materialName,"Acero reforzado");
 assert.equal(offhandArmorShield(result)?.durability,36);
 const invalid=snapshotEquippedWearables(definitions,copies,
  [{...materials[0],physicalResistance:-5}]);
 assert.equal(invalid[0].materialPhysicalResistance,undefined);
});

test("duel server, inventory persistence, and defender UI all use shield snapshot",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const duel=read("app/api/combat/duels/route.ts");
 const route=read("app/api/combat/[id]/actions/route.ts");
 const ui=read("app/combat/[id]/CombatEncounter.tsx");
 assert.match(duel,/snapshotEquippedWearables\(catalog,ownerCopies,materials\)/);
 assert.match(route,/\.\.\.\(fighter\.equippedWearables\?\?\[\]\)/);
 assert.match(route,/persistedCopies\.has\(weapon\.characterItemId\)/);
 assert.match(ui,/offhandArmorShield\(actor\?\.equippedWearables\)/);
 assert.match(ui,/Escudo · \{offhandShield\.name\}/);
 assert.match(ui,/Arma con la que bloquear \(o escudo\)/);
});
