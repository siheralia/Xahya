import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {calculateMaterialBlockWear,effectiveMaterialPhysicalResistance,
 NEUTRAL_MATERIAL_PHYSICAL_RESISTANCE} from "../lib/combat/material-durability.ts";
import {newCombatState,applyCombatCommand} from "../lib/combat/turn-engine.ts";

const rolls={hit:0.01,critical:0.99,defense:0.01};
const fighter=(name,id,position,more={})=>({
 characterId:id,name,hp:200,maxHp:200,agility:90,speedValue:id===1?100:80,
 strength:30,constitution:12,precision:100,dodge:12,
 physicalAttack:id===1?80:25,physicalDefense:10,magicAttack:40,magicDefense:5,
 critical:0,luck:15,race:20,massKg:70,positionMeters:position,
 attackType:"PIERCE",defenseType:"CONCENTRATED",weaponIntegrity:100,spentTicks:0,spentAp:0,
 ...more,
});
const weapon=(name,resistance,integrity=100,id=500)=>({
 name,attackType:"PIERCE",mode:"MELEE",effectiveRangeMeters:1.5,
 maximumRangeMeters:1.5,itemId:id,characterItemId:id+1000,
 durability:integrity,materialPhysicalResistance:resistance,
});
function block(materialResistance,options={}){
 const defender=options.defender??fighter("Defensor",2,1,{
  equippedWeapon:weapon("Espada",materialResistance),
 });
 const attacker=fighter("Atacante",1,0,{equippedWeapon:weapon("Estoque",100)});
 const state=newCombatState(attacker,defender);
 const launched=applyCombatCommand(state,"PLAYER",{
  kind:"ATTACK",attackType:"PIERCE",attackSource:"MAIN_HAND",
  trajectory:[{x:0.1,y:0.5},{x:0.5,y:0.5}],
 },rolls);
 assert.ok(launched.pending);
 const resolved=applyCombatCommand(launched,"NPC",{
  kind:"DEFEND",defense:"BLOCK",weaponSlot:options.slot??"MAIN_HAND",
 },rolls);
 return {launched,resolved};
}

test("resistance of assigned material modifies the legacy BLOCK base wear exactly",()=>{
 assert.equal(NEUTRAL_MATERIAL_PHYSICAL_RESISTANCE,100);
 const cases=[
  [80,13],[100,10],[120,9],[140,8],[160,7],
  [undefined,10],[0,10],[null,10],[-1,10],[NaN,10],
 ];
 for(const [resistance,expected] of cases){
  assert.equal(calculateMaterialBlockWear(10,resistance),expected,String(resistance));
 }
 assert.equal(calculateMaterialBlockWear(0,80),0);
 assert.equal(calculateMaterialBlockWear(1,1_000_000),1,
  "minimum one point even for extremely tough materials");
 assert.equal(effectiveMaterialPhysicalResistance(0),100);
 assert.equal(effectiveMaterialPhysicalResistance(160),160);
 assert.equal(effectiveMaterialPhysicalResistance(1_000_001),100);
 assert.throws(()=>calculateMaterialBlockWear(-1,80),/desgaste base/);
 assert.throws(()=>calculateMaterialBlockWear(Infinity,80),/desgaste base/);
});

test("authoritative physical blocking uses resistance of DEFENDER'S own equipped weapon",()=>{
 for(const [resistance,wear] of [[80,13],[100,10],[120,9],[140,8],[160,7],[0,10]]){
  const {launched,resolved}=block(resistance);
  assert.equal(launched.actors.NPC.equippedWeapon.durability,100,"attack launch never wears defender weapon");
  assert.equal(resolved.actors.NPC.equippedWeapon.durability,100-wear,
   "material="+resistance);
  assert.equal(resolved.actors.NPC.weaponIntegrity,100-wear);
  assert.equal(resolved.log.at(-1).weaponIntegrity,100-wear);
  assert.equal(resolved.actors.PLAYER.equippedWeapon.durability,100,
   "defensive wear never touches attacker's weapon");
 }
});

test("offhand blocking reduces only selected offhand durability, not the main weapon",()=>{
 const defender=fighter("Defensor",2,1,{
  equippedWeapon:weapon("Espada de hierro",80,84,501),
  offhandWeapon:weapon("Daga de mitrilo",160,64,502),
  weaponIntegrity:84,
 });
 const {resolved}=block(80,{defender,slot:"OFF_HAND"});
 assert.equal(resolved.actors.NPC.offhandWeapon.durability,57,
  "base 10 wear * 100/160 is rounded up to 7");
 assert.equal(resolved.actors.NPC.equippedWeapon.durability,84);
 assert.equal(resolved.actors.NPC.weaponIntegrity,84,
  "el indicador histórico pertenece a la mano principal, no a la secundaria");
});

