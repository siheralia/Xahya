import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {MATERIAL_TYPES,validateMaterialDraft,selectedMaterialId,itemMaterialLabel} from "../lib/items/materials.ts";
import {compileCombatConsumable,characterCombatConsumables,npcStartingConsumables} from "../lib/items/combat-consumables.ts";
import {newCombatState,applyResolvedCombatConsumable,applyCombatCommand} from "../lib/combat/turn-engine.ts";

const fighter=(name,id,patch={})=>({
 characterId:id,name,hp:30,maxHp:50,agility:80,speedValue:90,
 strength:30,constitution:12,precision:100,dodge:12,
 physicalAttack:35,physicalDefense:7,magicAttack:40,magicDefense:5,
 critical:0,luck:15,race:20,massKg:70,positionMeters:id===null?1.5:0,
 attackType:"PIERCE",defenseType:"CONCENTRATED",weaponIntegrity:100,spentTicks:0,spentAp:0,...patch
});
const potion=(id,name,action,value)=>({
 id,name,itemType:"CONSUMABLE",acquisitionType:"PURCHASABLE",
 effects:[{type:"system_action",action,value,stat:action==="HEAL_HP"?"HP":"MANA"}]
});
const hp=potion(900,"Poción de salud","HEAL_HP",10),mana=potion(901,"Poción de maná","RESTORE_MANA",20);
const state=()=>{
 const s=newCombatState(fighter("Jugador",101),fighter("NPC",null,{hp:25,maxHp:50,speedValue:75}));
 s.mana={PLAYER:{current:10,max:30},NPC:{current:5,max:30}};
 s.consumables={
  PLAYER:characterCombatConsumables([hp,mana],[
   {id:501,itemId:900,quantity:2},{id:502,itemId:901,quantity:1}]),
  NPC:npcStartingConsumables([hp,mana],()=>0.5),
 };
 return s;
};

test("material validation supports all reference categories and optional values",()=>{
 assert.deepEqual(MATERIAL_TYPES.map(x=>x.value),
  ["WOOD","METAL","MINERAL","LIQUID","PLANT","BONE","SKIN","CLOTH"]);
 const draft=validateMaterialDraft({
  name:" Acero ",type:"METAL",hardness:85,physicalResistance:60,magicResistance:30,
  attackGrant:10,defenseGrant:5,weightPerUnitKg:0.75,
  marketForm:"Lingote",fireReaction:"Se calienta"});
 assert.equal(draft.name,"Acero");
 assert.equal(draft.type,"METAL");
 assert.equal(draft.weightPerUnitKg,0.75);
 assert.equal(draft.marketForm,"Lingote");
 assert.equal(draft.iceReaction,null);
 assert.equal(draft.active,true);
 assert.equal(selectedMaterialId(null),null);
 assert.equal(selectedMaterialId(""),null);
 assert.equal(selectedMaterialId("17"),17);
 assert.equal(itemMaterialLabel(null),"Sin definir");
 assert.throws(()=>selectedMaterialId("abc"),/Material/);
 for(const bad of [0,-1,1.25])assert.throws(()=>selectedMaterialId(bad),/Material/);
 assert.throws(()=>validateMaterialDraft({name:"X",type:"invalid type"}),/tipo/);
 assert.equal(validateMaterialDraft({name:"Cristal",type:"CRYSTAL",physicalResistance:250}).physicalResistance,250,
  "new catalog types and high-grade resistance are accepted");
 assert.equal(validateMaterialDraft({name:"M",type:"METAL",hardness:160}).hardness,160);
 assert.throws(()=>validateMaterialDraft({name:"M",type:"METAL",hardness:1000001}),/Dureza/);
 assert.throws(()=>validateMaterialDraft({name:"M",type:"METAL",weightPerUnitKg:-3}),/peso/);
});

test("only explicitly compiled, bounded healing recipes become consumable actions",()=>{
 assert.deepEqual(compileCombatConsumable(hp),{itemId:900,name:"Poción de salud",action:"HEAL_HP",amount:10});
 assert.equal(compileCombatConsumable({...hp,itemType:"WEAPON"}),null);
 assert.equal(compileCombatConsumable({...hp,effects:[...hp.effects,...hp.effects]}),null);
 assert.equal(compileCombatConsumable({...hp,effects:[{type:"system_action",action:"ESCAPE_MAZE",value:1}]}),null);
 assert.equal(compileCombatConsumable({...hp,effects:[{type:"system_action",action:"HEAL_HP",value:1.5}]}),null);
 assert.equal(compileCombatConsumable({...hp,effects:[{type:"system_action",action:"HEAL_HP",value:1001}]}),null);
});

test("inventory snapshot retains real characterItem id and stack count",()=>{
 assert.deepEqual(characterCombatConsumables([hp,mana],[{id:1,itemId:900,quantity:2},
  {id:2,itemId:901,quantity:0},{id:3,itemId:999,quantity:1}]),
  [{itemId:900,name:"Poción de salud",action:"HEAL_HP",amount:10,characterItemId:1,quantity:2}]);
});

test("NPC starts with one random potion of each type, with no real inventory row",()=>{
 const stock=npcStartingConsumables([hp,mana,potion(902,"Salud pequeña","HEAL_HP",3)],()=>0.99);
 assert.equal(stock.length,2);
 assert.deepEqual(stock.map(x=>x.action),["HEAL_HP","RESTORE_MANA"]);
 assert.deepEqual(stock.map(x=>x.quantity),[1,1]);
 assert.ok(stock.every(x=>x.characterItemId===undefined));
 assert.equal(stock[0].itemId,902,"chooses among real recipes instead of inventing items");
 assert.equal(npcStartingConsumables([mana],()=>0.5).length,1);
});

