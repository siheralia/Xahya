import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {projectApprovedCombatSkills} from "../lib/combat/skill-preview.ts";
import {applyResolvedCombatSkill,applyCombatCommand,newCombatState,physicalAttackStart}
 from "../lib/combat/turn-engine.ts";

// These fields reproduce the existing approved Capoeira technique (#38) without
// changing any stored ability or awarding an unconfigured area-of-effect.
const capoeira={id:37,name:"Capoeira",status:"APPROVED",category:"PASSIVE",
 effect:[{type:"STAT_MULTIPLIER",target:"DODGE",value:150}],
 mechanics:{family:"CAPOEIRA"},condition:"Mientras esté en combate"};
const meia={
 id:38,name:"Meia-lua de compasso",category:"OFFENSIVE",status:"APPROVED",
 cost:30,maintenanceCost:0,accumulationCost:0,
 areaOfEffect:"Objetivo único | Alcance máximo: 2 m",
 speed:"DEFAULT",duration:"Instantánea",cooldown:"Sin cooldown",
 attackType:"BLUNT",condition:null,
 effect:[{type:"DAMAGE_MULTIPLIER",value:200,target:"PHYSICAL_ATTACK",targetKind:"OPPONENT"}],
 mechanics:{family:"CAPOEIRA",parentSkillId:37},
};
const fighter=(name,id,positionMeters,extras={})=>({
 name,characterId:id,hp:100,maxHp:100,agility:90,speedValue:90,strength:9,
 constitution:10,precision:70,dodge:10,physicalAttack:25,physicalDefense:7,
 magicAttack:15,magicDefense:7,critical:0,luck:10,race:20,massKg:70,
 positionMeters,attackType:"CUT",defenseType:"SOLID",weaponIntegrity:100,
 spentTicks:0,spentAp:0,...extras,
});
const dice={hit:0.01,critical:0.99,defense:0.99};
function encounter(distance=1.5){
 const attacker=fighter("Capoeirista",29,0,{
  equippedWeapon:{name:"Katana",mode:"MELEE",attackType:"CUT",
   effectiveRangeMeters:1.4,maximumRangeMeters:1.6}
 });
 const state=newCombatState(attacker,fighter("Rival",null,distance,{hp:100,maxHp:100,speedValue:70}));
 state.mana={PLAYER:{current:60,max:60},NPC:{current:20,max:20}};
 return state;
}
const request=(n)=>"meia-lua-cast-00000"+n;
const kickPath=[{x:0.1,y:0.48},{x:0.5,y:0.5}];

test("the real approved Meia-lua config is executable with its 30 mana / 2m / blunt x2 / linked Capoeira",()=>{
 const plan=compileCombatSkill(meia);
 assert.equal(plan.category,"OFFENSE");
 assert.equal(plan.requiredParentSkillId,37);
 assert.equal(plan.cost,30);
 assert.equal(plan.rangeMeters,2);
 assert.equal(plan.damageMultiplier,2);
 assert.equal(plan.attackType,"BLUNT");
 assert.equal(plan.usesMagic,false);
 assert.equal(plan.cooldownRounds,0);
 assert.equal(previewSkillExecution(meia).executable,true);
});

test("linked skills require the approved owned parent and cannot use stolen or absent prerequisites",()=>{
 const render=(skills,stolen=new Set())=>projectApprovedCombatSkills(
  skills,[],stolen,()=>true);
 const approved=render([meia,capoeira]);
 assert.equal(approved.find(s=>s.id===38)?.executable,true);
 assert.equal(approved.find(s=>s.id===38)?.requirementsSatisfied,true);
 const missing=render([meia]);
 assert.equal(missing.find(s=>s.id===38)?.executable,false);
 const stolen=render([meia,capoeira],new Set([37]));
 assert.equal(stolen.find(s=>s.id===38)?.executable,false);
 assert.equal(render([meia,{...capoeira,status:"DRAFT"}]).find(s=>s.id===38)?.executable,false);
});

