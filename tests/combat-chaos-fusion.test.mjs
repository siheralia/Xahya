import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {applyResolvedCombatSkill,applyCombatCommand,newCombatState} from "../lib/combat/turn-engine.ts";
import {activeChaosField,chaosRotationDegrees,distortChaosMove,
 compileFusionPlan} from "../lib/combat/chaos-fusion.ts";
import {summonStat} from "../lib/combat/summons.ts";
import {executeMicroEvent,emptyMicroState,validateEffectContainers} from "../lib/effects/micro-modules.ts";
import {combatChargeBalance} from "../lib/combat/charge-pools.ts";

const fighter=(name,positionMeters,patch={})=>({
 characterId:null,name,hp:350,maxHp:350,agility:200,speedValue:200,
 strength:80,constitution:10,precision:50,dodge:40,
 physicalAttack:100,physicalDefense:40,magicAttack:100,magicDefense:20,
 critical:0,luck:10,race:20,massKg:70,positionMeters,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,...patch
});
const rolls={hit:0.2,critical:0.95,defense:0.85};
const names=["BNUUY_JUICIO","BNUUY_CARGA","BNUUY_INTERIOR","BNUUY_SOLEDAD",
 "BNUUY_VIDA","BNUUY_CAMINATA","BNUUY_ECLIPSE"];
const module=(id,steps)=>({type:"COMPOSED",module:{
 id,name:id,description:"",type:"COMPOSED",trigger:"ACTIVATE",steps
}});
const seedSkill=()=>({
 id:990,name:"Siete familiares",status:"APPROVED",category:"UTILITY",
 cost:210,maintenanceCost:140,duration:"2 turnos",
 effect:names.map(key=>module("M_"+key,[
  {kind:"SUMMON_ENTITY",entityKey:key,label:key,manaCost:30,
    maintenanceMana:20,durationTurns:2,controlRangeMeters:15,hitLimit:3},
  {kind:"LINK_ENTITY_STAT",entityKey:key,sourceStat:"PHYSICAL_ATTACK",
    destStat:"PHYSICAL_ATTACK",factor:0.2},
  {kind:"LINK_ENTITY_STAT",entityKey:key,sourceStat:"AGI",destStat:"AGI",factor:1},
  {kind:"LINK_ENTITY_STAT",entityKey:key,sourceStat:"PHYSICAL_DEFENSE",
    destStat:"INTEGRITY",factor:2},
  {kind:"SET_ENTITY_BEHAVIOR",entityKey:key,mode:"FOLLOW",
    allowedModes:["FOLLOW","HOLD"],target:"USER",trigger:"COMMAND"}
 ]))
});
const fusionSteps=(overrides={})=>[
 {kind:"FUSE_SUMMONS",sourceEntityKeys:[...names],entityKey:"REINO_CAOS",
  label:"Reino del Caos",manaCost:30,maintenanceMana:20,
  durationTurns:2,controlRangeMeters:15,hitLimit:3,...overrides},
 {kind:"LINK_ENTITY_STAT",entityKey:"REINO_CAOS",sourceStat:"PHYSICAL_ATTACK",
   destStat:"PHYSICAL_ATTACK",factor:1},
 {kind:"SET_ENTITY_STAT",entityKey:"REINO_CAOS",destStat:"AGI",value:80},
 {kind:"LINK_ENTITY_STAT",entityKey:"REINO_CAOS",sourceStat:"PHYSICAL_DEFENSE",
   destStat:"INTEGRITY",factor:2},
 {kind:"SET_ENTITY_BEHAVIOR",entityKey:"REINO_CAOS",mode:"HOLD",
   allowedModes:["HOLD","ATTACK","MANUAL"],target:"OPPONENT",trigger:"COMMAND"},
 {kind:"CHAOS_FIELD",entityKey:"REINO_CAOS",radiusMeters:5,
   rotationDegrees:90,rotateEachRound:true}
];
const fusionSkill=(steps=fusionSteps(),changes={})=>({
 id:991,name:"Reino del Caos",status:"APPROVED",category:"UTILITY",
 cost:30,maintenanceCost:20,duration:"2 turnos",
 effect:[module("REINO_MODULAR",steps)],...changes
});
const plan=compileCombatSkill(fusionSkill());
const initial=(enemyX=1.2)=>{
 const s=newCombatState(fighter("Invocador",0),
   fighter("Oponente",enemyX,{agility:20,speedValue:20}));
 s.mana={PLAYER:{current:1000,max:1000},NPC:{current:500,max:500}};
 return s;
};
const cast=(s,skill,requestId)=>applyResolvedCombatSkill(s,"PLAYER",
 compileCombatSkill(skill),{requestId},rolls);
