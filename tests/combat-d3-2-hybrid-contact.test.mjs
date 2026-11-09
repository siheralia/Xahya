import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {projectApprovedCombatSkills} from "../lib/combat/skill-preview.ts";
import {newCombatState,applyResolvedCombatSkill,applyCombatCommand}
 from "../lib/combat/turn-engine.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";

const row=(id=801,changes={})=>({
 id,name:"Puño imbuido",characterId:101,
 status:"APPROVED",approvedAt:"2026-11-09T00:00:00Z",pchCost:72,
 category:"OFFENSIVE",attackType:"BLUNT",cost:10,
 maintenanceCost:0,accumulationCost:0,accumulationPerTick:0,
 duration:"Instantánea",cooldown:"1 turno",condition:"",
 areaOfEffect:"Contacto | Alcance máximo: 2 m",mechanics:{},
 effect:[
  {type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:60},
  {type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:40},
 ],...changes,
});
const fighter=(name,characterId,positionMeters,extra={})=>({
 name,characterId,hp:160,maxHp:160,agility:100,speedValue:100,
 strength:40,constitution:11,precision:100,dodge:10,
 physicalAttack:45,physicalDefense:10,magicAttack:55,magicDefense:15,
 critical:0,luck:10,race:20,massKg:70,positionMeters,
 attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,
 spentTicks:0,spentAp:0,...extra,
});
const encounter=(patch={})=>{
 const s=newCombatState(
  fighter("Luchadora",101,0),fighter("Defensora",102,1.5,patch),"PLAYER");
 s.mana={PLAYER:{current:70,max:70},NPC:{current:70,max:70}};
 return s;
};
const dice={hit:.01,critical:.99,defense:.99};
const trajectory=[{x:.1,y:.9},{x:.4,y:.9},{x:.5,y:.5}];
const stamp="d32-hybrid-contact-0001";
const skill=()=>compileCombatSkill(row());
const cast=(s,plan=skill(),aim={})=>applyResolvedCombatSkill(
 s,"PLAYER",plan,{requestId:stamp,trajectory,...aim},dice);
const defend=(s,defense="NONE",rolls=dice,options={})=>
 applyCombatCommand(s,"NPC",{kind:"DEFEND",defense,...options},rolls);
const log=(s)=>s.log.filter(e=>e.kind==="RESOLVE"&&e.by==="PLAYER").at(-1);
const wall=(id,x,durability,patch={})=>({
 id,owner:"NPC",sourceSkillId:140,material:"EARTH",form:"BLOCK",
 label:id,center:{x:.5,y:.5},createdRound:1,
 fieldPosition:{x,y:0},heightMeters:0,solidHeightMeters:2,
 footprintRadiusMeters:.04,tangible:true,durability,hitCount:0,...patch,
});
const mirror=(id,x)=>({
 id,owner:"NPC",sourceSkillId:800,material:"MIRROR",form:"MIRROR",
 label:id,center:{x:.98,y:.95},createdRound:1,
 fieldPosition:{x,y:0},tangible:true,durability:10,
 mirror:{rayMultiplier:1,reflectionMultiplier:1,rangeMeters:5,attackType:"PIERCE"},
});

