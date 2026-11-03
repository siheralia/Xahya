import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {projectApprovedCombatSkills,availableConstructionMaterials} from "../lib/combat/skill-preview.ts";
import {newCombatState,applyCombatCommand,applyResolvedCombatSkill} from "../lib/combat/turn-engine.ts";
const skill={
 id:1,name:"Espejo mágico",status:"APPROVED",category:"OFFENSIVE",cost:15,
 areaOfEffect:"100m | Alcance máximo: 5 m",speed:"Ataque mágico",
 duration:"Instantánea",cooldown:"Sin cooldown",attackType:"PIERCE",
 effect:[
  {type:"SUMMON_MIRROR",value:1,target:"OTHER"},
  {type:"MIRROR_RAY",value:100,target:"MAGIC_ATTACK"},
  {type:"MAGIC_REFLECTION",value:100,target:"OTHER"}
 ],mechanics:{}
};
const fighter=(name,characterId,pos,extra={})=>({
 characterId,name,hp:100,maxHp:100,agility:60,speedValue:80,strength:20,
 constitution:10,precision:70,dodge:10,physicalAttack:30,physicalDefense:5,
 magicAttack:20,magicDefense:8,critical:0,luck:10,race:20,massKg:70,
 positionMeters:pos,attackType:"PIERCE",defenseType:"CONCENTRATED",
 weaponIntegrity:100,spentTicks:0,spentAp:0,...extra
});
const dice={hit:0.01,critical:0.99,defense:0.99};
const plan=compileCombatSkill(skill);
const initial=()=>{
 const st=newCombatState(fighter("Ariana Lailas",5,0),fighter("Rival",null,1.5,{
   speedValue:60,equippedWeapon:{name:"Maza",mode:"MELEE",attackType:"BLUNT",
    effectiveRangeMeters:2,maximumRangeMeters:2}
 }));
 st.mana={PLAYER:{current:60,max:60},NPC:{current:40,max:40}};
 return st;
};
const cast=(s,id="magic-mirror-12345",at={x:.35,y:.4})=>applyResolvedCombatSkill(s,"PLAYER",plan,{
 requestId:id,areaCenter:at,constructionForm:"FIELD",
},dice);
test("approved mirror is a construct, not an unsupported effect, and respects actual database config",()=>{
 assert.equal(previewSkillExecution(skill).executable,true);
 assert.equal(plan.category,"CONSTRUCTION");
 assert.equal(plan.usesMagic,true);
 assert.equal(plan.cost,15);
 assert.equal(plan.rangeMeters,5);
 assert.equal(plan.mirror.rayMultiplier,1);
 assert.equal(plan.mirror.reflectionMultiplier,1);
 assert.equal(plan.mirror.durability,1);
 assert.deepEqual(availableConstructionMaterials(projectApprovedCombatSkills([skill],[],new Set(),()=>true)),["MIRROR"]);
});
test("mirror skill rejects incomplete, duplicated, non-piercing or unrelated effect combinations",()=>{
 for(const effects of [skill.effect.slice(0,2),[...skill.effect,skill.effect[1]],
   [{...skill.effect[0],value:2},...skill.effect.slice(1)],
   [...skill.effect,{type:"RESOURCE_BONUS",value:5,target:"HP"}]]) {
  assert.throws(()=>compileCombatSkill({...skill,effect:effects}),/espejo|Espejo|invocación/);
 }
 assert.throws(()=>compileCombatSkill({...skill,attackType:"CUT"}),/perforación/);
});
test("casting creates mirror at chosen position and launches piercing magical ray with 1 action and 15 mana",()=>{
 const s=cast(initial());
 assert.equal(s.constructions.length,1);
 const mirror=s.constructions[0];
 assert.equal(mirror.form,"MIRROR");
 assert.deepEqual(mirror.center,{x:.35,y:.4});
 assert.equal(mirror.durability,1);
 assert.equal(mirror.mirror.rayMultiplier,1);
 assert.equal(mirror.mirror.reflectionMultiplier,1);
 assert.equal(s.pending.usesMagic,true);
 assert.equal(s.pending.attackType,"PIERCE");
 assert.equal(s.pending.mirrorId,mirror.id);
 assert.equal(s.pending.mirrorAuto,undefined);
 assert.equal(s.pending.skill.damageMultiplier,1);
 assert.equal(s.actors.PLAYER.spentAp,1);
 assert.equal(s.mana.PLAYER.current,45);
 assert.equal(s.processedSkillRequests.length,1);
 const clone=JSON.parse(JSON.stringify(s));
 assert.deepEqual(applyResolvedCombatSkill(clone,"PLAYER",plan,{
  requestId:"magic-mirror-12345",areaCenter:{x:.35,y:.4}
 },dice),clone,"retry must not charge again");
 const defended=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(defended.actors.NPC.hp<100);
 assert.equal(defended.constructions.length,1,"mirror survives initial ray");
});
test("surviving mirror fires next round without spending another PA or mana",()=>{
 let s=cast(initial());
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 s.actors.PLAYER.spentTicks=100;
 s.actors.NPC.spentTicks=80;
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"},dice);
 assert.equal(s.round,2);
 assert.ok(s.pending,"round must launch autonomous ray");
 assert.equal(s.pending.mirrorAuto,true);
 assert.equal(s.pending.mirrorId,s.constructions[0].id);
 assert.equal(s.pending.skill.damageMultiplier,1);
 assert.equal(s.actors.PLAYER.spentAp,0);
 assert.equal(s.mana.PLAYER.current,45);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.equal(s.pending,null,"single mirror fires once per round");
 assert.equal(s.actors.PLAYER.spentAp,0);
 assert.equal(s.mana.PLAYER.current,45);
});
test("physical attack aimed at enemy mirror breaks it, leaving fighter uninjured",()=>{
 let s=cast(initial());
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 s.actors.PLAYER.spentTicks=100;
 const mirror=s.constructions[0];
 const before=s.actors.PLAYER.hp;
 s=applyCombatCommand(s,"NPC",{kind:"ATTACK",attackType:"BLUNT",attackSource:"MAIN_HAND",
  targetConstructionId:mirror.id,trajectory:[{x:.1,y:.2},{...mirror.center}]},dice);
 assert.equal(s.constructions.length,0);
 assert.equal(s.actors.PLAYER.hp,before);
 assert.equal(s.pending,null);
 assert.ok(s.log.some(e=>e.kind==="CONSTRUCTION"&&e.summary.includes("destruyó")));
});
test("magic aimed at mirror returns configured reflection to attacker without destroying it",()=>{
 let s=cast(initial());
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 s.actors.PLAYER.spentTicks=100;
 const mirror=s.constructions[0];
 const hp=s.actors.NPC.hp;
 s=applyCombatCommand(s,"NPC",{kind:"ATTACK",usesMagic:true,attackType:"PIERCE",
  targetConstructionId:mirror.id,areaCenter:{...mirror.center}},dice);
 assert.equal(s.constructions.length,1);
 assert.ok(s.actors.NPC.hp<hp);
 assert.ok(s.log.some(e=>e.kind==="REFLECTION"));
 assert.equal(s.pending,null);
});
test("a magical area intersecting an enemy mirror reflects even if the caster targeted the player",()=>{
 let s=cast(initial());
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 s.actors.PLAYER.spentTicks=100;
 const mirror=s.constructions[0],oldNpcHp=s.actors.NPC.hp;
 s=applyCombatCommand(s,"NPC",{kind:"ATTACK",usesMagic:true,attackType:"PIERCE",
  areaCenter:{...mirror.center}},dice);
 assert.equal(s.pending.against,"PLAYER");
 s=applyCombatCommand(s,"PLAYER",{kind:"DEFEND",defense:"NONE"},dice);
 assert.ok(s.actors.NPC.hp<oldNpcHp);
 assert.ok(s.log.some(e=>e.kind==="REFLECTION"&&e.constructionId===mirror.id));
});
test("targeted objects must be living enemy mirrors and their hitbox actually reached",()=>{
 const s=cast(initial()),id=s.constructions[0].id;
 const after=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 after.actors.PLAYER.spentTicks=100;
 assert.throws(()=>applyCombatCommand(after,"NPC",{kind:"ATTACK",attackType:"BLUNT",
  attackSource:"MAIN_HAND",targetConstructionId:"fake",
  trajectory:[{x:0,y:0},{x:1,y:1}]},dice),/espejo elegido/);
 assert.throws(()=>applyCombatCommand(after,"PLAYER",{kind:"ATTACK",attackType:"PIERCE",
  usesMagic:true,targetConstructionId:id,areaCenter:{x:.35,y:.4}},dice),/El espejo elegido|iniciativa/);
 const miss=applyCombatCommand(after,"NPC",{kind:"ATTACK",attackType:"BLUNT",
  attackSource:"MAIN_HAND",targetConstructionId:id,
  trajectory:[{x:0,y:0},{x:0.95,y:0.94}]},dice);
 assert.ok(miss.constructions.some(c=>c.id===id),"a miss cannot destroy a mirror");
});
test("mirror user interface renders distinct mirror symbol and physical-target selector",()=>{
 const src=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
 assert.match(src,/targetConstructionId:selectedAttackTargetId/);
 assert.match(src,/c\.form==="MIRROR"/);
 assert.match(src,/enemyMirrors\.map/);
 assert.match(src,/Los objetos decorativos no bloquean ataques/);
});