const ready=(enemyX=1.2)=>{
 let s=cast(initial(enemyX),seedSkill(),"summon-seven-bnuuy-111");
 assert.equal(s.summons.length,7);
 return s;
};
const fuse=(s,requestId="reino-chaos-fusion-1234")=>
 applyResolvedCombatSkill(s,"PLAYER",plan,{requestId},rolls);
const wall=(id,x,y)=>({
 id,owner:"PLAYER",sourceSkillId:777,material:"EARTH",form:"BLOCK",
 label:id,center:{x:.5,y:.5},createdRound:1,fieldPosition:{x,y},
 heightMeters:0,footprintRadiusMeters:.2,solidHeightMeters:2,
 tangible:true,durability:100,hitCount:0
});

test("fusion graph validates and pure interpreter emits requests only",()=>{
 const steps=fusionSteps();
 assert.equal(validateEffectContainers([module("REINO_MODULAR",steps).module]),null);
 assert.equal(plan.category,"FUSION");
 assert.equal(previewSkillExecution(fusionSkill()).needsAim,false);
 assert.equal(compileFusionPlan(fusionSkill().effect,30).sourceEntityKeys.length,7);
 const pure=executeMicroEvent(emptyMicroState(),[
  module("FUSION_REQUEST_ONLY",[steps[0],steps[5]]).module
 ],{eventId:"chaos-fusion-pure",ownerId:10,trigger:"ACTIVATE",stats:{HP:100,MAX_HP:100}});
 assert.equal(pure.intents[0].kind,"FUSE_SUMMONS");
 assert.equal(pure.intents[1].kind,"CHAOS_FIELD");
 assert.deepEqual(pure.state.accumulators,{});
});

test("seven owned creatures become exactly one persistent fused creature with paid action",()=>{
 const before=ready();
 const saved=structuredClone(before);
 const next=fuse(before);
 assert.equal(next.summons.length,1);
 assert.equal(next.summons[0].entityKey,"REINO_CAOS");
 assert.equal(next.summons[0].fusedFrom.length,7);
 assert.equal(next.summons[0].integrity,80);
 assert.equal(next.summons[0].chaosField.radiusMeters,5);
 assert.equal(summonStat(next.summons[0],next.actors.PLAYER,"AGI"),80,
   "fusion stat can be fixed independently of caster agility");
 assert.equal(next.mana.PLAYER.current,760,"210 to summon, 30 to fuse");
 assert.equal(next.actors.PLAYER.spentAp,before.actors.PLAYER.spentAp+1);
 assert.ok(next.actors.PLAYER.spentTicks>before.actors.PLAYER.spentTicks);
 assert.equal(before.summons.length,7,"failed or successful casts do not mutate original state");
 assert.deepEqual(saved,before);
 assert.equal(fuse(next),next,"duplicate request is idempotent");
 assert.equal(next.log.filter(e=>e.summary.includes("fusionó")).length,1);
});

test("movement inside hostile field is rotated for drawn vector, not multiplied",()=>{
 let s=fuse(ready());
 assert.equal(activeChaosField(s,"NPC").degrees,90);
 assert.equal(activeChaosField(s,"PLAYER"),null,"own field never affects own movements");
 s=applyCombatCommand(s,"PLAYER",{kind:"WAIT"},rolls);
 const old=s.actors.NPC.positionMeters;
 s=applyCombatCommand(s,"NPC",{
  kind:"MOVE",direction:"VECTOR",meters:1,planarMove:{x:1,y:0}
 },rolls);
 assert.ok(Math.abs(s.actors.NPC.positionMeters-old)<1e-8);
 assert.ok(Math.abs(s.actors.NPC.fieldPosition.y-1)<1e-8);
 assert.equal(s.actors.NPC.spentAp,1);
 assert.ok(s.actors.NPC.spentTicks>0);
});

test("relative TOWARD/AWAY directions are rotated but do not increase permitted range",()=>{
 let s=fuse(ready());
 s=applyCombatCommand(s,"PLAYER",{kind:"WAIT"},rolls);
 const start=s.actors.NPC.positionMeters;
 s=applyCombatCommand(s,"NPC",{kind:"MOVE",meters:1,direction:"TOWARD"},rolls);
 assert.equal(s.actors.NPC.positionMeters,start);
 assert.ok(Math.abs(s.actors.NPC.fieldPosition.y)>0.99);
});
test("outside field, normal directions remain unchanged",()=>{
 let s=fuse(ready(20));
 assert.equal(activeChaosField(s,"NPC"),null);
 s=applyCombatCommand(s,"PLAYER",{kind:"WAIT"},rolls);
 s=applyCombatCommand(s,"NPC",{
  kind:"MOVE",meters:1,direction:"VECTOR",planarMove:{x:1,y:0}
 },rolls);
 assert.equal(s.actors.NPC.positionMeters,21);
 assert.equal(s.actors.NPC.fieldPosition.y,0);
});
test("rotated collision is tested against the actual path before spending any AP",()=>{
 let s=fuse(ready());
 s=applyCombatCommand(s,"PLAYER",{kind:"WAIT"},rolls);
 s.constructions=[wall("caos-muro",1.2,.5)];
 const old=structuredClone(s);
 assert.throws(()=>applyCombatCommand(s,"NPC",{
  kind:"MOVE",meters:1,direction:"VECTOR",planarMove:{x:1,y:0}
 },rolls),/obstáculo caos-muro/);
 assert.deepEqual(s,old);
});

