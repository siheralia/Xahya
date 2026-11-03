import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {narrateCombat} from "../lib/combat/narration.ts";
import {applyCombatCommand,newCombatState} from "../lib/combat/turn-engine.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";

const fighters={PLAYER:{name:"Elena"},NPC:{name:"Sombra"}};
const basicActor=(name,positionMeters)=>({
 characterId:null,name,hp:100,maxHp:100,
 agility:80,speedValue:80,strength:100,constitution:10,
 precision:70,dodge:5,physicalAttack:200,physicalDefense:1,magicAttack:5,magicDefense:5,
 critical:0,luck:5,race:20,massKg:70,positionMeters,
 weaponIntegrity:100,attackType:"CUT",defenseType:"SOLID",spentTicks:0,spentAp:0,
 equippedWeapon:{name:"Katana",attackType:"CUT",mode:"MELEE",effectiveRangeMeters:1.5,maximumRangeMeters:2}
});

test("the chronicle turns logged actions into coherent predefined phrases",()=>{
 const events=[
  {kind:"MOVE",tick:5,by:"PLAYER",against:"NPC",summary:"Elena se desplazó 1 m",movementDirection:"TOWARD",moveMeters:1},
  {kind:"ATTACK",tick:10,by:"PLAYER",against:"NPC",summary:"Elena atacó; esperando reacción",attackType:"CUT",weaponName:"Katana"},
  {kind:"RESOLVE",tick:12,by:"PLAYER",against:"NPC",summary:"Elena impactó a Sombra",damage:14,contact:true,critical:true,defense:"BLOCK",knockbackMeters:0.5},
  {kind:"SKILL",tick:20,by:"NPC",summary:"Sombra usó Curación",skillName:"Curación",healingPoints:8},
  {kind:"ROUND",tick:100,by:"PLAYER",summary:"Comienza el turno 2"},
  {kind:"ATTACK",tick:105,by:"PLAYER",against:"NPC",summary:"Elena lanzó el arma; esperando reacción",attackType:"PIERCE",thrownWeapon:true,weaponName:"Daga"},
  {kind:"RESOLVE",tick:110,by:"PLAYER",against:"NPC",summary:"Sombra evitó el ataque",contact:false,defense:"DODGE",damage:0},
  {kind:"END",tick:120,by:"PLAYER",against:"NPC",summary:"Elena gana el combate"}
 ];
 const first=narrateCombat(events,fighters),second=narrateCombat(events,fighters);
 assert.equal(first,second,"replays must not be random");
 assert.match(first,/Elena contra Sombra/);
 assert.match(first,/avanzó 1 m/);
 assert.match(first,/trazó un corte con Katana/);
 assert.match(first,/14 puntos de daño/);
 assert.match(first,/impacto crítico/);
 assert.match(first,/Curación/);
 assert.match(first,/arrojó Daga/);
 assert.match(first,/Sombra esquivó/);
 assert.match(first,/se alzó con la victoria/);
 assert.doesNotMatch(first,/esperando reacción/);
});
test("newly completed encounters retain a full narration even after the 100-event screen log rolls over",()=>{
 const player=basicActor("Elena",0),opponent=basicActor("Sombra",1);
 opponent.hp=1;opponent.physicalDefense=0;
 let state=newCombatState(player,opponent);
 const history=Array.from({length:145},(_,i)=>({
  kind:"MOVE",tick:i,by:"PLAYER",summary:i===0?"Paso inicial memorable":"Recorrido "+i
 }));
 state.narrativeHistory=history;
 state.log=history.slice(-100);
 state=applyCombatCommand(state,"PLAYER",{kind:"ATTACK",attackType:"CUT",trajectory:[{x:0.1,y:0.5},{x:0.9,y:0.5}]});
 state=applyCombatCommand(state,"NPC",{kind:"DEFEND",defense:"NONE"},{hit:0.1,critical:0.99,defense:0.99});
 assert.equal(state.status,"FINISHED");
 assert.ok(state.log.length<=100);
 assert.match(state.narrativeText,/Paso inicial memorable/);
 assert.match(state.narrativeText,/Elena se alzó con la victoria/);
 assert.equal(state.narrativeHistory,undefined,"the finished state stores the finalized text, not duplicate history");
 const publicState=combatClientView(state);
 assert.equal(publicState.narrativeText,state.narrativeText);
 assert.equal(publicState.narrativeHistory,undefined);
});
test("the active combat projection never exposes the unabridged private chronicle",()=>{
 const state=newCombatState(basicActor("Elena",0),basicActor("Sombra",1));
 state.narrativeHistory=[{kind:"MOVE",tick:1,by:"PLAYER",summary:"Acción privada anterior"}];
 const projected=combatClientView(state);
 assert.equal(projected.narrativeHistory,undefined);
 assert.equal(state.narrativeHistory.length,1);
});
test("the interface stops polling after FINISHED and offers manual refresh and copy",()=>{
 const src=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
 assert.match(src,/if\(encounterFinished\)return/);
 assert.match(src,/\[load,encounterFinished\]/);
 assert.match(src,/window\.clearInterval\(handle\)/);
 assert.match(src,/Copiar narración/);
 assert.match(src,/navigator\.clipboard\.writeText\(chronicle\)/);
 assert.match(src,/Actualizar resultado/);
});
