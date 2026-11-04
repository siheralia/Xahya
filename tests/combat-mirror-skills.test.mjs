import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {projectApprovedCombatSkills,availableConstructionMaterials} from "../lib/combat/skill-preview.ts";
import {newCombatState,applyCombatCommand,applyResolvedCombatSkill} from "../lib/combat/turn-engine.ts";
import {progressTrainingNpc} from "../lib/combat/npc-policy.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";
import {narrateCombat,COMBAT_NARRATIVE_VERSION} from "../lib/combat/narration.ts";
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
  usesMagic:true,targetConstructionId:id,areaCenter:{x:.35,y:.4}},dice),/El espejo elegido|iniciativa|otro participante/);
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

test("two mirrors stay active and each fires exactly once next round without additional PA or mana",()=>{
 let s=cast(initial());
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 s.actors.PLAYER.spentTicks=100;
 s.actors.NPC.spentTicks=80;
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"},dice);
 assert.equal(s.round,2);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 s=cast(s,"magic-mirror-second-12345",{x:.63,y:.34});
 assert.equal(s.constructions.length,2);
 assert.equal(s.mana.PLAYER.current,30);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 s.actors.PLAYER.spentTicks=100;
 s.actors.NPC.spentTicks=80;
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"},dice);
 assert.equal(s.round,3);
 const ids=s.constructions.map(c=>c.id);
 assert.equal(s.pending.mirrorId,ids[0]);
 assert.equal(s.pending.mirrorAuto,true);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.equal(s.pending.mirrorId,ids[1]);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.equal(s.pending,null);
 assert.equal(s.actors.PLAYER.spentAp,0);
 assert.equal(s.mana.PLAYER.current,30);
 assert.equal(s.constructions.length,2);
});
test("NPC deliberately breaks a mirror with a physical attack when within reach",()=>{
 let s=cast(initial());
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 s.actors.PLAYER.spentTicks=100;
 const result=progressTrainingNpc(s,()=>dice,()=>0.30);
 assert.ok(result.log.some(e=>e.kind==="CONSTRUCTION"&&e.summary.includes("destruyó")));
 assert.ok(result.constructions.every(c=>c.form!=="MIRROR"));
});

test("first mirror ray starts at mirror's chosen position and aims at opponent, not at the placement itself",()=>{
 const s=cast(initial(),"mirror-placement-12345",{x:0.92,y:0.13});
 const mirror=s.constructions[0];
 assert.equal(mirror.positionMeters,1.5);
 assert.deepEqual(s.pending.trajectory,[{x:0.92,y:0.13},{x:0.5,y:0.5}]);
 assert.deepEqual(s.pending.targetCenter,{x:0.5,y:0.5});
 assert.equal(s.pending.mirrorId,mirror.id);
 assert.equal(s.log.at(-1).mirrorShot,true);
 const visible=combatClientView(s);
 assert.equal(visible.pending.targetCenter,undefined);
 assert.deepEqual(visible.pending.trajectory,[],"exact ray endpoint must not leak through public view");
 assert.ok(visible.pending.areaHint);
});

test("surviving mirror range is measured from its fixed world origin, not the moving caster",()=>{
 const start=cast(initial());
 const mirror=start.constructions[0];
 assert.equal(mirror.positionMeters,1.5);
 let s=applyCombatCommand(start,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 s.actors.PLAYER.spentTicks=100;
 s.actors.NPC.spentTicks=80;
 // The caster is adjacent to the target, but the fixed mirror is 5.5 m away.
 s.actors.PLAYER.positionMeters=6.7;
 s.actors.NPC.positionMeters=7;
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"},dice);
 assert.equal(s.round,2);
 assert.equal(s.pending,null,"no ray should launch from the caster's new position");
 assert.match(s.log.at(-1).summary,/5.5 m desde el espejo/);
 assert.ok(s.constructions.some(c=>c.id===mirror.id),"out-of-range ray does not break the mirror");
});

test("mirror still fires when caster moves far away while target remains in mirror range",()=>{
 let s=cast(initial());
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 s.actors.PLAYER.spentTicks=100;
 s.actors.NPC.spentTicks=80;
 s.actors.PLAYER.positionMeters=50;
 s.actors.NPC.positionMeters=2.1;
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"},dice);
 assert.equal(s.round,2);
 assert.equal(s.pending?.mirrorAuto,true);
 assert.deepEqual(s.pending.trajectory,[{x:.35,y:.4},{x:.5,y:.5}]);
 assert.deepEqual(s.pending.targetCenter,{x:.5,y:.5});
});

test("mirror resolution and its historical chronicle say ray, never generic explosion",()=>{
 let s=cast(initial());
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 const impact=s.log.at(-1);
 assert.equal(impact.kind,"RESOLVE");
 assert.equal(impact.mirrorShot,true);
 assert.equal(impact.constructionId,s.constructions[0].id);
 assert.match(impact.summary,/rayo de Espejo mágico impactó/);
 assert.doesNotMatch(impact.summary,/explosión/i);
 const narrative=narrateCombat(s.narrativeHistory,s.actors);
 assert.match(narrative,/rayo mágico perforante desde el espejo/);
 assert.doesNotMatch(narrative,/explosión mágica/i);
 assert.ok(COMBAT_NARRATIVE_VERSION>=3);
 const oldEvents=[
  {kind:"ATTACK",tick:33,by:"PLAYER",against:"NPC",usesMagic:true,attackType:"PIERCE",
   skillName:"Espejo mágico",summary:"Ariana invocó Espejo mágico y lanzó un rayo mágico de perforación."},
  {kind:"RESOLVE",tick:33,by:"PLAYER",against:"NPC",damage:20,contact:true,critical:false,
   summary:"Ariana acertó con su explosión mágica a Rival (20 HP)"}
 ];
 const oldNarrative=narrateCombat(oldEvents,s.actors);
 assert.match(oldNarrative,/rayo mágico perforante desde el espejo/);
 assert.doesNotMatch(oldNarrative,/explosión mágica/);
});

test("multiple mirror rays still allow separate defenses on the same round",()=>{
 let s=cast(initial());
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 s=cast(s,"mirror-second-ray-12345",{x:.7,y:.6});
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 s.actors.PLAYER.spentTicks=100;
 s.actors.NPC.spentTicks=80;
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"},dice);
 assert.equal(s.round,2);
 assert.equal(s.pending?.mirrorAuto,true);
 const firstId=s.pending.mirrorId;
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.equal(s.pending?.mirrorAuto,true);
 assert.notEqual(s.pending?.mirrorId,firstId);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.equal(s.pending,null);
 assert.equal(s.log.filter(e=>e.kind==="RESOLVE"&&e.mirrorShot).length,4);
});
