import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {projectApprovedCombatSkills} from "../lib/combat/skill-preview.ts";
import {newCombatState,applyResolvedCombatSkill,applyCombatCommand,canAct}
 from "../lib/combat/turn-engine.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";
import {activeCombatStatusViews} from "../lib/combat/active-status-summary.ts";

const composed=(trigger="IMPACT",changes={})=>({
 type:"COMPOSED",reviewedPch:24,
 module:{id:"TOUCH_MARK",name:"Marca de contacto",
  type:"COMBAT_CONTACT",description:"Se activa al tocar al rival",
  trigger,...(trigger==="IMPACT"?{impactKind:"CHARACTER"}:{}),
  steps:[
   {kind:"SELECT_TARGET",selector:"OPPONENT",output:"enemy"},
   {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"enemy"},
    stat:"MAGIC_DEFENSE",operation:"MULTIPLIER",value:0.8,durationTurns:2},
  ]},...changes,
});
const row=(id=951,trigger="IMPACT",changes={})=>({
 id,name:"Puño que deja marca",characterId:101,
 category:"OFFENSIVE",status:"APPROVED",
 approvedAt:"2026-11-09T00:00:00Z",pchCost:91,
 attackType:"BLUNT",cost:10,maintenanceCost:0,
 accumulationCost:0,accumulationPerTick:0,
 duration:"2 turnos",cooldown:"1 turno",condition:"",
 areaOfEffect:"Contacto | Alcance máximo: 2 m",
 mechanics:trigger==="IMPACT"?{}:{hybridStatusChannel:"MAGICAL"},
 effect:[
  {type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:60},
  {type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATTACK",value:40},
  composed(trigger),
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
 const s=newCombatState(fighter("Usuaria",101,0),
  fighter("Rival",102,1.5,patch),"PLAYER");
 s.mana={PLAYER:{current:80,max:80},NPC:{current:80,max:80}};
 return s;
};
const dice={hit:.01,critical:.99,defense:.99};
const trajectory=[{x:.1,y:.9},{x:.4,y:.9},{x:.5,y:.5}];
const cast=(s,p,req="d35-contact-0001")=>
 applyResolvedCombatSkill(s,"PLAYER",p,{requestId:req,trajectory},dice);
const defend=(s,defense="NONE",rolls=dice)=>
 applyCombatCommand(s,"NPC",{kind:"DEFEND",defense},rolls);
const resolve=(s,p,defense="NONE",rolls=dice)=>defend(cast(s,p),defense,rolls);
const last=(s,k)=>s.log.filter(e=>e.kind===k).at(-1);
const solid=(strength=500)=>({
 id:"WALL",owner:"NPC",sourceSkillId:22,material:"EARTH",form:"BLOCK",
 label:"Pared de prueba",center:{x:.5,y:.5},createdRound:1,
 fieldPosition:{x:.2,y:0},heightMeters:0,solidHeightMeters:2,
 footprintRadiusMeters:.04,tangible:true,durability:strength,hitCount:0,
});
const nextRound=before=>{
 let s=before,goal=before.round+1;
 for(let i=0;i<30&&s.round<goal;i++){
  const side=canAct(s,"PLAYER")?"PLAYER":canAct(s,"NPC")?"NPC":null;
  assert.ok(side);
  s=applyCombatCommand(s,side,{kind:"WAIT"},dice);
 }
 assert.equal(s.round,goal);
 return s;
};

test("IMPACT/CHARACTER mark is separately reviewed and paid only once",()=>{
 const p=compileCombatSkill(row());
 assert.deepEqual(p.approvedHybridContact,{
  physicalMultiplier:0.6,magicalMultiplier:0.4,statusGate:"CONTACT",
 });
 assert.equal(p.approvedHostileStatus?.durationTurns,2);
 assert.equal(p.approvedHostileStatus?.definition.trigger,"ACTIVATE",
  "normalized intent is server-owned and cannot launch a second attack");
 assert.equal(p.usesMagic,false);
 const original=encounter(),snapshot=structuredClone(original);
 const launched=cast(original,p);
 assert.deepEqual(original,snapshot);
 assert.equal(launched.actors.PLAYER.spentAp,1);
 assert.equal(launched.mana.PLAYER.current,70);
 assert.equal(launched.skillCooldowns.PLAYER["951"],3);
 assert.equal(launched.pending.hybridContact.statusGate,"CONTACT");
 assert.ok(launched.pending.hostileStatus);
 assert.equal(launched.pending.directedMagicRay,undefined);
 assert.equal(launched.actors.NPC.magicDefense,15);
 assert.equal(launched.log.filter(e=>e.kind==="ATTACK").length,1);
 const client=combatClientView(launched);
 assert.equal(client.pending.hybridContact,undefined);
 assert.equal(client.pending.hostileStatus,undefined);
 assert.equal(JSON.stringify(client).includes("TOUCH_MARK"),false);
 const retry=structuredClone(launched);
 assert.deepEqual(cast(retry,p),retry,
  "same request ID cannot charge resources twice");
 const completed=defend(launched);
 assert.ok(last(completed,"RESOLVE").contact);
 assert.equal(completed.summonStatuses.length,1);
 assert.equal(completed.actors.NPC.magicDefense,12);
 assert.equal(completed.log.filter(e=>e.kind==="STATUS").length,1);
 assert.match(last(completed,"STATUS").summary,/contacto real/);
 assert.ok(completed.log.findIndex(e=>e.kind==="RESOLVE")<
  completed.log.findIndex(e=>e.kind==="STATUS"));
});

test("body contact applies its reviewed effect even when BOTH HP channels cause ZERO",()=>{
 const patch={
  physicalDefense:1000,magicDefense:1000,
  damageTakenFactors:{ALL:0.1},
 };
 const state=resolve(encounter(patch),compileCombatSkill(row()));
 const impact=last(state,"RESOLVE");
 assert.equal(impact.contact,true,
  "a landed blow is not a dodge just because armor prevents HP loss");
 assert.equal(impact.damage,0);
 assert.deepEqual(impact.hpDamageChannels,{physical:0,magical:0});
 assert.equal(state.actors.NPC.hp,160);
 assert.equal(state.summonStatuses.length,1);
 assert.equal(state.actors.NPC.magicDefense,800);
 assert.equal(state.log.filter(e=>e.kind==="STATUS").length,1);
});

test("the same zero-HP blow must NOT activate D3.4 HP_DAMAGE status",()=>{
 const hpSkill=compileCombatSkill(row(952,"ACTIVATE"));
 assert.equal(hpSkill.approvedHybridContact.statusGate,undefined);
 assert.equal(hpSkill.approvedHybridContact.statusChannel,"MAGICAL");
 const state=resolve(encounter({
  physicalDefense:1000,magicDefense:1000,damageTakenFactors:{ALL:0.1},
 }),hpSkill);
 assert.equal(last(state,"RESOLVE").contact,true);
 assert.equal(last(state,"RESOLVE").damage,0);
 assert.equal(state.summonStatuses.length,0);
 assert.equal(state.actors.NPC.magicDefense,1000);
});

test("a wall that catches the strike stops body contact, the mark and HP",()=>{
 const s=encounter();s.constructions=[solid()];
 const result=resolve(s,compileCombatSkill(row()));
 assert.equal(last(result,"RESOLVE").contact,false);
 assert.equal(last(result,"RESOLVE").damage,0);
 assert.equal(result.actors.NPC.magicDefense,15);
 assert.equal(result.summonStatuses.length??0,0);
 assert.equal(result.log.filter(e=>e.kind==="STATUS").length,0);
});
test("an actual dodge prevents the contact mark entirely",()=>{
 const s=resolve(encounter(),compileCombatSkill(row()),"DODGE",
  {hit:.999,critical:.99,defense:.999});
 assert.equal(last(s,"RESOLVE").contact,false);
 assert.equal(s.actors.NPC.hp,160);
 assert.equal(s.summonStatuses.length??0,0);
});

test("the CONTACT effect does not attach to a body killed by the blow",()=>{
 const s=resolve(encounter({hp:1}),compileCombatSkill(row()));
 assert.equal(last(s,"RESOLVE").contact,true);
 assert.equal(s.actors.NPC.hp,0);
 assert.equal(s.summonStatuses.length??0,0);
});

test("approved status duration remains once per attack and expires normally",()=>{
 let s=resolve(encounter(),compileCombatSkill(row()));
 assert.equal(activeCombatStatusViews(s,"NPC").length,1);
 assert.equal(s.summonStatuses.length,1);
 s=nextRound(s);
 assert.equal(s.round,2);
 assert.equal(s.actors.NPC.magicDefense,12);
 s=nextRound(s);
 assert.equal(s.round,3);
 assert.equal(s.actors.NPC.magicDefense,15);
 assert.equal(activeCombatStatusViews(s,"NPC").length,0);
});

test("unsafe IMPACT triggers, targets, unreviewed prices and channel spoofing fail closed",()=>{
 const invalid=[
  {mechanics:{hybridStatusChannel:"MAGICAL"}},
  {effect:[...row().effect.slice(0,2),composed("IMPACT",{
    module:{...composed().module,impactKind:"GROUND"},
  })]},
  {effect:[...row().effect.slice(0,2),composed("IMPACT",{
    module:{...composed().module,impactKind:undefined},
  })]},
  {effect:[...row().effect.slice(0,2),composed("IMPACT",{
    module:{...composed().module,requirements:[{left:1,compare:"GTE",right:0}]},
  })]},
  {effect:[...row().effect.slice(0,2),composed("DAMAGE_RESOLVED")]},
  {effect:[...row().effect.slice(0,2),composed("TURN_START")]},
  {effect:[...row().effect.slice(0,2),composed("IMPACT",{reviewedPch:1})]},
  {effect:[...row().effect.slice(0,2),composed("IMPACT",{
    module:{...composed().module,steps:[
     {kind:"SELECT_TARGET",selector:"USER",output:"enemy"},
     composed().module.steps[1],
    ]},
  })]},
  {effect:[...row().effect.slice(0,2),composed("IMPACT",{
    module:{...composed().module,steps:[
     ...composed().module.steps,{kind:"HEAL",amount:100},
    ]},
  })]},
  {effect:[...row().effect.slice(0,2),composed("IMPACT"),composed("IMPACT")]},
  {approvedAt:null},{pchCost:0},{status:"PENDING"},{cost:0},
  {attackType:"CUT"},{areaOfEffect:"Objetivo único | Alcance máximo: 2 m"},
 ];
 for(const [i,bad] of invalid.entries()){
  const candidate=row(1020+i,"IMPACT",bad);
  assert.equal(previewSkillExecution(candidate).executable,false,"bad #"+i);
  assert.throws(()=>compileCombatSkill(candidate),"bad #"+i);
 }
 assert.throws(()=>compileCombatSkill(row(),"LEGACY_ONLY"),/desactivadas/);
 assert.throws(()=>compileCombatSkill(row(1090,"ACTIVATE",{
  mechanics:{}, // D3.4 HP damage needs an explicit source channel
 })),/canal físico o mágico/);
});

test("the approved CONTACT preview respects the user's on/off switch",()=>{
 const r=row();
 const ok=projectApprovedCombatSkills([r],[],new Set(),()=>true);
 assert.equal(ok[0].executable,true);
 assert.equal(ok[0].modularHostileStatus,true);
 assert.equal(ok[0].hybridContact.statusGate,"CONTACT");
 const off=projectApprovedCombatSkills([r],[{skillId:951,active:false}],
  new Set(),()=>true);
 assert.equal(off[0].executable,false);
 assert.match(off[0].disabledReason,/desactivada/);
});
