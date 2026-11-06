import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {newCombatState,applyResolvedCombatSkill,applyCombatCommand,canAct} from "../lib/combat/turn-engine.ts";
import {summonStat} from "../lib/combat/summons.ts";
import {isDebuffStatus} from "../lib/combat/summon-status.ts";

const fighter=(name,positionMeters,patch={})=>({
 characterId:null,name,hp:200,maxHp:200,agility:200,speedValue:200,
 strength:80,constitution:10,precision:50,dodge:40,
 physicalAttack:100,physicalDefense:40,magicAttack:100,magicDefense:20,
 critical:0,luck:10,race:20,massKg:70,positionMeters,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",spentTicks:0,spentAp:0,...patch
});
const state=(a=fighter("Owner",0),b=fighter("Enemy",1.1,{speedValue:20,agility:20}))=>{
 const s=newCombatState(a,b);
 s.mana={PLAYER:{current:500,max:500},NPC:{current:500,max:500}};
 return s;
};
const link=(key)=>[
 {kind:"SUMMON_ENTITY",entityKey:key,label:key,manaCost:30,maintenanceMana:20,
  durationTurns:4,controlRangeMeters:15,hitLimit:3},
 {kind:"LINK_ENTITY_STAT",entityKey:key,sourceStat:"PHYSICAL_ATTACK",destStat:"PHYSICAL_ATTACK",factor:0.2},
 {kind:"LINK_ENTITY_STAT",entityKey:key,sourceStat:"AGI",destStat:"AGI",factor:1},
 {kind:"LINK_ENTITY_STAT",entityKey:key,sourceStat:"PHYSICAL_DEFENSE",destStat:"INTEGRITY",factor:2},
];
const touch=(selector,output="target")=>[
 {kind:"SELECT_TARGET",selector,output},
 {kind:"REQUIRE_CONTACT",target:{source:"OUTPUT",key:output}},
];
const container=(id,steps)=>({type:"COMPOSED",module:{
 id,name:id,type:"COMPOSED",description:"",trigger:"ACTIVATE",steps
}});
const skill=(modules,cost=30,maintenanceCost=20)=>({
 id:905,name:"Familiar de prueba",status:"APPROVED",category:"UTILITY",
 cost,maintenanceCost,effect:modules
});
const rolls={hit:0.12,critical:0.99,defense:0.99};
const cast=(s,plan,requestId="summon-contact-123456")=>
 applyResolvedCombatSkill(s,"PLAYER",plan,{requestId},rolls);

test("preset dragon has fixed intrinsic stats independent of its summoner",()=>{
 const steps=[
  {kind:"SUMMON_ENTITY",entityKey:"DRAGON",label:"Dragón",manaCost:30,
   maintenanceMana:20,durationTurns:3,controlRangeMeters:15,hitLimit:3},
  ...[
    ["PHYSICAL_ATTACK",180],["PHYSICAL_DEFENSE",90],["AGI",60],
    ["MOVE_SPEED",60],["PRECISION",75],["DODGE",30],["STRENGTH",120],
    ["MAGIC_ATTACK",130],["MAGIC_DEFENSE",110],["CON",45],["CRITICAL",8],
    ["LUCK",7],["RACE",70],["MASS_KG",600],["INTEGRITY",300]
  ].map(([destStat,value])=>({kind:"SET_ENTITY_STAT",entityKey:"DRAGON",destStat,value})),
  {kind:"SET_ENTITY_BEHAVIOR",entityKey:"DRAGON",mode:"FOLLOW",
   allowedModes:["FOLLOW","HOLD"],target:"USER",trigger:"COMMAND"},
 ];
 const plan=compileCombatSkill(skill([container("DRAGON_GRAPH",steps)]));
 const a=cast(state(fighter("Apprentice",0,{physicalAttack:8,physicalDefense:2,
  agility:3,speedValue:3,strength:2})),plan);
 const b=cast(state(fighter("Archmage",0,{physicalAttack:900,physicalDefense:200,
  agility:700,speedValue:700,strength:400})),plan);
 for(const key of ["PHYSICAL_ATTACK","PHYSICAL_DEFENSE","AGI","MOVE_SPEED","PRECISION","DODGE","STRENGTH","MAGIC_ATTACK","MAGIC_DEFENSE","CON","CRITICAL","LUCK","RACE","MASS_KG"])
  assert.equal(summonStat(a.summons[0],a.actors.PLAYER,key),summonStat(b.summons[0],b.actors.PLAYER,key));
 assert.equal(a.summons[0].integrity,300);
 assert.equal(b.summons[0].integrity,300);
 assert.equal(summonStat(a.summons[0],a.actors.PLAYER,"PHYSICAL_ATTACK"),180);
 assert.equal(summonStat(a.summons[0],a.actors.PLAYER,"AGI"),60);
});

