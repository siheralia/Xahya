import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {projectApprovedCombatSkills} from "../lib/combat/skill-preview.ts";
import {newCombatState,applyResolvedCombatSkill,applyCombatCommand,canAct}
 from "../lib/combat/turn-engine.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";
import {activeCombatStatusViews} from "../lib/combat/active-status-summary.ts";

const effect=(changes={})=>({
 type:"COMPOSED",reviewedPch:24,
 module:{id:"HYBRID_POST_HIT",name:"Marca debilitante",
  type:"COMBAT_CONTACT",description:"Solo después del daño real del canal",
  trigger:"ACTIVATE",steps:[
   {kind:"SELECT_TARGET",selector:"OPPONENT",output:"opponent"},
   {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"opponent"},
    stat:"MAGIC_DEFENSE",operation:"MULTIPLIER",value:0.8,durationTurns:2},
  ]},...changes,
});
const skillRow=(id=901,channel="MAGICAL",changes={})=>({
 id,name:"Puño imbuido debilitante",characterId:101,
 category:"OFFENSIVE",status:"APPROVED",
 approvedAt:"2026-11-09T00:00:00Z",pchCost:91,
 attackType:"BLUNT",cost:10,maintenanceCost:0,
 accumulationCost:0,accumulationPerTick:0,
 duration:"2 turnos",cooldown:"1 turno",condition:"",
 areaOfEffect:"Contacto | Alcance máximo: 2 m",
 mechanics:{hybridStatusChannel:channel},
 effect:[
  {type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:60},
  {type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:40},
  effect(),
 ],...changes,
});
const fighter=(name,characterId,positionMeters,patch={})=>({
 name,characterId,hp:160,maxHp:160,agility:100,speedValue:100,
 strength:40,constitution:11,precision:100,dodge:10,
 physicalAttack:45,physicalDefense:10,magicAttack:55,magicDefense:15,
 critical:0,luck:10,race:20,massKg:70,positionMeters,
 attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,
 spentTicks:0,spentAp:0,...patch,
});
const encounter=(patch={})=>{
 const s=newCombatState(fighter("Luchadora",101,0),
  fighter("Defensora",102,1.5,patch),"PLAYER");
 s.mana={PLAYER:{current:80,max:80},NPC:{current:80,max:80}};
 return s;
};
const dice={hit:.01,critical:.99,defense:.99};
const trajectory=[{x:.1,y:.9},{x:.4,y:.9},{x:.5,y:.5}];
const plan=(channel="MAGICAL")=>compileCombatSkill(skillRow(901,channel));
const cast=(s,p=plan(),requestId="d34-hybrid-status-0001")=>
 applyResolvedCombatSkill(s,"PLAYER",p,{requestId,trajectory},dice);
const defend=(s,defense="NONE",rolls=dice)=>
 applyCombatCommand(s,"NPC",{kind:"DEFEND",defense},rolls);
const resolve=(s=encounter(),channel="MAGICAL",defense="NONE",rolls=dice)=>
 defend(cast(s,plan(channel)),defense,rolls);
const log=(s,kind)=>s.log.filter(e=>e.kind===kind).at(-1);
const endRound=before=>{
 let s=before,goal=before.round+1;
 for(let i=0;i<30&&s.round<goal;i++){
  const side=canAct(s,"PLAYER")?"PLAYER":canAct(s,"NPC")?"NPC":null;
  assert.ok(side);
  s=applyCombatCommand(s,side,{kind:"WAIT"},dice);
 }
 assert.equal(s.round,goal);
 return s;
};
const solid=(durability)=>({
 id:"WALL",owner:"NPC",sourceSkillId:21,material:"EARTH",form:"BLOCK",
 label:"Muro de prueba",center:{x:.5,y:.5},createdRound:1,
 fieldPosition:{x:.2,y:0},heightMeters:0,solidHeightMeters:2,
 footprintRadiusMeters:.04,tangible:true,durability,hitCount:0,
});

