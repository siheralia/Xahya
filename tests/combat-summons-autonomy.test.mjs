import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {newCombatState,applyResolvedCombatSkill,applyCombatCommand,
  progressAutonomousSummons} from "../lib/combat/turn-engine.ts";
import {battleFieldViewport,fieldToViewport} from "../lib/combat/field-plane.ts";

const fighter=(name,x,extras={})=>({
 characterId:null,name,hp:200,maxHp:200,agility:200,speedValue:200,
 strength:50,constitution:10,precision:80,dodge:20,
 physicalAttack:100,physicalDefense:20,magicAttack:25,magicDefense:15,
 critical:0,luck:10,race:20,massKg:70,positionMeters:x,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,...extras
});
const rolls={hit:0.1,critical:0.99,defense:0.99};
const makeState=()=>{
 const s=newCombatState(fighter("Invocador",0),fighter("Rival",1.1,{speedValue:15,agility:15}));
 s.mana={PLAYER:{current:200,max:200},NPC:{current:200,max:200}};
 return s;
};
const steps=(mode="ATTACK",target="OPPONENT",withSupport=false)=>{
 const key="RABBIT";
 return [
  {kind:"SUMMON_ENTITY",entityKey:key,label:"Bnuuy",manaCost:30,
    maintenanceMana:20,durationTurns:4,controlRangeMeters:15,hitLimit:3},
  {kind:"LINK_ENTITY_STAT",entityKey:key,sourceStat:"PHYSICAL_ATTACK",
    destStat:"PHYSICAL_ATTACK",factor:0.2},
  {kind:"LINK_ENTITY_STAT",entityKey:key,sourceStat:"AGI",
    destStat:"AGI",factor:1},
  {kind:"LINK_ENTITY_STAT",entityKey:key,sourceStat:"PHYSICAL_DEFENSE",
    destStat:"INTEGRITY",factor:2},
  {kind:"SET_ENTITY_BEHAVIOR",entityKey:key,mode,
    allowedModes:mode==="ATTACK"?["ATTACK","HOLD","MANUAL"]:
      ["FOLLOW","HOLD","MANUAL"],target,trigger:"CONTACT"},
  ...(withSupport?[
    {kind:"SELECT_TARGET",selector:"USER",output:"friend"},
    {kind:"REQUIRE_CONTACT",target:{source:"OUTPUT",key:"friend"}},
    {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"friend"},
      stat:"MAGIC_DEFENSE",operation:"BONUS",value:7,durationTurns:2},
  ]:[])
 ];
};
const cast=(mode="ATTACK",target="OPPONENT",withSupport=false)=>{
 const plan=compileCombatSkill({id:777,name:"Bnuuy test",status:"APPROVED",
  category:"UTILITY",cost:30,maintenanceCost:20,
  effect:[{type:"COMPOSED",module:{id:"graph",name:"Bnuuy",type:"COMPOSED",
    description:"",trigger:"ACTIVATE",steps:steps(mode,target,withSupport)}}]});
 return applyResolvedCombatSkill(makeState(),"PLAYER",plan,{requestId:"autonomy-test-01"},rolls);
};

test("autonomous attack uses creature initiative and PA, not the summoner's",()=>{
 let s=cast();
 const id=s.summons[0].id;
 assert.ok(s.summons[0].autoNextTick>s.tick);
 s=applyCombatCommand(s,"PLAYER",{kind:"WAIT"},rolls);
 const paidAp=s.actors.PLAYER.spentAp,clock=s.tick;
 const auto=progressAutonomousSummons(s,rolls);
 assert.equal(auto.actors.PLAYER.spentAp,paidAp);
 assert.equal(auto.tick,clock);
 assert.equal(auto.summons[0].autoSpentAp,1);
 assert.equal(auto.pending?.summonId,id);
 assert.equal(progressAutonomousSummons(auto,rolls),auto,"never create a second pending strike");
 const resolved=applyCombatCommand(auto,"NPC",{kind:"DEFEND",defense:"NONE"},rolls);
 assert.ok(resolved.actors.NPC.hp<200);
});

test("following the owner applies authorized support once while active",()=>{
 let s=cast("FOLLOW","USER",true);
 const next=applyCombatCommand(s,"PLAYER",{kind:"WAIT"},rolls);
 s=progressAutonomousSummons(next,rolls);
 assert.equal(s.actors.PLAYER.magicDefense,22);
 assert.equal(s.summonStatuses.length,1);
 assert.equal(s.actors.PLAYER.spentAp,next.actors.PLAYER.spentAp);
 const repeated=structuredClone(s);
 repeated.tick=repeated.summons[0].autoNextTick;
 s=progressAutonomousSummons(repeated,rolls);
 assert.equal(s.actors.PLAYER.magicDefense,22,"do not indefinitely stack the same buff");
 assert.equal(s.summonStatuses.length,1);
});

test("a summon may focus an enemy summon instead of the enemy fighter",()=>{
 let s=cast();
 const id=s.summons[0].id;
 const hostile={...structuredClone(s.summons[0]),owner:"NPC",
   id:"NPC:test-hostile",entityKey:"HOSTILE",label:"Familiar rival",
   fieldPosition:{x:.9,y:0},integrity:100,hitCount:0,expiresAtRound:10};
 s.summons.push(hostile);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{
   kind:"COMMAND_SUMMON",summonId:id,order:"CHANGE_TARGET",targetId:"SUMMON:missing"
 },rolls),/objetivo elegido/);
 s=applyCombatCommand(s,"PLAYER",{
   kind:"COMMAND_SUMMON",summonId:id,order:"CHANGE_TARGET",targetId:"SUMMON:"+hostile.id
 },rolls);
 assert.equal(s.summons[0].targetId,"SUMMON:"+hostile.id);
 const targetBefore=s.summons.find(x=>x.id===hostile.id).integrity;
 const playerHp=s.actors.NPC.hp;
 s.tick=Math.max(s.tick,s.summons[0].autoNextTick);
 s=progressAutonomousSummons(s,rolls);
 assert.ok(s.summons.find(x=>x.id===hostile.id)?.integrity<targetBefore);
 assert.equal(s.actors.NPC.hp,playerHp,"the enemy fighter is not struck instead");
});

test("any approved creature can be recalled to follow without creating new effects",()=>{
 let s=cast("ATTACK","OPPONENT",false);
 const id=s.summons[0].id;
 s=applyCombatCommand(s,"PLAYER",{
   kind:"COMMAND_SUMMON",summonId:id,order:"CHANGE_BEHAVIOR",newBehavior:"FOLLOW"
 },rolls);
 assert.equal(s.summons[0].behavior.mode,"FOLLOW");
 assert.equal(s.summons[0].contactEffects.length,0);
});

test("auto camera includes all active summons without changing combat positions",()=>{
 const me=fighter("Propietario",0),rival=fighter("Rival",1.2);
 const old=battleFieldViewport(me,rival);
 const view=battleFieldViewport(me,rival,1,[{x:-7,y:3},{x:5,y:-2}]);
 assert.ok(view.spanMeters>old.spanMeters);
 for(const point of [{x:-7,y:3},{x:5,y:-2}]){
  const projected=fieldToViewport(view,point);
  assert.ok(projected.x>=0&&projected.x<=1&&projected.y>=0&&projected.y<=1);
 }
});
