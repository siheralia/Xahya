import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 combatEquipmentCounts,equipmentCondition,equipmentSlotName,equipmentStatLabel,
 explainEquipmentRecovery,nextAutoRepairRound,recentEquipmentEvents
} from "../lib/combat/equipment-feedback.ts";
import {
 newCombatState,applyCombatCommand,applyWearableOnConfirmedHpHit,canAct,
 applyWeaponSelfRepairAtRoundStart
} from "../lib/combat/turn-engine.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";
import {defaultEquippedItemAutoRepair} from "../lib/items/auto-repair.ts";
import {defaultEquippedWear} from "../lib/items/equipped-wear.ts";

const fighter=(name,id,x,more={})=>({
 characterId:id,name,hp:170,maxHp:170,agility:80,speedValue:85,
 strength:35,constitution:12,precision:100,dodge:10,physicalAttack:40,
 physicalDefense:15,magicAttack:30,magicDefense:12,
 critical:0,luck:10,race:20,massKg:70,positionMeters:x,
 attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,
 spentAp:0,spentTicks:0,...more,
});
const shield=(durability=70,extra={})=>({
 itemId:210,characterItemId:2210,name:"Escudo de prueba",
 itemType:"ARMOR",slot:"OFF_HAND",durability,
 wearOnHit:defaultEquippedWear(),autoRepair:defaultEquippedItemAutoRepair(),
 materialPhysicalResistance:100,...extra,
});
const armor=(durability=75,extra={})=>({
 itemId:211,characterItemId:2211,name:"Coraza de prueba",
 itemType:"ARMOR",slot:"BODY",durability,
 wearOnHit:defaultEquippedWear(),...extra,
});
const encounter=(items=[shield(),armor()])=>{
 const s=newCombatState(fighter("Atacante",11,0),
  fighter("Defensora",22,.5,{equippedWearables:items}));
 s.mana={PLAYER:{current:30,max:30},NPC:{current:30,max:30}};
 return s;
};
const dice={hit:.01,critical:.99,defense:.01};
const advanceRound=start=>{
 let s=start;
 const until=s.round+1;
 for(let i=0;i<20&&s.round<until;i++){
  const active=canAct(s,"PLAYER")?"PLAYER":canAct(s,"NPC")?"NPC":null;
  assert.ok(active,"combat must allow initiative progression");
  s=applyCombatCommand(s,active,{kind:"WAIT"},dice);
 }
 assert.equal(s.round,until);
 return s;
};

test("durability labels distinguish intact, worn and broken real items",()=>{
 assert.equal(equipmentCondition({durability:100}),"INTACT");
 assert.equal(equipmentCondition({durability:26}),"INTACT");
 assert.equal(equipmentCondition({durability:25}),"DAMAGED");
 assert.equal(equipmentCondition({durability:1}),"DAMAGED");
 assert.equal(equipmentCondition({durability:0}),"BROKEN");
 assert.equal(equipmentSlotName("OFF_HAND"),"Mano secundaria (escudo)");
 assert.equal(equipmentSlotName("BODY"),"Torso");
 assert.equal(equipmentSlotName("ACCESSORY_1"),"Accesorio 1");
 assert.match(equipmentSlotName("CUSTOM_SLOT"),/Ranura/);
});

test("repair timing is the next valid round, not an immediate clickable recovery",()=>{
 assert.equal(nextAutoRepairRound(1,1),2);
 assert.equal(nextAutoRepairRound(2,1),3);
 assert.equal(nextAutoRepairRound(2,2),4);
 assert.equal(nextAutoRepairRound(3,2),4);
 assert.equal(nextAutoRepairRound(4,2),6);
 assert.equal(nextAutoRepairRound(5,3),8);
 assert.equal(nextAutoRepairRound(0,1),null);
 assert.equal(nextAutoRepairRound(3,0),null);
 const item=shield(0);
 assert.match(explainEquipmentRecovery(item,1,12),/ronda 2/);
 assert.match(explainEquipmentRecovery(item,2,12),/ronda 3/);
 assert.match(explainEquipmentRecovery(item,2,4),/Maná insuficiente/);
 assert.match(explainEquipmentRecovery(item,2,4),/necesitas 5/);
 assert.match(explainEquipmentRecovery({...item,autoRepairDisabled:true},2,12),/desactivada/);
 assert.match(explainEquipmentRecovery({...item,autoRepair:undefined},2,12),/Sin autorreparación/);
 assert.match(explainEquipmentRecovery(shield(100),2,12),/Durabilidad completa/);
});

test("player-facing combat stat names never leak technical property identifiers",()=>{
 for(const [key,label] of Object.entries({
  physicalAttack:"Ataque físico",physicalDefense:"Defensa física",
  magicAttack:"Ataque mágico",magicDefense:"Defensa mágica",
  strength:"Fuerza",agility:"Agilidad",constitution:"Constitución",
  maxHp:"HP máximo",maxMana:"Maná máximo",
  speedValue:"Velocidad de combate",race:"Carrera"
 }))assert.equal(equipmentStatLabel(key),label);
 assert.equal(equipmentStatLabel("CUSTOM"),"CUSTOM");
});

