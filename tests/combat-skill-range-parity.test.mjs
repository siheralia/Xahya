import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {combatSkillTargetOutOfRange} from "../lib/combat/skill-target-range.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {applyResolvedCombatSkill,newCombatState} from "../lib/combat/turn-engine.ts";

const mirror={
 skillKind:"CONSTRUCTION",constructionMaterial:"MIRROR",rangeMeters:5,
};
const offense={
 skillKind:"OFFENSE",constructionMaterial:null,rangeMeters:5,
};

test("mirror creation uses real position, never a hypothetical move-before distance",()=>{
 const distances={currentOpponentMeters:5.5,attackMeters:4.5};
 assert.equal(combatSkillTargetOutOfRange(mirror,distances),true,
  "a prepared 1 m step must not enable a 5 m mirror across 5.5 m");
 assert.equal(combatSkillTargetOutOfRange(offense,distances),false,
  "an attack skill can pay for BEFORE movement to enter range");
 assert.equal(combatSkillTargetOutOfRange(mirror,{
  currentOpponentMeters:4.5,attackMeters:5.5,
 }),false,"a mirror within actual range stays available regardless of attack mode");
 assert.equal(combatSkillTargetOutOfRange(
  {skillKind:"CONSTRUCTION",constructionMaterial:"LIGHT",rangeMeters:5},distances
 ),false,"non-mirror creation is validated by its placement point, not opponent range");
 assert.equal(combatSkillTargetOutOfRange({...mirror,rangeMeters:null},distances),false);
});

test("server refuses an out-of-range mirror even when a speculative move would close the gap",()=>{
 const skill=compileCombatSkill({
  id:820,name:"Espejo de alcance",status:"APPROVED",category:"OFFENSIVE",cost:15,
  areaOfEffect:"100m | Alcance máximo: 5 m",speed:"Ataque mágico",
  duration:"Instantánea",cooldown:"Sin cooldown",attackType:"PIERCE",
  effect:[
   {type:"SUMMON_MIRROR",value:1,target:"OTHER"},
   {type:"MIRROR_RAY",value:100,target:"MAGIC_ATTACK"},
   {type:"MAGIC_REFLECTION",value:100,target:"OTHER"},
  ],mechanics:{},
 });
 const fighter=(name,pos)=>({
  characterId:null,name,hp:100,maxHp:100,agility:60,speedValue:80,
  strength:20,constitution:10,precision:70,dodge:10,
  physicalAttack:30,physicalDefense:5,magicAttack:20,magicDefense:8,
  critical:0,luck:10,race:20,massKg:70,positionMeters:pos,
  attackType:"PIERCE",defenseType:"CONCENTRATED",
  weaponIntegrity:100,spentTicks:0,spentAp:0,
 });
 const state=newCombatState(fighter("Caster",0),fighter("Opponent",5.5));
 state.mana={PLAYER:{current:60,max:60},NPC:{current:40,max:40}};
 const cast={requestId:"range-mirror-check-1234",areaCenter:{x:.5,y:.5}};
 const dice={hit:.01,critical:.99,defense:.99};
 assert.throws(()=>applyResolvedCombatSkill(state,"PLAYER",skill,cast,dice),
  /fuera del alcance/,
  "server rejects a mirror placed out of range without charging PA or mana");
 assert.equal(state.actors.PLAYER.spentAp,0);
 assert.equal(state.mana.PLAYER.current,60);
 assert.equal(state.constructions?.length??0,0);
 assert.throws(()=>applyResolvedCombatSkill(state,"PLAYER",skill,{
  ...cast,requestId:"range-mirror-step-1234",
  planarMove:{x:1,y:0},movementOrder:"BEFORE",
 },dice),/Combinar movimiento y creación/,
  "mirror creation must not silently borrow a move");
});

test("skill picker receives separate current and movement-assisted distances",()=>{
 const encounter=readFileSync(
  new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
 const picker=readFileSync(
  new URL("../app/combat/[id]/CombatSkillLoadout.tsx",import.meta.url),"utf8");
 assert.match(encounter,/distanceMeters=\{attackDistance\} constructionDistanceMeters=\{targetDistance\}/);
 assert.match(picker,/combatSkillTargetOutOfRange\(skill,/);
 assert.match(picker,/currentOpponentMeters:constructionDistanceMeters/);
});