test("reviewed COMPOSED damage rider compiles as ONE hybrid melee action",()=>{
 const approved=plan();
 assert.deepEqual(approved.approvedHybridContact,
  {physicalMultiplier:0.6,magicalMultiplier:0.4,statusChannel:"MAGICAL"});
 assert.equal(approved.approvedHostileStatus?.usesMagic,true);
 assert.equal(approved.approvedHostileStatus?.durationTurns,2);
 assert.equal(approved.category,"OFFENSE");
 assert.equal(approved.usesMagic,false);
 assert.equal(approved.durationTurns,2);
 assert.equal(approved.rangeMeters,2);
 const before=encounter(),snapshot=structuredClone(before);
 const launched=cast(before,approved);
 assert.deepEqual(before,snapshot);
 assert.equal(launched.pending.hybridMagicalContact,true);
 assert.equal(launched.pending.hybridContact.statusChannel,"MAGICAL");
 assert.ok(launched.pending.hostileStatus);
 assert.equal(launched.pending.directedMagicRay,undefined);
 assert.equal(launched.mana.PLAYER.current,70);
 assert.equal(launched.actors.PLAYER.spentAp,1);
 assert.equal(launched.actors.NPC.magicDefense,15);
 assert.equal(launched.log.filter(e=>e.kind==="ATTACK").length,1);
 const client=combatClientView(launched);
 assert.equal(client.pending.hybridContact,undefined);
 assert.equal(client.pending.hostileStatus,undefined);
 assert.equal(JSON.stringify(client).includes("HYBRID_POST_HIT"),false);
 const retry=JSON.parse(JSON.stringify(launched));
 assert.deepEqual(cast(retry,approved),retry);
 const completed=defend(launched);
 const hit=log(completed,"RESOLVE");
 assert.ok(hit.hpDamageChannels.magical>0);
 assert.ok(hit.hpDamageChannels.physical>0);
 assert.equal(completed.summonStatuses.length,1);
 assert.equal(completed.summonStatuses[0].sourceSummonId,"SKILL:901");
 assert.equal(completed.summonStatuses[0].expiresAtRound,3);
 assert.equal(completed.actors.NPC.magicDefense,12);
 assert.equal(completed.mana.PLAYER.current,70);
 assert.equal(completed.log.filter(e=>e.kind==="STATUS").length,1);
 assert.ok(completed.log.findIndex(e=>e.kind==="RESOLVE")<
  completed.log.findIndex(e=>e.kind==="STATUS"));
 assert.match(log(completed,"STATUS").summary,/daño mágico/);
});

test("a magical rider needs magical HP; physical damage alone cannot fire it",()=>{
 const s=resolve(encounter({magicDefense:1000}),"MAGICAL","MAGIC_FIELD",
  {hit:.01,critical:.99,defense:0});
 const hit=log(s,"RESOLVE");
 assert.ok(hit.hpDamageChannels.physical>0);
 assert.equal(hit.hpDamageChannels.magical,0);
 assert.ok(s.actors.NPC.hp<160);
 assert.equal(s.summonStatuses.length,0);
 assert.equal(s.actors.NPC.magicDefense,1000);
 assert.equal(s.log.filter(e=>e.kind==="STATUS").length,0);
});

test("a physical rider needs physical HP; magical damage alone cannot fire it",()=>{
 const s=resolve(encounter({physicalDefense:1000}),"PHYSICAL","BLOCK",
  {hit:.01,critical:.99,defense:0});
 const hit=log(s,"RESOLVE");
 assert.equal(hit.hpDamageChannels.physical,0);
 assert.ok(hit.hpDamageChannels.magical>0);
 assert.equal(s.summonStatuses.length,0);
 assert.equal(s.log.filter(e=>e.kind==="STATUS").length,0);
});
test("physical rider fires normally when its component removes real HP",()=>{
 const s=resolve(encounter(),"PHYSICAL");
 assert.ok(log(s,"RESOLVE").hpDamageChannels.physical>0);
 assert.equal(s.summonStatuses.length,1);
 assert.match(log(s,"STATUS").summary,/daño físico/);
});

test("lethal overkill with only physical HP allocated cannot activate magical status",()=>{
 const s=resolve(encounter({hp:1}),"MAGICAL");
 const hit=log(s,"RESOLVE");
 assert.ok(hit.damageChannels.magical>0);
 assert.ok(hit.damageChannels.physical>0);
 assert.deepEqual(hit.hpDamageChannels,{physical:1,magical:0});
 assert.equal(s.actors.NPC.hp,0);
 assert.equal(s.summonStatuses.length,0);
 assert.equal(s.log.filter(e=>e.kind==="STATUS").length,0);
});