test("real shield BLOCK breaks the correct equipment copy; HUD summary changes",()=>{
 const initial=encounter([shield(2),armor(77)]);
 const source=structuredClone(initial);
 const attack=applyCombatCommand(initial,"PLAYER",{
  kind:"ATTACK",attackType:"BLUNT",trajectory:[{x:.1,y:.5},{x:.5,y:.5}],
 },dice);
 assert.ok(attack.pending,"an actual defender reaction is expected");
 const blocked=applyCombatCommand(attack,"NPC",{
  kind:"DEFEND",defense:"BLOCK",weaponSlot:"OFF_HAND",
 },dice);
 assert.equal(blocked.pending,null);
 assert.equal(blocked.actors.NPC.equippedWearables[0].durability,0);
 assert.equal(blocked.actors.NPC.equippedWearables[1].durability,76,
  "a partial BLOCK leaves real HP damage, which also wears configured armor");
 assert.deepEqual(combatEquipmentCounts(blocked,"NPC"),{total:2,broken:1,damaged:0});
 const timeline=recentEquipmentEvents(blocked,"NPC");
 assert.ok(timeline.some(x=>x.type==="BREAK"&&/Escudo/.test(x.text)));
 assert.ok(timeline.some(x=>x.item==="Escudo de prueba"&&x.type==="BREAK"));
 assert.ok(timeline.some(x=>x.item==="Coraza de prueba"&&x.type==="WEAR"),
  "the second item wears from residual HP damage, not from the shield block itself");
 assert.deepEqual(initial,source,"the engine must not mutate a user's previous view");
 const restored=advanceRound(blocked);
 assert.equal(restored.actors.NPC.equippedWearables[0].durability,5);
 assert.equal(restored.mana.NPC.current,25);
 assert.deepEqual(combatEquipmentCounts(restored,"NPC"),{total:2,broken:0,damaged:1});
 assert.ok(recentEquipmentEvents(restored,"NPC").some(x=>x.type==="REPAIR"));
 assert.equal(recentEquipmentEvents(restored,"NPC").filter(x=>x.type==="REPAIR").length,1);
});

test("confirmed HP wear displays separate copy events and direct stat changes in Spanish",()=>{
 const s=encounter([
  armor(1,{statBonuses:{physicalDefense:6}}),
  {...armor(1),characterItemId:2212,itemId:212,name:"Otro peto",
   slot:"ACCESSORY_1",itemType:"ACCESSORY"},
 ]);
 applyWearableOnConfirmedHpHit(s,"NPC",25,false);
 assert.deepEqual(s.actors.NPC.equippedWearables.map(x=>x.durability),[0,0]);
 assert.equal(s.actors.NPC.physicalDefense,9,"the correct direct stat bonus was revoked");
 const events=recentEquipmentEvents(s,"NPC",10);
 assert.equal(events.filter(e=>e.type==="BREAK").length,2);
 assert.ok(events.some(e=>e.type==="STATS"&&e.text.includes("Defensa física -6")),
  "combat narration should use Spanish stat names");
 assert.equal(recentEquipmentEvents(s,"PLAYER").length,0);
 assert.equal(combatEquipmentCounts(s,"NPC").broken,2);
});

test("client sees current durability and resources but not server-only factor recipe",()=>{
 const s=encounter();
 const secret={formulas:{physicalAttack:{raw:900}},basicReplay:{catalog:[{formula:"strength*2"}]}};
 s.actors.NPC.equipmentDerivedReplay=secret;
 s.actors.PLAYER.equipmentDerivedReplay=structuredClone(secret);
 const client=combatClientView(s);
 assert.ok(!Object.hasOwn(client.actors.NPC,"equipmentDerivedReplay"));
 assert.ok(!Object.hasOwn(client.actors.PLAYER,"equipmentDerivedReplay"));
 assert.equal(client.actors.NPC.equippedWearables[0].durability,70);
 assert.equal(client.mana.NPC.current,30);
 assert.deepEqual(s.actors.NPC.equipmentDerivedReplay,secret,
  "server source still owns the authoritative replay");
});

test("equipment panel is the encounter snapshot, while historical sheet list is secondary",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const page=read("app/combat/[id]/CombatEncounter.tsx");
 const hud=read("app/combat/[id]/CombatCharacterHud.tsx");
 const panel=read("app/combat/[id]/CombatEquipmentStatus.tsx");
 const api=read("lib/combat/magic-area.ts");
 assert.match(page,/<CombatEquipmentStatus state=\{state\} side=\{side\}/);
 assert.match(page,/Inventario completo de la ficha \(referencia\)/);
 assert.match(page,/Estado reciente del equipamiento/);
 assert.match(page,/Ver durabilidad, efectos y reparación/);
 assert.match(hud,/brokenEquipment>0&&<button/);
 assert.match(hud,/piezas rotas/);
 assert.match(panel,/fighter\.equippedWearables/);
 assert.match(panel,/explainEquipmentRecovery\(/);
 assert.match(page,/La durabilidad ganada o perdida/);
 assert.match(api,/delete clone\.actors\.NPC\.equipmentDerivedReplay/);
 assert.match(api,/delete clone\.actors\.PLAYER\.equipmentDerivedReplay/);
});

test("UI audit: disabled actions have explanations and no fabricated manual repair button",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const page=read("app/combat/[id]/CombatEncounter.tsx");
 const panel=read("app/combat/[id]/CombatEquipmentStatus.tsx");
 assert.match(page,/disabled=\{!canExecuteAttack\("BEFORE"\)\}/);
 assert.match(page,/disabled=\{!canExecuteAttack\(\)\}/);
 assert.match(page,/El objetivo sigue fuera de alcance/);
 assert.match(page,/Necesitas 2 PA para combinar/);
 assert.match(read("app/combat/[id]/CombatSkillLoadout.tsx"),/combatSkillBlockers\(skill/);
 assert.match(read("lib/combat/skill-cast-feedback.ts"),/Maná insuficiente/);
 assert.match(page,/defending\?" Elige cómo responder/);
 assert.match(page,/panel==="skills"/);
 assert.match(panel,/No hay un botón de reparación manual/);
 assert.match(panel,/Al restaurarse la capacidad máxima/);
});
