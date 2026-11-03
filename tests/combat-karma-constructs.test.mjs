import test from "node:test";
import assert from "node:assert/strict";
import {validateKarmaBoostAllocation} from "../lib/combat/karma-boost.ts";
import {creationPlanFromEffect,attachedCreationPassive} from "../lib/combat/constructs.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {newCombatState,applyCombatCommand,applyResolvedKarmaBoost,applyResolvedCombatSkill} from "../lib/combat/turn-engine.ts";

const fighter=(name,characterId,positionMeters=0)=>({
 name,characterId,hp:60,maxHp:60,agility:80,speedValue:80,
 strength:20,constitution:10,precision:60,dodge:8,
 physicalAttack:24,physicalDefense:9,magicAttack:18,magicDefense:90,
 critical:0,luck:10,race:20,massKg:70,positionMeters,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,
});
const dice={hit:0.2,critical:0.99,defense:0.95};
const state=()=>{const s=newCombatState(fighter("Guha",17),fighter("Rival",null,1.5));
 s.mana={PLAYER:{current:100,max:100},NPC:{current:100,max:100}};
 return s;
};
const sand={id:140,name:"Arena",status:"APPROVED",category:"UTILITY",cost:20,
 effect:[{type:"NARRATIVE",value:1,target:"CARD:W002",element:"EARTH",capability:"CREATE"}],
 mechanics:{family:"SIKATA",rules:[]},areaOfEffect:"Alcance máximo: 5 m",
 duration:"No termina"};
const light={id:120,name:"Fotoconstrucción",status:"APPROVED",category:"UTILITY",cost:0,
 effect:[{type:"NARRATIVE",value:1,target:"CARD:W002",element:"LIGHT",capability:"CREATE"}],
 mechanics:{},duration:"Instantánea"};
const passive={id:150,status:"APPROVED",category:"PASSIVE",mechanics:{
 parentSkillId:140,activationConditions:[{kind:"SKILL_ACTIVE",skillId:140}],
 variableResistance:{input:"ATTACK_SPEED",formula:"PROGRESSIVE",baseStat:"magicDefense",
 threshold:50,coefficient:0.02,maxMultiplier:3,minMultiplier:0.2},
}};
const makePlan=(skill)=>compileCombatSkill(skill);

test("2 karma per stat point; any size is one allocation, no artificial point cap",()=>{
 const allowed=new Set(["strength","agility","wisdom"]);
 const accepted=validateKarmaBoostAllocation({strength:7,agility:113,wisdom:9},allowed);
 assert.equal(accepted.points,129);
 assert.equal(accepted.cost,258);
 assert.deepEqual(accepted.allocation,{strength:7,agility:113,wisdom:9});
 assert.throws(()=>validateKarmaBoostAllocation({strength:1.5},allowed),/entero/);
 assert.throws(()=>validateKarmaBoostAllocation({magicAttack:1},allowed),/base no disponible/);
 assert.throws(()=>validateKarmaBoostAllocation({strength:-5},allowed),/positivo/);
});

test("one karma activation can buff several base stats for exactly one AP",()=>{
 const s=state();
 const a=applyResolvedKarmaBoost(s,"PLAYER","one-boost-123456",{strength:5,agility:3},16,
  {strength:5,agility:3,speedValue:3,physicalAttack:8,magicAttack:2});
 assert.equal(a.actors.PLAYER.spentAp,1);
 assert.equal(a.actors.PLAYER.strength,25);
 assert.equal(a.actors.PLAYER.agility,83);
 assert.equal(a.actors.PLAYER.physicalAttack,32);
 assert.equal(a.actors.PLAYER.speedValue,83);
 assert.equal(a.karmaBoosts.PLAYER.strength,5);
 assert.equal(a.karmaBoosts.PLAYER.agility,3);
 assert.equal(a.log.filter(e=>e.kind==="KARMA").length,1);
 assert.equal(applyResolvedKarmaBoost(a,"PLAYER","one-boost-123456",{strength:5,agility:3},16,{}),a);
});

test("the skill compiler accepts CREATE and rejects arbitrary narrative effects",()=>{
 assert.equal(makePlan(light).category,"CONSTRUCTION");
 assert.equal(makePlan(light).construction.material,"LIGHT");
 assert.equal(makePlan(sand).construction.material,"EARTH");
 assert.equal(creationPlanFromEffect({type:"NARRATIVE",capability:"CREATE",element:"LIGHT"}).material,"LIGHT");
 assert.throws(()=>compileCombatSkill({...light,effect:[{type:"NARRATIVE",value:1,description:"only story"}]}),/no crea una construcción/);
});
test("Sikata material inherits the approved passive automatically and block activation costs no extra action",()=>{
 const plan=makePlan(sand);
 plan.creationPassive=attachedCreationPassive(140,[passive]);
 assert.equal(plan.creationPassive.sourceSkillId,150);
 let s=applyResolvedCombatSkill(state(),"PLAYER",plan,{
  requestId:"create-field-123456",areaCenter:{x:0.5,y:0.5},constructionForm:"FIELD"},dice);
 assert.equal(s.constructions[0].form,"FIELD");
 assert.equal(s.constructions[0].passive.sourceSkillId,150);
 assert.equal(s.actors.PLAYER.spentAp,1);
 assert.equal(s.mana.PLAYER.current,80);
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"},dice);
 s=applyResolvedCombatSkill(s,"PLAYER",plan,{
  requestId:"create-block-123456",areaCenter:{x:0.5,y:0.5},constructionForm:"BLOCK"},dice);
 const block=s.constructions.find(c=>c.form==="BLOCK");
 assert.ok(block);
 assert.equal(block.passive.sourceSkillId,150);
 assert.equal(s.mana.PLAYER.current,60);
 const baseRes=s.actors.PLAYER.magicDefense;
 s.pending={by:"NPC",against:"PLAYER",attackType:"BLUNT",trajectory:[{x:0,y:0.5},{x:1,y:0.5}],
  launchedAtTick:s.tick,usesMagic:false};
 s.actors.NPC.physicalAttack=3;
 const defended=applyCombatCommand(s,"PLAYER",{kind:"DEFEND",defense:"CONSTRUCTION",constructionId:block.id},dice);
 assert.equal(defended.actors.PLAYER.hp,s.actors.PLAYER.hp);
 assert.ok(defended.constructions.find(c=>c.id===block.id).durability<baseRes);
});

test("light objects are visible but cannot attack, block or inherit a sand passive",()=>{
 const plan=makePlan(light);
 const s=applyResolvedCombatSkill(state(),"PLAYER",plan,{
   requestId:"light-decor-123456",areaCenter:{x:0.2,y:0.7},
   constructionForm:"DECOR",constructionLabel:"Esfera azul"},dice);
 const item=s.constructions[0];
 assert.equal(item.material,"LIGHT");assert.equal(item.form,"DECOR");
 assert.equal(item.tangible,false);assert.equal(item.durability,undefined);
 assert.equal(item.passive,undefined);assert.equal(item.label,"Esfera azul");
 assert.equal(s.actors.PLAYER.spentAp,1);
 assert.equal(s.mana.PLAYER.current,100);
 assert.throws(()=>applyResolvedCombatSkill(state(),"PLAYER",plan,{
  requestId:"light-block-123456",areaCenter:{x:0.2,y:0.7},constructionForm:"BLOCK"},dice),/decorativos/);
});
