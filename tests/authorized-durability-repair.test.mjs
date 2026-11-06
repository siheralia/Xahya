import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 compileApprovedRepairSkill,evaluateApprovedRepairSkill,repairSkillStats,
} from "../lib/effects/repair-activation.ts";
import {validateEffectContainers} from "../lib/effects/micro-modules.ts";

const item=selector=>({kind:"READ_ITEM",selector,output:"item"});
const repair=amount=>({kind:"REPAIR_DURABILITY",
 target:{source:"OUTPUT",key:"item"},amount});
const effect=(steps,trigger="ACTIVATE")=>({id:"REPAIR",name:"Reparación de herrero",
 description:"",type:"COMPOSED",trigger,steps});
const reviewed=steps=>({type:"COMPOSED",reviewedPch:25,module:effect(steps)});
const skill=(patch={})=>({
 id:101,characterId:91,status:"APPROVED",name:"Herrero",category:"UTILITY",
 cost:15,cooldown:"2 turnos",duration:"Instantánea",
 effect:[reviewed([
  item("SELECTED_ITEM"),
  {kind:"READ_STAT",actor:"USER",stat:"magicDefense",output:"power"},
  {kind:"CALCULATE",output:"quantity",expression:{operator:"MULTIPLY",
   args:[{source:"OUTPUT",key:"power"},.5]}},
  repair({source:"OUTPUT",key:"quantity"}),
 ])],...patch,
});
const context=(more={})=>({
 stats:{HP:33,MAX_HP:100,magicDefense:50},
 actors:{USER:{HP:33,MAX_HP:100,magicDefense:50}},
 itemSelectors:{SELECTED_ITEM:911},itemTargets:[{characterItemId:911,durability:68}],
 ...more,
});
const load=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("only a GM-approved modular repair skill with ACTIVATE is executable",()=>{
 const plan=compileApprovedRepairSkill(skill());
 assert.equal(plan.manaCost,15);
 assert.equal(plan.skillId,101);
 assert.equal(plan.definitions.length,1);
 assert.equal(validateEffectContainers(plan.definitions),null);
 for(const status of ["PENDING","REJECTED",undefined])
  assert.throws(()=>compileApprovedRepairSkill(skill({status})),/aprobada/);
 assert.throws(()=>compileApprovedRepairSkill(skill({category:"PASSIVE"})),/soporte o utilidad/);
 assert.throws(()=>compileApprovedRepairSkill(skill({category:"OFFENSIVE"})),/soporte o utilidad/);
});

test("the approved skill's real calculated amount goes to a specific owned instance",()=>{
 const plan=compileApprovedRepairSkill(skill());
 const out=evaluateApprovedRepairSkill(plan,context());
 assert.deepEqual(out,[{kind:"REPAIR_DURABILITY",
  characterItemId:911,requested:25,applied:25,before:68,after:93}]);
 const another=evaluateApprovedRepairSkill(plan,context({
  itemSelectors:{SELECTED_ITEM:913},itemTargets:[{characterItemId:913,durability:98}],
 }));
 assert.equal(another[0].characterItemId,913);
 assert.equal(another[0].applied,2);
 assert.equal(another[0].after,100);
});

test("manual repair rejects current HP references because the sheet lacks live HP",()=>{
 assert.throws(()=>compileApprovedRepairSkill(skill({effect:[reviewed([
  item("SELECTED_ITEM"),{kind:"CALCULATE",output:"life",expression:{source:"STAT",key:"HP"}},
  repair({source:"OUTPUT",key:"life"}),
 ])]})),/vida actual no está disponible/);
 assert.throws(()=>compileApprovedRepairSkill(skill({effect:[reviewed([
  item("SELECTED_ITEM"),{kind:"READ_STAT",actor:"USER",stat:"HP",output:"life"},
  repair({source:"OUTPUT",key:"life"}),
 ])]})),/vida actual no está disponible/);
});

test("zero mana requires a real cooldown and cannot be a free repeatable repair",()=>{
 assert.throws(()=>compileApprovedRepairSkill(skill({cost:0,cooldown:""})),/maná o un cooldown/);
 assert.throws(()=>compileApprovedRepairSkill(skill({cost:0,cooldown:"Sin cooldown"})),/maná o un cooldown/);
 assert.throws(()=>compileApprovedRepairSkill(skill({cost:0,cooldown:"Igual a duración",duration:"Instantánea"})),/maná o un cooldown/);
 assert.equal(compileApprovedRepairSkill(skill({cost:0,cooldown:"1 turno"})).manaCost,0);
 assert.equal(compileApprovedRepairSkill(skill({cost:10,cooldown:"Sin cooldown"})).manaCost,10);
 assert.throws(()=>compileApprovedRepairSkill(skill({cost:-1})),/Coste/);
 assert.throws(()=>compileApprovedRepairSkill(skill({cost:1.5})),/Coste/);
});