test("D3.2 approved contact skill pays ONE action and deals two defended channels",()=>{
 const plan=skill();
 assert.equal(plan.category,"OFFENSE");
 assert.equal(plan.usesMagic,false,"magic is delivered by physical touch, not as a ray");
 assert.equal(plan.rangeMeters,2);
 assert.deepEqual(plan.approvedHybridContact,
  {physicalMultiplier:0.6,magicalMultiplier:0.4});
 const s=encounter(),before=structuredClone(s);
 let pending=cast(s,plan);
 assert.deepEqual(s,before);
 assert.equal(pending.actors.PLAYER.spentAp,1);
 assert.equal(pending.mana.PLAYER.current,60);
 assert.equal(pending.skillCooldowns.PLAYER["801"],3);
 assert.equal(pending.pending.hybridContact.magicalMultiplier,0.4);
 assert.equal(pending.pending.directedMagicRay,undefined);
 assert.equal(pending.actors.NPC.hp,160);
 const publicState=combatClientView(pending);
 assert.equal(publicState.pending.hybridContact,undefined);
 assert.deepEqual(cast(JSON.parse(JSON.stringify(pending)),plan),pending,
  "idempotent retry must not spend twice or reset defense");
 const result=defend(pending);
 const hit=log(result);
 assert.equal(hit.contact,true);
 assert.ok(hit.damageChannels.physical>0);
 assert.ok(hit.damageChannels.magical>0);
 assert.equal(hit.damage,hit.damageChannels.physical+hit.damageChannels.magical);
 assert.equal(result.actors.NPC.hp,160-hit.damage);
 assert.match(hit.summary,/físico.*mágico/);
 assert.equal(result.summonStatuses?.length??0,0);
 assert.equal(result.mana.PLAYER.current,60);
 assert.equal(result.log.filter(e=>e.kind==="ATTACK").length,1);
 assert.equal(result.log.filter(e=>e.kind==="RESOLVE").length,1);
 assert.equal(result.actors.NPC.spentAp,0);
});

test("one physical dodge cancels BOTH contact damage channels",()=>{
 const s=defend(cast(encounter()),"DODGE",
  {hit:.999,critical:.99,defense:.999});
 assert.equal(log(s).contact,false);
 assert.deepEqual(log(s).damageChannels,{physical:0,magical:0});
 assert.equal(s.actors.NPC.hp,160);
 assert.equal(s.log.filter(e=>e.kind==="STATUS").length,0);
});

test("a physical BLOCK does not also act as an invisible magic field",()=>{
 const baseline=log(defend(cast(encounter())));
 const blocked=log(defend(cast(encounter()),"BLOCK",
  {hit:.01,critical:.99,defense:0}));
 assert.ok(blocked.damageChannels.physical<baseline.damageChannels.physical);
 assert.equal(blocked.damageChannels.magical,baseline.damageChannels.magical);
 assert.equal(blocked.damage,blocked.damageChannels.physical+
  blocked.damageChannels.magical);
});
test("a MAGIC_FIELD protects magical damage, not the physical half",()=>{
 const baseline=log(defend(cast(encounter())));
 const held=log(defend(cast(encounter({magicDefense:100})),"MAGIC_FIELD",
  {hit:.01,critical:.99,defense:0}));
 const matching=log(defend(cast(encounter({magicDefense:100}))));
 assert.equal(held.damageChannels.physical,matching.damageChannels.physical);
 assert.ok(held.damageChannels.magical<matching.damageChannels.magical);
 assert.ok(held.damage>=0);
 assert.ok(baseline.damage>0);
});

test("measured solid cover prevents BOTH channels and wears only once",()=>{
 const original=encounter();
 original.constructions=[wall("front",.2,1000),wall("rear",.5,50)];
 const s=defend(cast(original));
 assert.equal(log(s).contact,false);
 assert.equal(log(s).damage,0);
 assert.deepEqual(log(s).damageChannels,{physical:0,magical:0});
 assert.equal(s.actors.NPC.hp,160);
 assert.equal(s.constructions.find(x=>x.id==="rear").durability,50);
 assert.equal(s.constructions.find(x=>x.id==="rear").hitCount,0);
 assert.equal(s.constructions.find(x=>x.id==="front").hitCount,1);
 assert.equal(s.log.filter(e=>e.kind==="CONSTRUCTION"&&e.contact).length,1);
});

test("partially damaged cover reduces both separately without duplicating wear",()=>{
 const base=log(defend(cast(encounter())));
 const original=encounter();
 original.constructions=[wall("thin",.2,7)];
 const s=defend(cast(original));
 const after=log(s);
 assert.ok(after.damageChannels.physical<=base.damageChannels.physical);
 assert.ok(after.damageChannels.magical<=base.damageChannels.magical);
 assert.ok(after.damage>0&&after.damage<base.damage);
 assert.equal(after.damage,after.damageChannels.physical+
  after.damageChannels.magical);
 assert.equal(s.constructions.length,0,"thin wall breaks once");
 assert.equal(s.log.filter(e=>e.kind==="CONSTRUCTION"&&e.contact).length,1);
});

