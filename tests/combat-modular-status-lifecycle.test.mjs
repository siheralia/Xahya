import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newCombatState,applyCombatCommand,applyResolvedCombatSkill} from "../lib/combat/turn-engine.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {defaultWeaponAutoRepair} from "../lib/items/auto-repair.ts";
import {applySummonStatus} from "../lib/combat/summon-status.ts";
import {activeCombatStatusViews} from "../lib/combat/active-status-summary.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";

const fighter=(name,id,pos,extra={})=>({
 characterId:id,name,hp:60,maxHp:100,agility:70,speedValue:85,
 strength:20,constitution:12,precision:90,dodge:15,
 physicalAttack:40,physicalDefense:10,magicAttack:35,magicDefense:12,
 critical:0,luck:10,race:20,massKg:70,positionMeters:pos,
 weaponIntegrity:100,attackType:"CUT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,...extra,
});
const sword=(durability=70)=>({
 name:"Espada que se repara",attackType:"CUT",mode:"MELEE",
 effectiveRangeMeters:1.5,maximumRangeMeters:1.5,
 itemId:621,characterItemId:1621,durability,
 autoRepair:defaultWeaponAutoRepair(),
});
const duel=(mana=10,weapon=sword())=>{
 const s=newCombatState(
  fighter("Maga",1001,0,{equippedWeapon:weapon}),
  fighter("Rival",1002,3)
 );
 s.mana={PLAYER:{current:mana,max:20},NPC:{current:12,max:20}};
 return s;
};
const support=(id,cost=5,effect=[{type:"RESOURCE_BONUS",target:"HP",value:12}],duration="Instantánea")=>
 compileCombatSkill({
  id,name:"Amparo "+id,status:"APPROVED",category:"SUPPORT",cost,
  cooldown:"Sin cooldown",duration,mechanics:{},effect,
 });
const dice={hit:.01,critical:.99,defense:.99};
const cast=(s,plan,key)=>applyResolvedCombatSkill(s,"PLAYER",plan,{requestId:key},dice);

test("approved support skill pays first: automatic round repair cannot spend the casting mana",()=>{
 const s=duel(5);
 s.actors.PLAYER.spentTicks=99;
 s.actors.NPC.spentTicks=100;
 const saved=structuredClone(s);
 const result=cast(s,support(9081,5),"prepaid-support-9081");
 assert.equal(result.round,2,"the skill ends the current round");
 assert.equal(result.mana.PLAYER.current,0,"casting consumes the full 5 mana before auto-repair");
 assert.equal(result.actors.PLAYER.equippedWeapon.durability,70,
  "repair requiring 5 mana cannot run after an earlier skill spent it");
 assert.equal(result.log.filter(e=>e.kind==="WEAPON_REPAIR").length,0);
 assert.equal(result.actors.PLAYER.hp,72);
 assert.deepEqual(s,saved,"combat engine must preserve original input");
 const persisted=JSON.parse(JSON.stringify(result));
 assert.deepEqual(cast(persisted,support(9081,5),"prepaid-support-9081"),persisted,
  "retry after serialized reload cannot repeat the heal or payment");
});

test("when mana covers both, casting and exactly one scheduled repair each debit once",()=>{
 const s=duel(10);
 s.actors.PLAYER.spentTicks=99;
 s.actors.NPC.spentTicks=100;
 const result=cast(s,support(9082,5),"prepaid-support-9082");
 assert.equal(result.round,2);
 assert.equal(result.mana.PLAYER.current,0);
 assert.equal(result.actors.PLAYER.equippedWeapon.durability,75);
 assert.equal(result.log.filter(e=>e.kind==="WEAPON_REPAIR").length,1);
 assert.deepEqual(result.itemRepairsThisRound?.map(x=>x.characterItemId),[1621]);
});

