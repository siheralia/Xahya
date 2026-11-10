import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 EQUIPPED_WEAR_EFFECT,defaultEquippedWear,compileEquippedWear,
 equipmentWearFromHit,wearableSlotAllowed,
} from "../lib/items/equipped-wear.ts";
import {snapshotEquippedWearables} from "../lib/items/combat-wearables.ts";
import {compileEquippedItemAutoRepair,defaultEquippedItemAutoRepair,
 evaluateEquippedItemAutoRepair} from "../lib/items/auto-repair.ts";
import {
 newCombatState,applyCombatCommand,canAct,
 applyWearableOnConfirmedHpHit,applyWeaponSelfRepairAtRoundStart,
} from "../lib/combat/turn-engine.ts";

const chance={hit:0.01,critical:0.99,defense:0.99};
const fighter=(name,id,pos,more={})=>({
 characterId:id,name,hp:180,maxHp:180,agility:70,speedValue:90,strength:35,
 constitution:14,precision:95,dodge:12,physicalAttack:48,physicalDefense:12,
 magicAttack:20,magicDefense:15,critical:0,luck:12,race:20,massKg:70,
 positionMeters:pos,attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,
 spentTicks:0,spentAp:0,...more
});
const armor=(name="Cota",durability=70,id=123,slot="BODY",type="ARMOR")=>({
 itemId:id,characterItemId:id+1000,name,itemType:type,slot,
 durability,wearOnHit:defaultEquippedWear(),
});
const state=(worn=armor())=>{
 const s=newCombatState(fighter("Atacante",11,0),
  fighter("Defensor",22,0.4,{equippedWearables:[worn]}));
 s.mana={PLAYER:{current:30,max:30},NPC:{current:30,max:30}};
 return s;
};
const hit=(s,defense="NONE")=>{
 const launch=applyCombatCommand(s,"PLAYER",{
  kind:"ATTACK",attackType:"BLUNT",
  trajectory:[{x:0.1,y:0.5},{x:0.5,y:0.5}],
 },chance);
 assert.ok(launch.pending);
 return applyCombatCommand(launch,"NPC",{kind:"DEFEND",defense},chance);
};
const advanceRound=s=>{
 const goal=s.round+1;
 for(let i=0;i<28&&s.round<goal;i++){
  const side=canAct(s,"PLAYER")?"PLAYER":canAct(s,"NPC")?"NPC":null;
  if(!side)throw new Error("Iniciativa sin combatiente disponible");
  s=applyCombatCommand(s,side,{kind:"WAIT"});
 }
 assert.equal(s.round,goal);
 return s;
};
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("wear is opt-in, validated by item type, explicit channel and integer percentage",()=>{
 const base=defaultEquippedWear();
 assert.equal(base.type,EQUIPPED_WEAR_EFFECT);
 assert.equal(compileEquippedWear([],"ARMOR"),null);
 assert.deepEqual(compileEquippedWear([base],"ARMOR"),base);
 assert.deepEqual(compileEquippedWear([base],"ACCESSORY"),base);
 assert.throws(()=>compileEquippedWear([base],"WEAPON"),/armadura o accesorio/);
 assert.throws(()=>compileEquippedWear([base,base],"ARMOR"),/un efecto/);
 for(const n of [0,-1,1.5,101,Infinity,NaN])
  assert.throws(()=>compileEquippedWear([{...base,wearPercent:n}],"ARMOR"),/porcentaje entero/);
 assert.throws(()=>compileEquippedWear([{...base,channel:"OTHER"}],"ARMOR"),/físico, mágico/);
 assert.throws(()=>compileEquippedWear([{...base,free:true}],"ARMOR"),/desconocidos/);
});
test("confirmed actual HP damage wears only the configured damage channel",()=>{
 const rule=defaultEquippedWear();
 assert.equal(equipmentWearFromHit(80,23,false,rule),3);
 assert.equal(equipmentWearFromHit(80,23,true,rule),0);
 assert.equal(equipmentWearFromHit(80,0,false,rule),0);
 assert.equal(equipmentWearFromHit(0,999,false,rule),0);
 assert.equal(equipmentWearFromHit(2,999,false,rule),2);
 assert.equal(equipmentWearFromHit(80,1,false,{...rule,wearPercent:1}),1);
 assert.equal(equipmentWearFromHit(80,5,true,{...rule,channel:"MAGICAL"}),1);
 assert.equal(equipmentWearFromHit(80,5,false,{...rule,channel:"MAGICAL"}),0);
 assert.equal(equipmentWearFromHit(80,5,true,{...rule,channel:"ALL"}),1);
});
test("a real physical hit wears its actual inventory copy, without changing HP damage",()=>{
 const unconfigured=state({...armor(),wearOnHit:undefined});
 const old=hit(unconfigured);
 assert.equal(old.actors.NPC.equippedWearables[0].durability,70);
 const s=state();
 const resolved=hit(s);
 const damage=resolved.log.filter(e=>e.kind==="RESOLVE").at(-1).damage;
 assert.ok(damage>0);
 assert.equal(resolved.actors.NPC.hp,180-damage);
 assert.equal(resolved.actors.NPC.equippedWearables[0].durability,
  70-Math.max(1,Math.ceil(damage*0.1)));
 assert.equal(resolved.log.filter(x=>x.kind==="EQUIPMENT_WEAR").length,1);
 assert.equal(s.actors.NPC.equippedWearables[0].durability,70,"input remains unchanged");
 assert.equal(resolved.actors.PLAYER.hp,180);
});
test("a missed or avoided attack, or irrelevant channel, cannot wear armor",()=>{
 const s=state();
 const launched=applyCombatCommand(s,"PLAYER",{
  kind:"ATTACK",attackType:"BLUNT",trajectory:[{x:0.1,y:0.05},{x:0.5,y:0.05}],
 },chance);
 const missed=applyCombatCommand(launched,"NPC",{kind:"DEFEND",defense:"NONE"},chance);
 assert.equal(missed.actors.NPC.equippedWearables[0].durability,70);
 assert.equal(missed.log.filter(e=>e.kind==="EQUIPMENT_WEAR").length,0);
 const magicOnly=state({...armor(),wearOnHit:{...defaultEquippedWear(),channel:"MAGICAL"}});
 const physical=hit(magicOnly);
 assert.equal(physical.actors.NPC.equippedWearables[0].durability,70);
});
test("multiple armor and accessory copies retain independent configured wear",()=>{
 const s=state();
 s.actors.NPC.equippedWearables=[
  armor("Torso",80,123,"BODY","ARMOR"),
  {...armor("Medallón",33,124,"ACCESSORY_1","ACCESSORY"),
   wearOnHit:{...defaultEquippedWear(),channel:"ALL",wearPercent:50}},
  {...armor("Botas",100,125,"FEET","ARMOR"),wearOnHit:undefined},
 ];
 applyWearableOnConfirmedHpHit(s,"NPC",20,false);
 assert.deepEqual(s.actors.NPC.equippedWearables.map(e=>e.durability),[78,23,100]);
 assert.equal(s.log.filter(x=>x.kind==="EQUIPMENT_WEAR").length,2);
});
test("server snapshot binds armor/accessory to a unique valid equipped copy and slot",()=>{
 const catalog=[
  {id:1,itemType:"ARMOR",name:"Armadura",effects:[defaultEquippedWear(),defaultEquippedItemAutoRepair()]},
  {id:2,itemType:"ACCESSORY",name:"Talismán",effects:[defaultEquippedWear()]},
  {id:3,itemType:"CONSUMABLE",name:"Poción",effects:[]},
 ];
 const owned=[
  {id:101,itemId:1,quantity:1,equipped:true,equippedSlot:"BODY",durability:52},
  {id:102,itemId:2,quantity:1,equipped:true,equippedSlot:"ACCESSORY_1",durability:37},
  {id:103,itemId:1,quantity:1,equipped:false,equippedSlot:"HEAD",durability:99},
  {id:104,itemId:2,quantity:1,equipped:true,equippedSlot:"HEAD",durability:10},
  {id:105,itemId:1,quantity:2,equipped:true,equippedSlot:"ARMS",durability:30},
  {id:106,itemId:3,quantity:1,equipped:true,equippedSlot:"BODY",durability:50},
 ];
 const result=snapshotEquippedWearables(catalog,owned);
 assert.deepEqual(result.map(x=>x.characterItemId),[101,102]);
 assert.equal(result[0].autoRepair.manaCost,5);
 assert.equal(result[0].wearOnHit.wearPercent,10);
 assert.equal(result[1].slot,"ACCESSORY_1");
 assert.ok(wearableSlotAllowed("ARMOR","BODY"));
 assert.ok(wearableSlotAllowed("ARMOR","OFF_HAND",["OFF_HAND"]),"offhand shield is valid");
 assert.ok(wearableSlotAllowed("ACCESSORY","BODY",["BODY"]),"custom slot may be valid");
 assert.ok(!wearableSlotAllowed("ACCESSORY","BODY",["ACCESSORY_1"]),"staff slot restriction applies");
 assert.ok(!wearableSlotAllowed("ARMOR","INVENTORY"));
 const shield=snapshotEquippedWearables([{...catalog[0],allowedSlots:["OFF_HAND"]}],
  [{id:107,itemId:1,quantity:1,equipped:true,equippedSlot:"OFF_HAND",durability:60}]);
 assert.equal(shield[0].slot,"OFF_HAND","a defensive shield may be worn in the hand slot");
 const invalid=snapshotEquippedWearables([{...catalog[0],effects:[{...defaultEquippedWear(),wearPercent:0}]}],
  [owned[0]]);
 assert.equal(invalid[0].wearOnHit,undefined,"legacy invalid staff config is not executed");
});
test("armor and accessories share the paid SOURCE_ITEM graph without touching another item",()=>{
 const rule=defaultEquippedItemAutoRepair();
 assert.ok(compileEquippedItemAutoRepair([rule],"ARMOR"));
 assert.ok(compileEquippedItemAutoRepair([rule],"ACCESSORY"));
 const stats={HP:100,MAX_HP:100};
 const result=evaluateEquippedItemAutoRepair(rule,{characterItemId:123,durability:98},stats,"ARMOR");
 assert.equal(result.restored,2);
 assert.equal(result.after,100);
 assert.deepEqual(result.intents.map(i=>i.characterItemId),[123]);
});
test("equipped armor auto-repair runs at next real round, paid once and keeps other copy intact",()=>{
 const item={...armor("Cota autorreparable",70),autoRepair:defaultEquippedItemAutoRepair()};
 const s=state(item);
 const next=advanceRound(s);
 assert.equal(next.actors.NPC.equippedWearables[0].durability,75);
 assert.equal(next.mana.NPC.current,25);
 assert.equal(next.itemRepairsThisRound[0].characterItemId,1123);
 assert.equal(next.log.filter(e=>e.kind==="EQUIPMENT_REPAIR").length,1);
 applyWeaponSelfRepairAtRoundStart(next,"NPC");
 assert.equal(next.actors.NPC.equippedWearables[0].durability,75);
 assert.equal(next.mana.NPC.current,25);
});
test("no mana, full item and an unequipped item cannot self-repair",()=>{
 const base={...armor(),autoRepair:defaultEquippedItemAutoRepair()};
 const empty=state(base);empty.mana.NPC.current=4;
 const noMana=advanceRound(empty);
 assert.equal(noMana.actors.NPC.equippedWearables[0].durability,70);
 assert.equal(noMana.mana.NPC.current,4);
 const full=state({...base,durability:100});
 const next=advanceRound(full);
 assert.equal(next.mana.NPC.current,30);
 const none=state({...base});
 none.actors.NPC.equippedWearables=[];
 assert.equal(advanceRound(none).mana.NPC.current,30);
});
test("staff management, UI and transaction code integrate the same two declarative contracts",()=>{
 const mgmt=read("app/management/items/page.tsx");
 const api=read("app/api/management/items/route.ts");
 const patch=read("app/api/management/items/[id]/route.ts");
 const duel=read("app/api/combat/duels/route.ts");
 const route=read("app/api/combat/[id]/actions/route.ts");
 const fighter=read("lib/combat/turn-engine.ts");
 const profile=read("app/characters/[id]/page.tsx");
 const store=read("app/store/page.tsx");
 assert.match(mgmt,/Desgaste por impacto recibido/);
 assert.match(mgmt,/Autorreparación de esta armadura/);
 assert.match(mgmt,/Autorreparación de este accesorio/);
 assert.match(api,/compileEquippedWear\(effects,itemType\)/);
 assert.match(patch,/compileEquippedWear\(effects,itemType\)/);
 assert.match(api,/compileEquippedItemAutoRepair\(effects,itemType\)/);
 assert.match(duel,/snapshotEquippedWearables\(catalog,ownerCopies,materials,/);
 assert.match(duel,/snapshotEquippedWearables\(catalog,rivalCopies,materials,/);
 assert.match(fighter,/applyWearableOnConfirmedHpHit\(state,by,actualHpDamage,\s*pending.usesMagic,hpDamageChannels\)/);
 assert.match(fighter,/applyWeaponSelfRepairAtRoundStart\(state,side\)/);
 assert.match(route,/\.\.\.\(fighter.equippedWearables\?\?\[\]\)/);
 assert.match(route,/\.\.\.\(previous.equippedWearables\?\?\[\]\)/);
 assert.match(route,/AND quantity=1/);
 assert.match(profile,/\["WEAPON","ARMOR","ACCESSORY"\]/);
 assert.match(store,/effect.type==="durability_wear_on_hit"/);
});