test("a selected CONSTRUCTION defense resists the combined impact as one force",()=>{
 const initial=encounter({magicDefense:1000});
 initial.constructions=[wall("block",.5,500)];
 const s=defend(cast(initial),"CONSTRUCTION",dice,{constructionId:"block"});
 assert.equal(log(s).damage,0);
 assert.deepEqual(log(s).damageChannels,{physical:0,magical:0});
 assert.ok(s.constructions.find(x=>x.id==="block").durability<500);
 assert.equal(s.actors.NPC.hp,160);
});

test("nearby mirror does NOT reflect magic attached to a true physical touch",()=>{
 const baseline=defend(cast(encounter()));
 const original=encounter();
 original.constructions=[mirror("between",.7)];
 const s=defend(cast(original));
 assert.equal(s.log.filter(e=>e.kind==="REFLECTION").length,0);
 assert.deepEqual(log(s).damageChannels,log(baseline).damageChannels);
 assert.equal(s.actors.PLAYER.hp,160);
});

test("reject wrong target, area, undrawn melee and illegitimate prices without charges",()=>{
 const plan=skill();
 const invalidAims=[
  {targetSummonId:"enemy"},{targetConstructionId:"mirror"},
  {areaCenter:{x:.5,y:.5}},
 ];
 for(const aim of invalidAims){
  const state=encounter(),old=structuredClone(state);
  assert.throws(()=>cast(state,plan,aim),/solo puede dirigirse|trayectoria física/);
  assert.deepEqual(state,old);
 }
 const missing=encounter(),before=structuredClone(missing);
 assert.throws(()=>applyResolvedCombatSkill(missing,"PLAYER",plan,
  {requestId:stamp},dice),/Dibuja la trayectoria/);
 assert.deepEqual(missing,before);
 const invalid=[
  {status:"PENDING"},{approvedAt:null},{pchCost:0},{cost:0},
  {maintenanceCost:1},{accumulationCost:5},{accumulationPerTick:1},
  {condition:"Solo durante lluvia"},
  {attackType:"CUT"},{areaOfEffect:"Objetivo único | Alcance máximo: 2 m"},
  {areaOfEffect:"Contacto | Alcance máximo: 4 m"},
  {areaOfEffect:"Área circular de 1 m | Alcance máximo: 2 m"},
  {duration:"5 turnos"},{mechanics:{rules:[{kind:"OTHER"}]}},
  {effect:[
   {type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:100},
   {type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:100},
  ]},
  {effect:[
   {type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:60},
   {type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:40,element:"FIRE"},
  ]},
  {effect:[
   {type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:60},
   {type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:40},
   {type:"FINAL_DAMAGE_MULTIPLIER",target:"OTHER",value:200},
  ]},
 ];
 for(const [i,change] of invalid.entries()){
  const r=row(900+i,change);
  assert.equal(previewSkillExecution(r).executable,false,"invalid #"+i);
  assert.throws(()=>compileCombatSkill(r),"invalid #"+i);
 }
 assert.throws(()=>compileCombatSkill(row(1100),"LEGACY_ONLY"),/desactivadas/);
});

test("preview and personal activation setting are consistent",()=>{
 const approved=row();
 const preview=projectApprovedCombatSkills([approved],[],new Set(),()=>true);
 assert.equal(preview[0].executable,true);
 assert.equal(preview[0].needsAim,true);
 assert.equal(preview[0].usesMagic,false);
 assert.deepEqual(preview[0].hybridContact,
  {physicalMultiplier:.6,magicalMultiplier:.4});
 const off=projectApprovedCombatSkills([approved],[{skillId:801,active:false}],
  new Set(),()=>true);
 assert.equal(off[0].executable,false);
 assert.match(off[0].disabledReason,/desactivada/);
});