test("fixed and dynamic stats can coexist, but duplicate destination is rejected",()=>{
 const steps=[...link("FAMILIAR")
   .filter(x=>x.destStat!=="AGI"),
  {kind:"SET_ENTITY_STAT",entityKey:"FAMILIAR",destStat:"AGI",value:55},
  {kind:"SET_ENTITY_BEHAVIOR",entityKey:"FAMILIAR",mode:"FOLLOW",
   allowedModes:["FOLLOW"],target:"USER",trigger:"COMMAND"}];
 const plan=compileCombatSkill(skill([container("MIXED",steps)]));
 const a=cast(state(),plan).summons[0];
 assert.equal(summonStat(a,fighter("Caster",0,{physicalAttack:80}),"PHYSICAL_ATTACK"),16);
 assert.equal(summonStat(a,fighter("Caster",0,{agility:999}),"AGI"),55);
 const duplicated=[...steps,{kind:"LINK_ENTITY_STAT",entityKey:"FAMILIAR",sourceStat:"AGI",
   destStat:"AGI",factor:1}];
 assert.throws(()=>compileCombatSkill(skill([container("DUPLICATE",duplicated)])),/misma estadística|único valor/);
});

test("a paid touch applies a temporary ally buff, without affecting global stats or free actions",()=>{
 const steps=[
  ...link("CARGA"),
  {kind:"SET_ENTITY_BEHAVIOR",entityKey:"CARGA",mode:"FOLLOW",
    allowedModes:["FOLLOW"],target:"USER",trigger:"CONTACT"},
  ...touch("USER"),
  {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"target"},stat:"PHYSICAL_ATTACK",
    operation:"MULTIPLIER",value:1.3,durationTurns:2},
 ];
 const plan=compileCombatSkill(skill([container("BUFF_GRAPH",steps)]));
 const before=state();
 let s=cast(before,plan);
 assert.equal(s.actors.PLAYER.physicalAttack,100);
 const mana=s.mana.PLAYER.current,ap=s.actors.PLAYER.spentAp;
 assert.equal(canAct(s,"PLAYER"),true);
 s=applyCombatCommand(s,"PLAYER",{kind:"COMMAND_SUMMON",summonId:s.summons[0].id,order:"ACT"},rolls);
 assert.equal(s.actors.PLAYER.physicalAttack,130);
 assert.equal(s.summonStatuses.length,1);
 assert.equal(s.mana.PLAYER.current,mana);
 assert.equal(s.actors.PLAYER.spentAp,ap+1);
 assert.equal(before.actors.PLAYER.physicalAttack,100);
 // Advance from round one through two full round boundaries.
 for(let i=0;i<2;i++){
   s.actors.PLAYER.spentTicks=100;
   s.actors.NPC.spentTicks=80;
   s=applyCombatCommand(s,"NPC",{kind:"WAIT"},rolls);
 }
 assert.equal(s.round,3);
 assert.equal(s.summonStatuses.length,0);
 assert.equal(s.actors.PLAYER.physicalAttack,100);
});

test("hostile debuff requires resolved HP damage when trigger is HP_DAMAGE",()=>{
 const steps=[
  ...link("SOLEDAD"),
  {kind:"SET_ENTITY_BEHAVIOR",entityKey:"SOLEDAD",mode:"ATTACK",
    allowedModes:["ATTACK"],target:"OPPONENT",trigger:"HP_DAMAGE"},
  ...touch("OPPONENT"),
  {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"target"},stat:"DODGE",
    operation:"BONUS",value:-20,durationTurns:2},
 ];
 const plan=compileCombatSkill(skill([container("DEBUFF_GRAPH",steps)]));
 let s=cast(state(),plan),id=s.summons[0].id;
 s=applyCombatCommand(s,"PLAYER",{kind:"COMMAND_SUMMON",summonId:id,order:"ATTACK"},rolls);
 const priorHp=s.actors.NPC.hp;
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},rolls);
 assert.ok(s.actors.NPC.hp<priorHp);
 assert.equal(s.actors.NPC.dodge,20);
 assert.equal(s.summonStatuses.length,1);
 assert.ok(isDebuffStatus(s.summonStatuses[0]));
});