test("field rotates each round but never grants a free attack or teleports a fighter",()=>{
 const config={radiusMeters:5,rotationDegrees:90,rotateEachRound:true};
 assert.equal(chaosRotationDegrees(config,1,1),90);
 assert.equal(chaosRotationDegrees(config,1,2),180);
 assert.equal(chaosRotationDegrees(config,1,3),270);
 assert.equal(chaosRotationDegrees(config,1,4),90);
 assert.equal(chaosRotationDegrees({...config,rotateEachRound:false},1,10),90);
 assert.deepEqual(distortChaosMove(fuse(ready()),"NPC",{x:0.5,y:0}),{x:0,y:0.5});
 const s=fuse(ready());
 assert.equal(s.pending,null);
 assert.equal(s.actors.NPC.spentAp,0);
 assert.equal(s.actors.NPC.positionMeters,1.2);
});

test("fusion rejects absent, foreign, expired and duplicate result creatures without charging",()=>{
 const missing=ready();
 missing.summons=missing.summons.filter(s=>s.entityKey!=="BNUUY_VIDA");
 const oldMana=missing.mana.PLAYER.current;
 assert.throws(()=>fuse(missing),/Falta una criatura activa/);
 assert.equal(missing.mana.PLAYER.current,oldMana);
 const stolen=ready();
 stolen.summons.find(x=>x.entityKey==="BNUUY_JUICIO").owner="NPC";
 assert.throws(()=>fuse(stolen),/Falta una criatura activa/);
 const expired=ready();
 expired.summons.find(x=>x.entityKey==="BNUUY_ECLIPSE").expiresAtRound=expired.round;
 assert.throws(()=>fuse(expired),/Falta una criatura activa/);
 const duplicated=ready();
 duplicated.summons.push({...duplicated.summons[0],id:"duplicate-fused",entityKey:"REINO_CAOS"});
 assert.throws(()=>fuse(duplicated),/ya existe/);
 const mana=ready();
 mana.mana.PLAYER.current=29;
 assert.throws(()=>fuse(mana),/Maná insuficiente/);
 const cooldown=ready();
 cooldown.skillCooldowns={PLAYER:{"991":9}};
 assert.throws(()=>fuse(cooldown),/cooldown/);
});

test("fusion compiler fails closed on unknown nodes, forged skill cost and invalid field",()=>{
 assert.throws(()=>compileCombatSkill(fusionSkill(fusionSteps(),{cost:0})),/maná de la habilidad/);
 assert.throws(()=>compileCombatSkill(fusionSkill(fusionSteps(),{maintenanceCost:10})),/mantenimiento/);
 assert.throws(()=>compileCombatSkill(fusionSkill([...fusionSteps(),
  {kind:"HEAL",amount:100}])),/sin resolutor/);
 assert.throws(()=>compileCombatSkill(fusionSkill(fusionSteps().map(x=>x.kind==="CHAOS_FIELD"
  ?{...x,radiusMeters:100}:x))),/distorsión de dirección inválida/);
 assert.throws(()=>compileCombatSkill(fusionSkill(fusionSteps().map(x=>x.kind==="FUSE_SUMMONS"
  ?{...x,sourceEntityKeys:["BNUUY_VIDA","BNUUY_VIDA"]}:x))),/fusión de criaturas inválida/);
 assert.throws(()=>compileCombatSkill(fusionSkill(fusionSteps().filter(x=>x.kind!=="SET_ENTITY_BEHAVIOR"))),
  /comportamiento/);
});

test("legacy lunar charges migrate before components are fused and removed",()=>{
 const s=ready();
 s.summons.find(x=>x.entityKey==="BNUUY_INTERIOR").charges={LUNAR_CHARGES:3};
 s.summons.find(x=>x.entityKey==="BNUUY_INTERIOR").chargesMigrated=undefined;
 const next=fuse(s);
 assert.equal(combatChargeBalance(next,"PLAYER","LUNAR_CHARGES"),3);
 assert.equal(next.summons.length,1);
});