test("unsupported effects and skills fail closed rather than run free",()=>{
 for(const steps of [
  [item("SOURCE_ITEM"),repair(10)],
  [item("SELECTED_ITEM"),{kind:"HEAL",amount:100},repair(10)],
  [item("SELECTED_ITEM"),{kind:"DAMAGE",channel:"MAGICAL",amount:100},repair(10)],
  [{kind:"CALCULATE",expression:10,output:"x"}],
 ]){
  assert.throws(()=>compileApprovedRepairSkill(skill({effect:[reviewed(steps)]})),
   /reparación|Leer objeto|micromódulo|operación|al menos una acción/);
 }
 assert.throws(()=>compileApprovedRepairSkill(skill({effect:[{type:"NARRATIVE",value:1}]})),/únicamente efectos modulares/);
 assert.throws(()=>compileApprovedRepairSkill(skill({effect:[{
  type:"COMPOSED",module:effect([item("SELECTED_ITEM"),repair(20)]),
 }]})),/PCH revisado/);
 assert.throws(()=>compileApprovedRepairSkill(skill({mechanics:{rules:[{when:[]} ]}})),/mecánicas adicionales/);
 assert.throws(()=>compileApprovedRepairSkill(skill({effect:[{
  type:"COMPOSED",reviewedPch:25,module:effect([item("SELECTED_ITEM"),repair(5)],"TURN_START"),
 }]})),/reparación manual/);
});

test("invalid or fully repaired targets never spend or record useful restoration",()=>{
 const plan=compileApprovedRepairSkill(skill());
 assert.throws(()=>evaluateApprovedRepairSkill(plan,context({
  itemSelectors:{SELECTED_ITEM:999},
 })),/autorizado/);
 assert.throws(()=>evaluateApprovedRepairSkill(plan,context({
  itemTargets:[{characterItemId:911,durability:100}],
 })),/ya está reparado/);
 assert.throws(()=>evaluateApprovedRepairSkill(plan,context({
  itemTargets:[{characterItemId:911,durability:-1}],
 })),/inválida/);
});

test("genuine dynamic character stats and derived stats feed repair formulas",()=>{
 const stats=repairSkillStats(
  {strength:35,agility:40,intelligence:21},
  {magicDefense:72,maxHp:120,maxMana:60,physicalAttack:30},
  95,42);
 assert.equal(stats.STR,35);
 assert.equal(stats.AGI,40);
 assert.equal(stats.INT,21);
 assert.equal(stats.magicDefense,72);
 assert.equal(stats.MAGIC_DEF,72);
 assert.equal(stats.HP,95);
 assert.equal(stats.MAX_HP,120);
 assert.equal(stats.MANA,42);
 assert.equal(stats.PHYSICAL_ATTACK,30);
 assert.equal(evaluateApprovedRepairSkill(compileApprovedRepairSkill(skill()),{
  stats,actors:{USER:stats},itemSelectors:{SELECTED_ITEM:911},
  itemTargets:[{characterItemId:911,durability:20}],
 })[0].applied,36);
 assert.throws(()=>repairSkillStats({}, {maxHp:0},0,0),/máximo/);
});

test("persistent repair endpoint locks owner, inventory copies and debits mana atomically",()=>{
 const route=load("app/api/characters/[id]/repair/route.ts");
 assert.match(route,/await db\.transaction\(async tx=>/);
 assert.match(route,/UPDATE public\."character" SET id=id/);
 assert.match(route,/UPDATE public\."characterItem" SET id=id/);
 assert.match(route,/"characterId"=\$\{characterId\} AND quantity=1/);
 assert.match(route,/Skill\.where\(\{id:skillId,characterId,status:"APPROVED"\}\)/);
 assert.match(route,/debitCharacterMana\(tx,characterId,plan\.manaCost,maxMana\)/);
 assert.match(route,/characterItemId:id,itemId:original\.itemId/);
 assert.match(route,/CharacterItem\.where\(\{id,characterId\}\)\.update\(\{durability:after\}\)/);
 assert.match(route,/cooldownAvailability\(/);
 assert.match(route,/recordSkillCooldown\(/);
 assert.match(route,/ITEM_REPAIR_SKILL/);
 assert.match(route,/requestId/);
 assert.match(route,/REPAIR_IN_COMBAT/);
 assert.match(route,/ITEM_STACK/);
 assert.match(route,/SKILL_STOLEN/);
 assert.match(route,/meetsEffectRequirements\(/);
 assert.match(route,/SELECTED_ITEM:selectedItemId/);
 assert.doesNotMatch(route,/body\?\.amount|body\?\.durability/,
  "the browser can never set restoration strength or durability");
});

test("character inventory offers executable repair with server-selected skill",()=>{
 const page=load("app/characters/[id]/page.tsx");
 assert.match(page,/repairSkills=skills\.filter/);
 assert.match(page,/Reparar con habilidad/);
 assert.match(page,/Habilidad para reparar objetos/);
 assert.match(page,/repairInventoryItem\(entry\.id\)/);
 assert.match(page,/"\/api\/characters\/"\+character\.id\+"\/repair"/);
});