test("the kick attacks independently of the katana and pays 30 mana and one action",()=>{
 const plan=compileCombatSkill(meia);
 const original=encounter();
 let state=applyResolvedCombatSkill(original,"PLAYER",plan,{
  requestId:request(1),attackSource:"KICK",trajectory:kickPath,
 },dice);
 assert.equal(state.mana.PLAYER.current,30);
 assert.equal(state.actors.PLAYER.spentAp,1);
 assert.equal(state.pending.attackSource,"KICK");
 assert.equal(state.pending.attackType,"BLUNT");
 assert.equal(state.pending.beyondEffectiveRange,false,"approved skill range must not use unarmed reach penalties");
 assert.equal(state.pending.skill.damageMultiplier,2);
 assert.equal(state.pending.skill.name,"Meia-lua de compasso");
 assert.equal(state.actors.PLAYER.equippedWeapon.name,"Katana");
 assert.deepEqual(physicalAttackStart(state,"PLAYER","KICK"),kickPath[1]);
 assert.equal(physicalAttackStart(state,"PLAYER","MAIN_HAND"),null);
 assert.equal(state.skillCooldowns.PLAYER["38"],0);
 const restored=JSON.parse(JSON.stringify(state));
 assert.deepEqual(applyResolvedCombatSkill(restored,"PLAYER",plan,{
  requestId:request(1),attackSource:"KICK",trajectory:kickPath,
 },dice),restored);
 state=applyCombatCommand(state,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(state.actors.NPC.hp<100,"the resolved kick must deal damage");
 assert.equal(state.actors.PLAYER.equippedWeapon.name,"Katana");
 assert.equal(original.mana.PLAYER.current,60,"global resource snapshot remains untouched");
});

test("the approved 2m range applies to a kick, irrespective of the equipped katana range",()=>{
 const plan=compileCombatSkill(meia);
 assert.throws(()=>applyResolvedCombatSkill(encounter(2.01),"PLAYER",plan,{
   requestId:request(2),attackSource:"KICK",trajectory:kickPath,
 },dice),/fuera del alcance/);
 const state=applyResolvedCombatSkill(encounter(1.9),"PLAYER",plan,{
  requestId:request(3),attackSource:"KICK",trajectory:kickPath,
 },dice);
 assert.equal(state.pending.skill.id,38);
 assert.equal(state.mana.PLAYER.current,30);
});

test("parent link is safe metadata, not a bypass for unimplemented advanced combat mechanics",()=>{
 assert.throws(()=>compileCombatSkill({...meia,mechanics:{family:"CAPOEIRA",parentSkillId:-1}}),/Referencia/);
 assert.throws(()=>compileCombatSkill({...meia,mechanics:{family:"CAPOEIRA",parentSkillId:38}}),/Referencia/);
 assert.throws(()=>compileCombatSkill({...meia,mechanics:{family:"CAPOEIRA",parentSkillId:37,
  rules:[{event:"ACTIVATE",actions:[{kind:"MANA_WARD"}]}]}}),/mecánicas avanzadas/);
 assert.throws(()=>compileCombatSkill({...meia,mechanics:{family:"CAPOEIRA",parentSkillId:37,
  activationConditions:[{kind:"STATUS",status:"STUNNED"}]}}),/mecánicas avanzadas/);
});

test("skill API rechecks owner, approval, theft, requirements and linked parent",()=>{
 const api=readFileSync(new URL("../app/api/combat/[id]/actions/route.ts",import.meta.url),"utf8");
 assert.match(api,/Skill\.where\(\{id:skillId,characterId,status:"APPROVED"\}\)/);
 assert.match(api,/stolenIds\.has\(skillId\)/);
 assert.match(api,/meetsEffectRequirements\(requirements,others\)/);
 assert.match(api,/plan\.requiredParentSkillId/);
 assert.match(api,/Number\(related\.id\)===plan\.requiredParentSkillId/);
});