test("unconfigured and missing materials use resistance 100 and durability remains 0–100",()=>{
 const {resolved}=block(undefined,{defender:fighter("Defensor",2,1,{
  equippedWeapon:weapon("Espada sin definir",undefined,6,505),weaponIntegrity:6,
 })});
 assert.equal(resolved.actors.NPC.equippedWeapon.durability,0,"wear can break a weapon, not create negative durability");
 const prior=block(0);
 assert.equal(prior.resolved.actors.NPC.equippedWeapon.durability,90);
});

test("block cannot use a nonexistent hand; an unrelated reaction never wears any weapon",()=>{
 const defender=fighter("Defensor",2,1,{
  equippedWeapon:weapon("Solo principal",80,99,509),weaponIntegrity:99,
 });
 const attacker=fighter("Atacante",1,0,{equippedWeapon:weapon("Estoque",100)});
 const state=newCombatState(attacker,defender);
 const launched=applyCombatCommand(state,"PLAYER",{
  kind:"ATTACK",attackType:"PIERCE",attackSource:"MAIN_HAND",
  trajectory:[{x:.1,y:.5},{x:.5,y:.5}],
 },rolls);
 assert.throws(()=>applyCombatCommand(launched,"NPC",{
  kind:"DEFEND",defense:"BLOCK",weaponSlot:"OFF_HAND"},rolls),/arma equipada/);
 assert.equal(launched.actors.NPC.equippedWeapon.durability,99);
 const ended=applyCombatCommand(launched,"NPC",{kind:"DEFEND",defense:"ENDURE"},rolls);
 assert.equal(ended.actors.NPC.equippedWeapon.durability,99);
});

test("older ongoing encounters retain already lost integrity on first action",()=>{
 const defender=fighter("Defensor",2,1,{
  equippedWeapon:weapon("Arma anterior",160,100,510),
  weaponIntegrity:55,
 });
 const attacker=fighter("Atacante",1,0,{equippedWeapon:weapon("Estoque",100)});
 const previousState=newCombatState(attacker,defender);
 // Before this change the persisted JSON held one shared gauge, while the
 // weapon snapshot still contained its original durability.
 delete previousState.perHandWeaponDurability;
 const launched=applyCombatCommand(previousState,"PLAYER",{
  kind:"ATTACK",attackType:"PIERCE",attackSource:"MAIN_HAND",
  trajectory:[{x:0.1,y:0.5},{x:0.5,y:0.5}],
 },rolls);
 assert.equal(launched.actors.NPC.equippedWeapon.durability,55);
 assert.equal(launched.perHandWeaponDurability,true);
 const defended=applyCombatCommand(launched,"NPC",{
  kind:"DEFEND",defense:"BLOCK",weaponSlot:"MAIN_HAND",
 },rolls);
 assert.equal(defended.actors.NPC.equippedWeapon.durability,48,
  "legacy 55 durability minus 7 from mithril's 160 resistance");
 assert.equal(previousState.actors.NPC.equippedWeapon.durability,100,
  "old persisted snapshot was not mutated");
});

test("persistent route, snapshot and combat UI are connected to material and each weapon",()=>{
 const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
 const start=source("app/api/combat/duels/route.ts");
 const save=source("app/api/combat/[id]/actions/route.ts");
 const engine=source("lib/combat/turn-engine.ts");
 const ui=source("app/combat/[id]/CombatEncounter.tsx");
 assert.match(start,/material\.physicalResistance/);
 assert.match(start,/weapon\.materialPhysicalResistance=resistance/);
 assert.match(engine,/calculateMaterialBlockWear\(baseWear,blockWeapon\?\.materialPhysicalResistance\)/);
 assert.match(save,/for\(const weapon of \[fighter\.equippedWeapon,fighter\.offhandWeapon,/);
 assert.match(save,/durability=LEAST\(durability/);
 assert.match(ui,/Arma con la que bloquear/);
 assert.match(ui,/Resistencia física del material/);
 assert.match(ui,/weaponSlot:selectedDefense==="BLOCK"\?activeBlockSlot/);
});