test("HP restoration is capped and costs exactly one action; retries do not duplicate",()=>{
 const before=state(),item=before.consumables.PLAYER[0];
 before.actors.PLAYER.hp=45;
 const next=applyResolvedCombatConsumable(before,"PLAYER",item,"item-heal-transaction-00001");
 assert.equal(next.actors.PLAYER.hp,50);
 assert.equal(next.consumables.PLAYER[0].quantity,1);
 assert.equal(next.actors.PLAYER.spentAp,1);
 assert.ok(next.actors.PLAYER.spentTicks>0);
 assert.match(next.log.at(-1).summary,/recuperó 5 HP/);
 assert.equal(applyResolvedCombatConsumable(next,"PLAYER",item,"item-heal-transaction-00001"),next);
 assert.equal(before.actors.PLAYER.hp,45,"original combat snapshot is not mutated");
 assert.throws(()=>applyCombatCommand(before,"PLAYER",{kind:"USE_ITEM",itemId:900,requestId:"item-raw-00000001"}),/servidor/);
});

test("mana recovery caps; use at full resource and missing stock are rejected",()=>{
 const before=state(),item=before.consumables.PLAYER[1];
 const next=applyResolvedCombatConsumable(before,"PLAYER",item,"mana-recovery-transaction-1");
 assert.equal(next.mana.PLAYER.current,30);
 assert.equal(next.consumables.PLAYER[1].quantity,0);
 assert.equal(next.actors.PLAYER.spentAp,1);
 assert.throws(()=>applyResolvedCombatConsumable(next,"PLAYER",item,"mana-recovery-transaction-2"),/disponible/);
 const full=state();full.actors.PLAYER.hp=full.actors.PLAYER.maxHp;
 assert.throws(()=>applyResolvedCombatConsumable(full,"PLAYER",full.consumables.PLAYER[0],"heal-full-resource-00001"),/HP/);
 assert.equal(full.consumables.PLAYER[0].quantity,2);
 assert.equal(full.actors.PLAYER.spentAp,0);
});

test("NPC potion is paid and never changes real stock; action respects initiative",()=>{
 const before=state();
 const npc=before.consumables.NPC[0];
 // A pending attack blocks all proactive potion actions regardless of speed.
 before.pending={by:"PLAYER",against:"NPC",attackType:"PIERCE",trajectory:[{x:.1,y:.5},{x:.9,y:.5}],launchedAtTick:0,usesMagic:false};
 assert.throws(()=>applyResolvedCombatConsumable(before,"NPC",npc,"npc-potion-too-early-001"),/iniciativa/);
 before.pending=null;
 before.actors.PLAYER.spentTicks=30;
 const after=applyResolvedCombatConsumable(before,"NPC",npc,"npc-potion-ready-00001");
 assert.equal(after.actors.NPC.hp,35);
 assert.equal(after.consumables.NPC[0].quantity,0);
 assert.equal(after.actors.NPC.spentAp,1);
 assert.equal(after.consumables.PLAYER[0].quantity,2);
});

test("multiple stacks of one potion preserve individual inventory identity",()=>{
 const before=state();
 before.consumables.PLAYER.push({...before.consumables.PLAYER[0],
  characterItemId:503,quantity:3});
 const second=before.consumables.PLAYER.find(x=>x.characterItemId===503);
 const after=applyResolvedCombatConsumable(before,"PLAYER",second,"item-second-stack-0001");
 assert.equal(after.consumables.PLAYER.find(x=>x.characterItemId===501).quantity,2);
 assert.equal(after.consumables.PLAYER.find(x=>x.characterItemId===503).quantity,2);
 const api=readFileSync(new URL("../app/api/combat/[id]/actions/route.ts",import.meta.url),"utf8");
 assert.match(api,/entry.characterItemId===characterItemId/);
 assert.match(api,/"characterItem" SET quantity=quantity-1/);
});

test("migration contains secure material catalog and 2 priced potions; UI wires dynamic catalog",()=>{
 const load=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
 const sql=load("supabase/migrations/20261105160614_materials_and_potions_20261105152000.sql");
 assert.match(sql,/ALTER TABLE public.material ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/REVOKE ALL ON TABLE public.material/);
 assert.match(sql,/materialId/);
 assert.match(sql,/durability/);
 assert.match(sql,/Poción de salud \(10 HP\)/);
 assert.match(sql,/Poción de maná \(20\)/);
 assert.match(sql,/1200/);
 assert.match(sql,/1500/);
 const editor=load("app/management/items/page.tsx");
 assert.match(editor,/Material de fabricación/);
 assert.match(editor,/Sin definir/);
 assert.match(editor,/api\/management\/materials/);
 const materials=load("app/management/materials/page.tsx");
 assert.match(materials,/Gestión de materiales/);
 assert.match(materials,/Resistencia física/);
 const combat=load("app/combat/[id]/CombatEncounter.tsx");
 assert.match(combat,/Consumibles del encuentro/);
 assert.match(combat,/characterItemId:item.characterItemId/);
 assert.match(load("app/api/combat/[id]/actions/route.ts"),/durability=LEAST\(durability/);
 assert.match(load("app/api/combat/duels/route.ts"),/durability:\s*Math.max/);
 assert.match(load("app/store/page.tsx"),/item.material/);
 const action=load("app/api/combat/[id]/actions/route.ts");
 assert.match(action,/quantity=quantity-1/);
 assert.match(action,/processedItemRequests/);
});