test("approved skill buff has persistent source name and player-facing expiry",()=>{
 const s=duel(20,undefined);
 const plan=support(9083,4,[{type:"STAT_BONUS",target:"MAGIC_DEFENSE",value:10}],"1 turno");
 let result=cast(s,plan,"approved-buff-9083");
 assert.equal(result.actors.PLAYER.magicDefense,22);
 assert.equal(result.skillBonuses[0].skillName,"Amparo 9083");
 let visible=activeCombatStatusViews(result,"PLAYER");
 assert.equal(visible.length,1);
 assert.equal(visible[0].source,"Amparo 9083");
 assert.equal(visible[0].description,"Defensa mágica +10");
 assert.equal(visible[0].expiresAtRound,2);
 assert.equal(visible[0].remainingRounds,1);
 assert.equal(activeCombatStatusViews(result,"NPC").length,0);
 const client=combatClientView(result);
 assert.equal(activeCombatStatusViews(client,"PLAYER")[0].source,"Amparo 9083");
 result=JSON.parse(JSON.stringify(result));
 result=applyCombatCommand(result,"NPC",{kind:"WAIT"},dice);
 result=applyCombatCommand(result,"PLAYER",{kind:"WAIT"},dice);
 assert.equal(result.round,2);
 assert.equal(result.actors.PLAYER.magicDefense,12);
 assert.deepEqual(activeCombatStatusViews(result,"PLAYER"),[],
  "expired status must disappear from the UI projection on exact round change");
});

test("creature-created buff and debuff can be read without exposing internal identifiers",()=>{
 const s=duel(10,undefined);
 applySummonStatus(s,{
  id:"some-secret-status-01",sourceSummonId:"not-a-visible-summon",by:"PLAYER",target:"NPC",
  stat:"MAGIC_DEFENSE",operation:"MULTIPLIER",value:.75,durationTurns:2,
 });
 applySummonStatus(s,{
  id:"some-secret-status-02",sourceSummonId:"SKILL:83",by:"NPC",target:"PLAYER",
  stat:"PHYSICAL_ATTACK",operation:"BONUS",value:8,durationTurns:1,
 });
 const player=activeCombatStatusViews(s,"PLAYER");
 const npc=activeCombatStatusViews(s,"NPC");
 assert.equal(player.length,1);
 assert.equal(player[0].source,"Habilidad aprobada");
 assert.equal(player[0].description,"Ataque físico +8");
 assert.equal(npc[0].description,"Defensa mágica ×0.75");
 assert.equal(npc[0].tone,"DEBUFF");
 assert.equal(npc[0].expiresAtRound,3);
 assert.equal(npc[0].remainingRounds,2);
 assert.ok(!npc[0].source.includes("some-secret"),"raw internal IDs must not leak in labels");
 assert.deepEqual(activeCombatStatusViews(JSON.parse(JSON.stringify(s)),"NPC"),npc);
});

test("historical skills without optional name continue to render and filter expired entries",()=>{
 const s=duel(10,undefined);
 s.skillBonuses=[{by:"PLAYER",skillId:50,stat:"dodge",value:4,expiresAtRound:3},
  {by:"NPC",skillId:51,stat:"precision",value:6,expiresAtRound:3},
  {by:"PLAYER",skillId:52,stat:"luck",value:4,expiresAtRound:1}];
 const result=activeCombatStatusViews(s,"PLAYER");
 assert.equal(result.length,1);
 assert.equal(result[0].source,"Habilidad #50");
 assert.equal(result[0].description,"Esquive +4");
 assert.equal(result[0].remainingRounds,2);
 assert.equal(result[0].tone,"BUFF");
});

test("UI gives players access to current statuses without pretending narrative effects run",()=>{
 const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
 const page=read("app/combat/[id]/CombatEncounter.tsx");
 const detail=read("app/combat/[id]/CombatActiveStatusPanel.tsx");
 const hud=read("app/combat/[id]/CombatCharacterHud.tsx");
 const compiler=read("lib/combat/skill-casting.ts");
 const engine=read("lib/combat/turn-engine.ts");
 assert.match(page,/activeCombatStatusViews\(state,side\)/);
 assert.match(page,/Efectos temporales activos/);
 assert.match(detail,/Caduca al comenzar la ronda/);
 assert.match(page,/CombatActiveStatusPanel/);
 assert.match(page,/openPanel\("stats"\)/);
 assert.match(hud,/activeStatusCount>0&&<button/);
 assert.match(hud,/estados temporales activos/);
 assert.match(compiler,/Solo puedes utilizar habilidades aprobadas/);
 assert.match(engine,/const prepaid=\["OFFENSE","SUPPORT","CONSTRUCTION"\]/);
 assert.doesNotMatch(engine,/if\(plan.category!=="SUMMON"&&plan.category!=="CHARGE_BUFF"&&plan.category!=="FUSION"\)next\.mana!/);
});
