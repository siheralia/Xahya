import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {projectApprovedCombatSkills} from "../lib/combat/skill-preview.ts";
import {validateSkillMechanics} from "../lib/skills/interaction-engine.ts";
import {newCombatState,applyResolvedCombatSkill,applyCombatCommand}
 from "../lib/combat/turn-engine.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";

const marker=()=>({
 type:"COMPOSED",reviewedPch:24,
 module:{id:"D36_RIDER",name:"Marca por umbral",type:"COMBAT_CONTACT",
 description:"Se activa cuando el canal quita el HP requerido",
 trigger:"ACTIVATE",steps:[
  {kind:"SELECT_TARGET",selector:"OPPONENT",output:"enemy"},
  {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"enemy"},
   stat:"MAGIC_DEFENSE",operation:"MULTIPLIER",value:.8,durationTurns:2},
 ]},
});
const row=(id=1101,channel="MAGICAL",minimum=2,changes={})=>({
 id,name:"Marca de umbral",characterId:101,category:"OFFENSIVE",
 status:"APPROVED",approvedAt:"2026-11-10T00:00:00Z",pchCost:95,
 attackType:"BLUNT",cost:10,maintenanceCost:0,accumulationCost:0,
 accumulationPerTick:0,duration:"2 turnos",cooldown:"1 turno",
 condition:"",areaOfEffect:"Contacto | Alcance máximo: 2 m",
 mechanics:{hybridStatusChannel:channel,hybridStatusMinimumHp:minimum},
 effect:[
  {type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:60},
  {type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:40},
  marker(),
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
const arena=(patch={})=>{
 const s=newCombatState(fighter("Atacante",101,0),
  fighter("Defensora",102,1.5,patch),"PLAYER");
 s.mana={PLAYER:{current:80,max:80},NPC:{current:80,max:80}};
 return s;
};
const rolls={hit:.01,critical:.99,defense:.99};
const trajectory=[{x:.1,y:.9},{x:.4,y:.9},{x:.5,y:.5}];
const cast=(s,p,id="D36-validated-request")=>
 applyResolvedCombatSkill(s,"PLAYER",p,{requestId:id,trajectory},rolls);
const defend=(s,defense="NONE",dice=rolls)=>
 applyCombatCommand(s,"NPC",{kind:"DEFEND",defense},dice);
const resolved=(s,p,defense="NONE",dice=rolls)=>defend(cast(s,p),defense,dice);
const last=(s,k)=>s.log.filter(e=>e.kind===k).at(-1);
const wall=()=>({
 id:"WALL",owner:"NPC",sourceSkillId:2,material:"EARTH",form:"BLOCK",
 label:"Muro fuerte",center:{x:.5,y:.5},createdRound:1,
 fieldPosition:{x:.2,y:0},heightMeters:0,solidHeightMeters:2,
 footprintRadiusMeters:.04,tangible:true,durability:900,hitCount:0,
});

test("D3.6 review compiles an explicit magical HP threshold without a second attack",()=>{
 const p=compileCombatSkill(row());
 assert.equal(p.approvedHybridContact.statusChannel,"MAGICAL");
 assert.equal(p.approvedHybridContact.statusMinimumHp,2);
 assert.equal(p.approvedHostileStatus?.durationTurns,2);
 assert.equal(p.usesMagic,false);
 const input=arena(),copy=structuredClone(input);
 const pending=cast(input,p);
 assert.deepEqual(input,copy);
 assert.equal(pending.actors.PLAYER.spentAp,1);
 assert.equal(pending.mana.PLAYER.current,70);
 assert.equal(pending.skillCooldowns.PLAYER["1101"],3);
 assert.equal(pending.pending.directedMagicRay,undefined);
 const client=combatClientView(pending);
 assert.equal(client.pending.hybridContact,undefined);
 assert.equal(client.pending.hostileStatus,undefined);
 const retry=structuredClone(pending);
 assert.deepEqual(cast(retry,p),retry);
 const s=defend(pending),impact=last(s,"RESOLVE");
 assert.ok(impact.hpDamageChannels.magical>=2);
 assert.equal(s.summonStatuses.length,1);
 assert.equal(s.log.filter(e=>e.kind==="STATUS").length,1);
 assert.match(last(s,"STATUS").summary,/al menos 2 HP/);
 assert.ok(s.log.findIndex(e=>e.kind==="RESOLVE")<
    s.log.findIndex(e=>e.kind==="STATUS"));
 assert.equal(s.mana.PLAYER.current,70);
});

test("a high threshold does not fire on a legitimate hit below its own channel minimum",()=>{
 const s=resolved(arena(),compileCombatSkill(row(1102,"MAGICAL",20)));
 const hit=last(s,"RESOLVE");
 assert.ok(hit.hpDamageChannels.magical>0&&hit.hpDamageChannels.magical<20);
 assert.ok(hit.hpDamageChannels.physical>0);
 assert.equal(s.summonStatuses.length??0,0);
 assert.equal(s.log.filter(e=>e.kind==="STATUS").length,0);
 assert.equal(s.mana.PLAYER.current,70);
});

test("the physical gate reads physical HP only, not total or magical HP",()=>{
 const p=compileCombatSkill(row(1103,"PHYSICAL",5));
 const s=resolved(arena({physicalDefense:1000}),p,"BLOCK",
  {hit:.01,critical:.99,defense:0});
 const hit=last(s,"RESOLVE");
 assert.equal(hit.hpDamageChannels.physical,0);
 assert.ok(hit.hpDamageChannels.magical>0);
 assert.equal(s.summonStatuses.length??0,0);
});

test("overkill cannot inflate credited HP to satisfy a threshold",()=>{
 const p=compileCombatSkill(row(1104,"MAGICAL",5));
 const s=resolved(arena({hp:2}),p),hit=last(s,"RESOLVE");
 assert.ok(hit.damageChannels.magical>=5);
 assert.equal(hit.hpDamageChannels.physical+hit.hpDamageChannels.magical,2);
 assert.equal(s.actors.NPC.hp,0);
 assert.equal(s.log.filter(e=>e.kind==="STATUS").length,0);
});

test("dodging and solid cover cancel the rider independent of the configured threshold",()=>{
 const p=compileCombatSkill(row(1105,"MAGICAL",2));
 const s=resolved(arena(),p,"DODGE",
  {hit:.999,critical:.99,defense:.999});
 assert.equal(last(s,"RESOLVE").contact,false);
 assert.equal(s.summonStatuses.length??0,0);
 const blocked=arena();blocked.constructions=[wall()];
 const w=resolved(blocked,p);
 assert.equal(last(w,"RESOLVE").contact,false);
 assert.equal(w.summonStatuses.length??0,0);
});

test("old D3.4 skills without the new threshold retain their 1 HP default",()=>{
 const p=compileCombatSkill(row(1106,"MAGICAL",undefined,{
  mechanics:{hybridStatusChannel:"MAGICAL"},
 }));
 assert.equal(p.approvedHybridContact.statusMinimumHp,undefined);
 const s=resolved(arena(),p);
 assert.ok(last(s,"RESOLVE").hpDamageChannels.magical>0);
 assert.equal(s.summonStatuses.length,1);
});

test("CONTACT marks may NOT misrepresent HP thresholds; independent marks still work",()=>{
 const effect=marker();
 effect.module.trigger="IMPACT";
 effect.module.impactKind="CHARACTER";
 const base={effect:[...row().effect.slice(0,2),effect]};
 const valid=compileCombatSkill(row(1107,"MAGICAL",undefined,{
  ...base,mechanics:{},
 }));
 assert.equal(valid.approvedHybridContact.statusGate,"CONTACT");
 const s=resolved(arena(),valid);
 assert.equal(s.summonStatuses.length,1);
 for(const v of [
  {mechanics:{hybridStatusMinimumHp:2}},
  {mechanics:{hybridStatusChannel:"PHYSICAL",hybridStatusMinimumHp:2}},
 ]){
  const bad=row(1108,"MAGICAL",undefined,{...base,...v});
  assert.equal(previewSkillExecution(bad).executable,false);
  assert.throws(()=>compileCombatSkill(bad));
 }
});

test("unapproved, unpriced, absent and malformed minimums fail closed",()=>{
 const bad=[
  {mechanics:{hybridStatusChannel:"MAGICAL",hybridStatusMinimumHp:0}},
  {mechanics:{hybridStatusChannel:"MAGICAL",hybridStatusMinimumHp:21}},
  {mechanics:{hybridStatusChannel:"MAGICAL",hybridStatusMinimumHp:-2}},
  {mechanics:{hybridStatusChannel:"MAGICAL",hybridStatusMinimumHp:1.5}},
  {mechanics:{hybridStatusChannel:"MAGICAL",hybridStatusMinimumHp:"3"}},
  {mechanics:{hybridStatusMinimumHp:5}},
  {mechanics:{hybridStatusChannel:"FIRE",hybridStatusMinimumHp:2}},
  {effect:row().effect.slice(0,2)},
  {pchCost:0},{approvedAt:null},{status:"PENDING"},
 ];
 for(const [i,v] of bad.entries()){
  const r=row(1120+i,"MAGICAL",2,v);
  assert.equal(previewSkillExecution(r).executable,false,"invalid #"+i);
  assert.throws(()=>compileCombatSkill(r),"invalid #"+i);
 }
 assert.equal(validateSkillMechanics({hybridStatusMinimumHp:0})!==null,true);
 assert.equal(validateSkillMechanics({hybridStatusMinimumHp:20}),null);
 assert.throws(()=>compileCombatSkill(row(1133),"LEGACY_ONLY"));
});

test("preview in Spanish carries threshold and personal deactivation is enforced",()=>{
 const preview=projectApprovedCombatSkills([row()],[],new Set(),()=>true);
 assert.equal(preview[0].executable,true);
 assert.equal(preview[0].hybridContact.statusMinimumHp,2);
 const off=projectApprovedCombatSkills([row()],[{skillId:1101,active:false}],
  new Set(),()=>true);
 assert.equal(off[0].executable,false);
 assert.match(off[0].disabledReason,/desactivada/);
});
