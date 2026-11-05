import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateMaterialTypeDraft,materialTypeCodeFromName} from "../lib/items/material-types.ts";
import {validateMaterialDraft} from "../lib/items/materials.ts";
import {newCombatState,applyCombatCommand} from "../lib/combat/turn-engine.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";

const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const fighter=(name,id,position,patch={})=>({
 characterId:id,name,hp:200,maxHp:200,agility:80,speedValue:90,
 strength:30,constitution:12,precision:100,dodge:10,
 physicalAttack:50,physicalDefense:8,magicAttack:40,magicDefense:5,
 critical:0,luck:15,race:20,massKg:70,positionMeters:position,
 attackType:"PIERCE",defenseType:"CONCENTRATED",weaponIntegrity:100,spentTicks:0,spentAp:0,
 ...patch,
});
const dice={hit:0.01,critical:0.99,defense:0.99};
const sword={name:"Espada de fresno",attackType:"PIERCE",mode:"MELEE",
 effectiveRangeMeters:1.5,maximumRangeMeters:1.5,materialPerkBonus:{perkId:16,attackBonus:20}};
function battle(targetPerks=[],weapon=sword){
 const state=newCombatState(fighter("Atacante",11,0,{equippedWeapon:weapon}),
  fighter("Defensor",12,1,{speedValue:70,perkIds:targetPerks}),"PLAYER");
 const launched=applyCombatCommand(state,"PLAYER",{
   kind:"ATTACK",attackType:"PIERCE",attackSource:"MAIN_HAND",
   trajectory:[{x:0.1,y:0.5},{x:0.9,y:0.5}],
 },dice);
 assert.ok(launched.pending,"weapon strike awaits the defender");
 return {launched,done:applyCombatCommand(launched,"NPC",{kind:"DEFEND",defense:"NONE"},dice)};
}

test("types are editable catalog entries, with stable codes and descriptive defaults",()=>{
 assert.equal(materialTypeCodeFromName("Cristal arcano"),"CRISTAL_ARCANO");
 assert.equal(materialTypeCodeFromName("Fibra de dragón"),"FIBRA_DE_DRAGON");
 const type=validateMaterialTypeDraft({name:"Cristal arcano",obtaining:"Primario",
  minimumForm:"Polvo",fireReaction:"Se funde"});
 assert.deepEqual({code:type.code,name:type.name,obtaining:type.obtaining,
  minimumForm:type.minimumForm,fireReaction:type.fireReaction},
  {code:"CRISTAL_ARCANO",name:"Cristal arcano",obtaining:"Primario",
   minimumForm:"Polvo",fireReaction:"Se funde"});
 assert.throws(()=>validateMaterialTypeDraft({name:"A",code:"%$"}),/Código/);
 assert.throws(()=>validateMaterialTypeDraft({name:"",code:"WOOD"}),/nombre/);
 assert.equal(type.iceReaction,null);
 assert.equal(validateMaterialDraft({name:"Cristal",type:"CRISTAL_ARCANO",hardness:800}).hardness,800);
 assert.equal(validateMaterialDraft({name:"Mitrilo",type:"METAL",physicalResistance:160}).physicalResistance,160);
 assert.throws(()=>validateMaterialDraft({name:"M",type:"METAL",magicResistance:-1}),/Resistencia/);
 assert.throws(()=>validateMaterialDraft({name:"M",type:"METAL",magicResistance:1000001}),/Resistencia/);
 assert.throws(()=>validateMaterialDraft({name:"M",type:"METAL",bonusAgainstPerkAttack:20}),/perk/);
 const bonus=validateMaterialDraft({name:"Fresno",type:"WOOD",bonusAgainstPerkId:16,bonusAgainstPerkAttack:20});
 assert.equal(bonus.bonusAgainstPerkId,16);assert.equal(bonus.bonusAgainstPerkAttack,20);
});

test("physical weapon attack gains +20 ATTACK only if defender carries the linked perk",()=>{
 const withPerk=battle([16]),withoutPerk=battle([]);
 assert.equal(withPerk.done.log.at(-1).materialAttackBonus,20);
 assert.equal(withoutPerk.done.log.at(-1).materialAttackBonus,undefined);
 assert.ok(withPerk.done.actors.NPC.hp<withoutPerk.done.actors.NPC.hp);
 assert.equal(withPerk.launched.pending.materialPerkBonus.perkId,16);
 assert.equal(combatClientView(withPerk.launched).pending.materialPerkBonus,undefined,
  "the pending material condition is private until resolution");
});

test("material bonus is perk-based, not race-based, and never affects unrelated equipment",()=>{
 const case1=battle([16]);
 const case2=battle([16],{...sword,materialPerkBonus:undefined});
 const case3=battle([2,4],sword);
 const case4=battle([16,2],sword);
 assert.ok(case1.done.actors.NPC.hp<case2.done.actors.NPC.hp);
 assert.equal(case3.done.log.at(-1).materialAttackBonus,undefined);
 assert.equal(case1.done.log.at(-1).damage,case4.done.log.at(-1).damage);
});

test("unarmed punches and basic magic cannot borrow a wood weapon's target bonus",()=>{
 const state=newCombatState(fighter("Atacante",11,0,{equippedWeapon:sword}),
   fighter("Etereo",12,1,{speedValue:70,perkIds:[16]}),"PLAYER");
 const launched=applyCombatCommand(state,"PLAYER",{
  kind:"ATTACK",attackType:"BLUNT",attackSource:"FIST_RIGHT",
  trajectory:[{x:0.1,y:0.5},{x:0.9,y:0.5}],
 },dice);
 assert.equal(launched.pending.materialPerkBonus,undefined);
 const magic=newCombatState(fighter("Mago",11,0,{equippedWeapon:sword}),
  fighter("Etereo",12,1,{speedValue:70,perkIds:[16]}),"PLAYER");
 magic.mana={PLAYER:{current:5,max:5},NPC:{current:5,max:5}};
 const cast=applyCombatCommand(magic,"PLAYER",{
  kind:"ATTACK",attackType:"PIERCE",usesMagic:true,
  trajectory:[{x:.1,y:.5},{x:.9,y:.5}],areaCenter:{x:.5,y:.5},
 },dice);
 assert.equal(cast.pending.materialPerkBonus,undefined);
});

test("no hardcoded 100 cap and complete CRUD for type catalog",()=>{
 const migration=source("supabase/migrations/20261105163500_material_types_scaling_and_etherial_perk.sql");
 assert.match(migration,/material_hardness_check/);
 assert.match(migration,/1000000/);
 assert.match(migration,/100, hardness=100/);
 assert.match(migration,/160, hardness=160/);
 assert.match(migration,/bonusAgainstPerkId/);
 assert.match(migration,/name='Cuerpo ethereo'/);
 assert.match(migration,/material_type_code_fk/);
 assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
 const view=source("app/management/material-types/page.tsx");
 const types=source("app/api/management/material-types/route.ts");
 const detail=source("app/api/management/material-types/[code]/route.ts");
 const edit=source("app/management/materials/page.tsx");
 assert.match(view,/Gestión de tipos de material/);
 assert.match(view,/Crear tipo/);
 assert.match(types,/validateMaterialTypeDraft/);
 assert.match(detail,/No puedes eliminar un tipo/);
 assert.match(edit,/Gestionar tipos de material/);
 assert.match(edit,/bonusAgainstPerkId/);
 assert.doesNotMatch(edit,/>\s*\{material.physicalResistance\}\/100/);
});