test("inversion consumes mana only when a debuff exists and grants at most six lunar charges",()=>{
 const weaken=[
  ...link("CURSE"),
  {kind:"SET_ENTITY_BEHAVIOR",entityKey:"CURSE",mode:"FOLLOW",
   allowedModes:["FOLLOW"],target:"USER",trigger:"CONTACT"},
  ...touch("USER"),
  {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"target"},stat:"PHYSICAL_ATTACK",
   operation:"MULTIPLIER",value:0.7,durationTurns:2}
 ];
 const inverse=[
  ...link("INTERIOR"),
  {kind:"SET_ENTITY_BEHAVIOR",entityKey:"INTERIOR",mode:"FOLLOW",
   allowedModes:["FOLLOW"],target:"USER",trigger:"CONTACT"},
  ...touch("USER"),
  {kind:"INVERT_STATUS",target:{source:"OUTPUT",key:"target"},
   selection:"LATEST_DEBUFF",manaCost:10,chargeAccumulator:"LUNAR_CHARGES"}
 ];
 const plan=compileCombatSkill(skill([
  container("CURSE_GRAPH",weaken),container("INTERIOR_GRAPH",inverse)
 ],60,40));
 let s=cast(state(),plan);
 const curse=s.summons.find(x=>x.entityKey==="CURSE").id;
 const interior=s.summons.find(x=>x.entityKey==="INTERIOR").id;
 s=applyCombatCommand(s,"PLAYER",{kind:"COMMAND_SUMMON",summonId:curse,order:"ACT"},rolls);
 assert.equal(s.actors.PLAYER.physicalAttack,70);
 const mana=s.mana.PLAYER.current;
 s=applyCombatCommand(s,"PLAYER",{kind:"COMMAND_SUMMON",summonId:interior,order:"ACT"},rolls);
 assert.equal(s.actors.PLAYER.physicalAttack,130);
 assert.equal(s.mana.PLAYER.current,mana-10);
 assert.equal(s.combatCharges.PLAYER.LUNAR_CHARGES,1);
 assert.equal(s.summonStatuses.length,1,"inversion changes the existing effect, not a duplicate");
 assert.equal(isDebuffStatus(s.summonStatuses[0]),false);
 const m=s.mana.PLAYER.current;
 s=applyCombatCommand(s,"PLAYER",{kind:"COMMAND_SUMMON",summonId:interior,order:"ACT"},rolls);
 assert.equal(s.mana.PLAYER.current,m,"cannot charge mana when nothing is available to invert");
 assert.equal(s.combatCharges.PLAYER.LUNAR_CHARGES,1);
});

test("server rejects unsupported status formulas and target selectors",()=>{
 const base=link("X");
 const behavior={kind:"SET_ENTITY_BEHAVIOR",entityKey:"X",mode:"ATTACK",
   allowedModes:["ATTACK"],target:"OPPONENT",trigger:"CONTACT"};
 assert.throws(()=>compileCombatSkill(skill([container("INVALID_TARGET",[
  ...base,behavior,{kind:"SELECT_TARGET",selector:"COMBAT",output:"choice"},
  {kind:"REQUIRE_CONTACT",target:{source:"OUTPUT",key:"choice"}},
  {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"choice"},stat:"DODGE",
   operation:"BONUS",value:-3,durationTurns:2}
 ])])),/invocador u oponente/);
 assert.throws(()=>compileCombatSkill(skill([container("INVALID_FORMULA",[
  ...base,behavior,...touch("OPPONENT"),
  {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"target"},stat:"DODGE",
   operation:"MULTIPLIER",value:{source:"STAT",key:"strength"},durationTurns:2}
 ])])),/valor numérico fijo/);
});

test("combat stat picker rejects a forged stat and applies only an authorized choice",()=>{
 const steps=[
  ...link("JUDGMENT"),
  {kind:"SET_ENTITY_BEHAVIOR",entityKey:"JUDGMENT",mode:"FOLLOW",
   allowedModes:["FOLLOW"],target:"USER",trigger:"CONTACT"},
  ...touch("USER"),
  {kind:"SELECT_STAT",output:"chosenAttribute",mode:"COMBAT",allowed:["DODGE","PHYSICAL_ATTACK"]},
  {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"target"},
   stat:{source:"STAT_SELECTION",key:"chosenAttribute"},
   operation:"MULTIPLIER",value:0.5,durationTurns:2}
 ];
 const plan=compileCombatSkill(skill([container("JUDGMENT_PICKER",steps)]));
 let s=cast(state(),plan),id=s.summons[0].id;
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{
  kind:"COMMAND_SUMMON",summonId:id,order:"ACT",chosenStat:"MAX_HP"
 },rolls),/estadística autorizada/);
 assert.equal(s.actors.PLAYER.spentAp,1,"rejected selection must not debit the original state");
 s=applyCombatCommand(s,"PLAYER",{
  kind:"COMMAND_SUMMON",summonId:id,order:"ACT",chosenStat:"DODGE"
 },rolls);
 assert.equal(s.actors.PLAYER.dodge,20);
 assert.equal(s.summonStatuses[0].stat,"dodge");
});
test("random stat selection uses server rolls, not client requested attributes",()=>{
 const steps=[
  ...link("RANDOM_FAMILIAR"),
  {kind:"SET_ENTITY_BEHAVIOR",entityKey:"RANDOM_FAMILIAR",mode:"FOLLOW",
   allowedModes:["FOLLOW"],target:"USER",trigger:"CONTACT"},
  ...touch("USER"),
  {kind:"SELECT_STAT",output:"randomAttribute",mode:"RANDOM",allowed:["DODGE","PHYSICAL_ATTACK"]},
  {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"target"},
   stat:{source:"STAT_SELECTION",key:"randomAttribute"},
   operation:"MULTIPLIER",value:0.5,durationTurns:2}
 ];
 const plan=compileCombatSkill(skill([container("RANDOM_PICK",steps)]));
 let s=cast(state(),plan);
 s=applyCombatCommand(s,"PLAYER",{
  kind:"COMMAND_SUMMON",summonId:s.summons[0].id,order:"ACT",chosenStat:"DODGE"
 },{...rolls,hit:0.99});
 assert.equal(s.summonStatuses[0].stat,"physicalAttack");
 assert.equal(s.actors.PLAYER.physicalAttack,50);
 assert.equal(s.actors.PLAYER.dodge,40);
});
