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
 assert.match(first,/Elena se enfrentó a Sombra/);
 assert.match(first,/avanzó para acortar la distancia/);
 assert.match(first,/abrió el combate con un corte con Katana/);
 assert.match(first,/catorce puntos de daño/);
 assert.match(first,/impacto crítico/);
 assert.match(first,/Curación/);
 assert.match(first,/arrojó Daga/);
 assert.match(first,/Sombra logró esquivar el ataque/);
 assert.match(first,/se alzó con la victoria/);
 assert.doesNotMatch(first,/esperando reacción/);
});
test("newly completed encounters retain a full narration even after the 100-event screen log rolls over",()=>{
 const player=basicActor("Elena",0),opponent=basicActor("Sombra",1);
 opponent.hp=1;opponent.physicalDefense=0;opponent.speedValue=60;
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
 assert.match(state.narrativeText,/Elena obtuvo la victoria/);
 assert.equal(state.narrativeHistory.length,148,"the full history is kept server-side for future reinterpretations");
 assert.equal(state.narrativeVersion,3);
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

test("Ariana battle tells a connected three-paragraph story, not a list of logs",()=>{
 const actors={
  PLAYER:{name:"Ariana Lailas",hp:3,maxHp:12},
  NPC:{name:"Oponente de entrenamiento",hp:0,maxHp:30}
 };
 const events=[
  {kind:"ATTACK",tick:7,by:"NPC",against:"PLAYER",summary:"Oponente lanzó un corte",attackType:"CUT"},
  {kind:"RESOLVE",tick:12,by:"NPC",against:"PLAYER",summary:"Oponente impactó a Ariana (4 HP)",damage:4,contact:true,defense:"DEFLECT",knockbackMeters:0.86},
  {kind:"MOVE",tick:35,by:"PLAYER",summary:"Ariana se desplazó 0.5 m (TOWARD)",movementDirection:"TOWARD",moveMeters:0.5},
  {kind:"ATTACK",tick:43,by:"NPC",against:"PLAYER",summary:"Oponente lanzó magia de perforación",attackType:"PIERCE",usesMagic:true},
  {kind:"RESOLVE",tick:48,by:"NPC",against:"PLAYER",summary:"Oponente impactó a Ariana (4 HP)",damage:4,contact:true,defense:"NONE"},
  {kind:"ATTACK",tick:76,by:"NPC",against:"PLAYER",summary:"Oponente lanzó un corte",attackType:"CUT"},
  {kind:"RESOLVE",tick:80,by:"NPC",against:"PLAYER",summary:"Oponente impactó a Ariana (1 HP)",damage:1,contact:true,defense:"NONE"},
  {kind:"ROUND",tick:100,by:"PLAYER",summary:"Comienza el turno 2"},
  {kind:"ATTACK",tick:112,by:"PLAYER",against:"NPC",summary:"Ariana lanzó magia de perforación",attackType:"PIERCE",usesMagic:true},
  {kind:"RESOLVE",tick:139,by:"PLAYER",against:"NPC",summary:"Ariana acertó con su explosión mágica (10 HP)",damage:10,contact:true,defense:"MAGIC_FIELD"},
  {kind:"MOVE",tick:178,by:"NPC",summary:"Oponente se desplazó 0.71999999999999998 m (TOWARD)",movementDirection:"TOWARD",moveMeters:0.72},
  {kind:"ATTACK",tick:178,by:"PLAYER",against:"NPC",summary:"Ariana lanzó un ataque de perforación",attackType:"PIERCE"},
  {kind:"RESOLVE",tick:178,by:"PLAYER",against:"NPC",summary:"Oponente evitó el ataque",damage:0,contact:false,defense:"DEFLECT"},
  {kind:"ATTACK",tick:200,by:"PLAYER",against:"NPC",summary:"Ariana lanzó un ataque de perforación",attackType:"PIERCE"},
  {kind:"RESOLVE",tick:200,by:"PLAYER",against:"NPC",summary:"Ariana impactó a oponente (63 HP)",damage:63,contact:true,defense:"NONE"},
  {kind:"END",tick:200,by:"PLAYER",against:"NPC",summary:"Ariana Lailas gana el combate"},
 ];
 const story=narrateCombat(events,actors);
 assert.equal(story.split("\n\n").length,3,story);
 assert.match(story,/Ariana Lailas se enfrentó a un oponente de entrenamiento/);
 assert.match(story,/El rival abrió el combate con un corte/);
 assert.match(story,/pese al intento de desvío/);
 assert.match(story,/obligó a Ariana a retroceder/);
 assert.match(story,/Ariana avanzó para recuperar terreno/);
 assert.match(story,/explosión mágica perforante/);
 assert.match(story,/Un segundo corte del rival/);
 assert.match(story,/Al comenzar el segundo turno, Ariana respondió/);
 assert.match(story,/Ni siquiera el campo defensivo del rival/);
 assert.match(story,/logró desviar el ataque/);
 assert.match(story,/su siguiente ataque encontró una abertura/);
 assert.match(story,/63 puntos de daño que terminó el combate/);
 assert.match(story,/Ariana Lailas obtuvo la victoria, aunque terminó con apenas tres de sus doce puntos de vida/);
 assert.doesNotMatch(story,/Tick 200|esperando reacción|0\.7199999999/);
 assert.doesNotMatch(story,/Crónica del encuentro:/);
});

test("pre-versioned concluded fights are regenerated from surviving facts, not frozen in the old style",()=>{
 const state=newCombatState(basicActor("Elena",0),basicActor("Sombra",1));
 state.status="FINISHED";
 state.winner="PLAYER";
 state.log=[
   {kind:"ATTACK",tick:10,by:"PLAYER",against:"NPC",attackType:"PIERCE",summary:"Elena lanzó un ataque de perforación"},
   {kind:"RESOLVE",tick:12,by:"PLAYER",against:"NPC",contact:true,damage:63,defense:"NONE",summary:"Elena impactó a Sombra (63 HP)"},
   {kind:"END",tick:12,by:"PLAYER",against:"NPC",summary:"Elena gana el combate"},
 ];
 state.narrativeText="Crónica del encuentro: Elena contra Sombra.\n\nElena lanzó una estocada.";
 const publicState=combatClientView(state);
 assert.equal(publicState.narrativeVersion,3);
 assert.match(publicState.narrativeText,/Elena se enfrentó a Sombra/);
 assert.match(publicState.narrativeText,/63 puntos de daño/);
 assert.doesNotMatch(publicState.narrativeText,/Crónica del encuentro:/);
 assert.equal(state.narrativeText.startsWith("Crónica del encuentro:"),true,"server projection must not mutate persistence");
});
