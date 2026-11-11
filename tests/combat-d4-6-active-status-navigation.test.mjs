import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {activeCombatStatusViews} from "../lib/combat/active-status-summary.ts";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const fighter=(name,id,pos)=>({
 characterId:id,name,hp:50,maxHp:100,agility:75,speedValue:80,
 strength:18,constitution:12,precision:90,dodge:12,
 physicalAttack:40,physicalDefense:10,magicAttack:30,magicDefense:12,
 critical:0,luck:5,race:10,massKg:70,positionMeters:pos,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,
});

test("D4.6: only meaningful active effects of each fighter are shown",()=>{
 const state=newCombatState(fighter("Heroína",1,0),fighter("Enemiga",2,3));
 state.round=2;
 state.skillBonuses=[
  {by:"PLAYER",skillId:11,skillName:"Protección",stat:"magicDefense",value:5,expiresAtRound:4},
  {by:"PLAYER",skillId:12,skillName:"Ya vencida",stat:"magicDefense",value:5,expiresAtRound:2},
  {by:"NPC",skillId:13,skillName:"Concentración",stat:"precision",value:3,expiresAtRound:3},
 ];
 state.summonStatuses=[
  {id:"debuff-active",sourceSummonId:"SKILL:50",by:"NPC",target:"PLAYER",
   stat:"MAGIC_DEFENSE",operation:"MULTIPLIER",value:0.8,expiresAtRound:3},
  {id:"enemy-buff",sourceSummonId:"SKILL:51",by:"NPC",target:"NPC",
   stat:"PHYSICAL_ATTACK",operation:"MULTIPLIER",value:1.2,expiresAtRound:4},
  {id:"neutral",sourceSummonId:"SKILL:52",by:"NPC",target:"PLAYER",
   stat:"PHYSICAL_ATTACK",operation:"MULTIPLIER",value:1,expiresAtRound:5},
  {id:"zero",sourceSummonId:"SKILL:53",by:"PLAYER",target:"PLAYER",
   stat:"precision",operation:"BONUS",value:0,expiresAtRound:5},
  {id:"expired",sourceSummonId:"SKILL:54",by:"PLAYER",target:"NPC",
   stat:"precision",operation:"BONUS",value:-8,expiresAtRound:2},
 ];
 const before=structuredClone(state);
 const player=activeCombatStatusViews(state,"PLAYER");
 const opponent=activeCombatStatusViews(state,"NPC");
 assert.equal(player.length,2);
 assert.equal(opponent.length,2);
 assert.equal(player.filter(x=>x.tone==="DEBUFF").length,1);
 assert.equal(opponent.filter(x=>x.tone==="BUFF").length,2);
 assert.equal(player[0].remainingRounds,1);
 assert.equal(player[1].expiresAtRound,4);
 assert.equal(opponent.every(x=>x.remainingRounds>0),true);
 assert.deepEqual(state,before,"projection must not mutate combat or consume resources");
 const hydrated=JSON.parse(JSON.stringify(state));
 assert.deepEqual(activeCombatStatusViews(hydrated,"NPC"),opponent);
 hydrated.round=4;
 assert.deepEqual(activeCombatStatusViews(hydrated,"PLAYER"),[]);
 assert.deepEqual(activeCombatStatusViews(hydrated,"NPC"),[]);
});

test("D4.6: statuses are inside the Stats dialog, not Karma, and both sides are accessible",()=>{
 const page=read("app/combat/[id]/CombatEncounter.tsx");
 const hud=read("app/combat/[id]/CombatCharacterHud.tsx");
 const panel=read("app/combat/[id]/CombatActiveStatusPanel.tsx");
 const statsStart=page.indexOf('<CombatDialog open={panel==="stats"}');
 const inventoryStart=page.indexOf('<CombatDialog open={panel==="inventory"}',statsStart);
 const statusPanel=page.indexOf('<CombatActiveStatusPanel',statsStart);
 const karmaStart=page.indexOf('<CombatDialog open={panel==="karma"}');
 assert.ok(karmaStart>=0&&statsStart>karmaStart);
 assert.ok(statusPanel>statsStart&&statusPanel<inventoryStart,
  "complete status detail must be inside Stats and not Karma");
 assert.equal(page.slice(karmaStart,statsStart).includes("<CombatActiveStatusPanel"),false);
 assert.match(page,/const opposingStatusViews=state\?activeCombatStatusViews\(state,opposingSide\):\[\]/);
 assert.match(page,/onClick=\{\(\)=>openPanel\("stats"\)\}/);
 assert.match(page,/Perjuicios propios:/);
 assert.match(page,/Ventajas rivales:/);
 assert.doesNotMatch(page,/state\.summonStatuses\?\.map\(status=>/,
  "the summon section may not display expired statuses as active");
 assert.match(hud,/activeStatusCount>0&&<button/);
 assert.match(panel,/Origen: \{status\.source\}/);
 assert.match(panel,/Caduca al comenzar la ronda/);
 assert.match(panel,/ownName=|ownName/);
 assert.match(panel,/opponentName/);
 assert.match(panel,/Perjudicial/);
 assert.match(panel,/Beneficioso/);
 assert.match(panel,/min-w-0/);
 assert.match(panel,/sm:grid-cols-2/);
 assert.match(page,/min-h-11 w-full min-w-0 flex-wrap/,
  "active-status navigation stays tappable and wraps at 320/390px");
});