test("fully intercepted contact never applies an effect from either channel",()=>{
 for(const channel of ["MAGICAL","PHYSICAL"]){
  const s=encounter();s.constructions=[solid(500)];
  const result=resolve(s,channel);
  assert.equal(log(result,"RESOLVE").contact,false);
  assert.deepEqual(log(result,"RESOLVE").hpDamageChannels,{physical:0,magical:0});
  assert.equal(result.summonStatuses.length,0);
  assert.equal(result.log.filter(e=>e.kind==="STATUS").length,0);
 }
});
test("dodging cancels both damage sources and the reviewed debuff",()=>{
 const s=resolve(encounter(),"MAGICAL","DODGE",
  {hit:.999,critical:.99,defense:.999});
 assert.equal(log(s,"RESOLVE").contact,false);
 assert.equal(s.actors.NPC.hp,160);
 assert.equal(s.summonStatuses.length,0);
});

test("the state expires on the approved turn, never per channel or per partial damage",()=>{
 let s=resolve();
 assert.equal(activeCombatStatusViews(s,"NPC").length,1);
 s=endRound(s);
 assert.equal(s.round,2);
 assert.equal(s.actors.NPC.magicDefense,12);
 s=endRound(s);
 assert.equal(s.round,3);
 assert.equal(s.actors.NPC.magicDefense,15);
 assert.equal(activeCombatStatusViews(s,"NPC").length,0);
});

test("reject unknown channel, invalid graph, fake pricing and unapproved skills",()=>{
 const invalid=[
  {mechanics:{hybridStatusChannel:"FIRE"}},
  {mechanics:{}},
  {mechanics:{hybridStatusChannel:"MAGICAL",extra:true}},
  {duration:"Instantánea"},
  {status:"PENDING"},{approvedAt:null},{pchCost:0},{cost:0},
  {areaOfEffect:"Objetivo único | Alcance máximo: 2 m"},
  {effect:[
   {type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:60},
   {type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:40},
   effect({reviewedPch:1}),
  ]},
  {effect:[
   {type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:60},
   {type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:40},
   effect({module:{...effect().module,steps:[
    {kind:"SELECT_TARGET",selector:"USER",output:"opponent"},
    effect().module.steps[1],
   ]}}),
  ]},
  {effect:[
   {type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:60},
   {type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:40},
   effect(),effect(),
  ]},
 ];
 for(const [i,change] of invalid.entries()){
  const row=skillRow(940+i,"MAGICAL",change);
  const result=previewSkillExecution(row);
  assert.equal(result.executable,false,"invalid #"+i);
  assert.throws(()=>compileCombatSkill(row),"invalid #"+i);
 }
 const withoutStatus=skillRow(980,"MAGICAL",{
  duration:"Instantánea",
  effect:skillRow().effect.slice(0,2),
 });
 assert.equal(previewSkillExecution(withoutStatus).executable,false,
  "a status channel is forbidden without the module");
 const unadorned=skillRow(981,"MAGICAL",{
  duration:"Instantánea",mechanics:{},
  effect:skillRow().effect.slice(0,2),
 });
 assert.equal(previewSkillExecution(unadorned).executable,true,
  "D3.2 plain hybrid remains available");
 assert.throws(()=>compileCombatSkill(skillRow(),"LEGACY_ONLY"),/desactivadas/);
});

test("preview and personal switch expose the reviewed component and enforce deactivation",()=>{
 const row=skillRow();
 const preview=projectApprovedCombatSkills([row],[],new Set(),()=>true);
 assert.equal(preview.length,1);
 assert.equal(preview[0].executable,true);
 assert.equal(preview[0].modularHostileStatus,true);
 assert.equal(preview[0].hybridContact.statusChannel,"MAGICAL");
 const off=projectApprovedCombatSkills([row],[{skillId:901,active:false}],
  new Set(),()=>true);
 assert.equal(off[0].executable,false);
 assert.match(off[0].disabledReason,/desactivada/);
});
