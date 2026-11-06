import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 isCombatActionReplay,isReplayableCombatKind,recordCombatAction,
} from "../lib/combat/action-idempotency.ts";
import {applyCombatCommand,newCombatState} from "../lib/combat/turn-engine.ts";
import {progressTrainingNpc} from "../lib/combat/npc-policy.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";

const fighter=(name,pos=0)=>({
 characterId:null,name,hp:100,maxHp:100,speedValue:38,agility:38,
 strength:10,constitution:10,precision:50,dodge:20,
 physicalAttack:25,physicalDefense:5,magicAttack:20,magicDefense:5,
 critical:10,luck:10,race:20,massKg:70,positionMeters:pos,weaponIntegrity:100,
 attackType:"CUT",defenseType:"SOLID",spentTicks:0,spentAp:0,
 equippedWeapon:{name:"Espada",attackType:"CUT",mode:"MELEE",
  effectiveRangeMeters:2.2,maximumRangeMeters:2.2},
});
const dice={hit:.01,critical:.99,defense:.99};
const initial=()=>{
 const s=newCombatState(fighter("Jugador"),fighter("Rival",1.5));
 s.mana={PLAYER:{current:10,max:10},NPC:{current:10,max:10}};
 return s;
};
/** Simulate the locked POST path: the same transaction sees the latest state.
 * Duplicate commands are detected before calling the engine or NPC policy.
 */
function post(state,side,command){
 if(isCombatActionReplay(state,side,command))return state;
 const next=command.kind==="ADVANCE"
  ?progressTrainingNpc(state,()=>dice,()=>.7)
  :applyCombatCommand(state,side,command,dice);
 return recordCombatAction(state,next,side,command);
}
const moved={kind:"MOVE",direction:"VECTOR",meters:.5,planarMove:{x:.5,y:0},
 requestId:"move-test-000001"};

test("serialized movement retry never moves twice, spends another PA, or duplicates logs",()=>{
 let s=post(initial(),"PLAYER",moved);
 const saved=JSON.parse(JSON.stringify(s));
 assert.equal(saved.actors.PLAYER.spentAp,1);
 assert.equal(saved.actors.PLAYER.positionMeters,.5);
 assert.equal(saved.log.filter(e=>e.kind==="MOVE").length,1);
 assert.deepEqual(post(saved,"PLAYER",moved),saved,
  "same request after reload must return the exact latest state");
 assert.equal(saved.processedActionRequests.length,1);
 assert.equal(combatClientView(saved).processedActionRequests,undefined,
  "replay fingerprints must remain server-side");
});

test("attack retry does not launch two pending hits or debit mana twice",()=>{
 const s=initial();
 const attack={kind:"ATTACK",attackType:"CUT",usesMagic:true,
  areaCenter:{x:.5,y:.5},requestId:"attack-test-000001"};
 const once=post(s,"PLAYER",attack);
 assert.ok(once.pending);
 assert.equal(once.actors.PLAYER.spentAp,1);
 assert.equal(once.mana.PLAYER.current,9);
 const retry=post(JSON.parse(JSON.stringify(once)),"PLAYER",attack);
 assert.deepEqual(retry,once);
 assert.equal(retry.log.filter(e=>e.kind==="ATTACK").length,1);
});

test("repeated defense resolves one attack only, including after simultaneous counters",()=>{
 let s=initial();
 const attack={kind:"ATTACK",attackType:"CUT",usesMagic:true,
  areaCenter:{x:.5,y:.5},requestId:"attack-before-counter"};
 s=post(s,"PLAYER",attack);
 const counter={kind:"DEFEND",defense:"COUNTER",counterMagic:false,
  requestId:"counter-test-000001"};
 const resolved=post(s,"NPC",counter);
 assert.equal(resolved.pending,null);
 assert.equal(resolved.actors.NPC.spentAp,1);
 assert.equal(resolved.mana.NPC.current,10);
 assert.ok(resolved.actors.PLAYER.hp<100&&resolved.actors.NPC.hp<100);
 assert.equal(resolved.log.filter(e=>e.kind==="RESOLVE"&&e.by==="NPC").length,1);
 assert.deepEqual(post(JSON.parse(JSON.stringify(resolved)),"NPC",counter),resolved);
 assert.equal(resolved.log.filter(e=>e.kind==="RESOLVE").length,2);
});

test("defending without AP still resolves once and never needs a second reaction",()=>{
 let s=post(initial(),"PLAYER",{
  kind:"ATTACK",attackType:"CUT",usesMagic:true,areaCenter:{x:.5,y:.5},
  requestId:"attack-exhausted-001",
 });
 s.actors.NPC.spentTicks=100;
 s.actors.NPC.spentAp=19;
 const defense={kind:"DEFEND",defense:"NONE",requestId:"defense-none-00001"};
 const next=post(s,"NPC",defense);
 assert.equal(next.pending,null);
 assert.deepEqual(post(next,"NPC",defense),next);
});

test("WAIT/ADVANCE idempotence survives serialization and round changes",()=>{
 const wait={kind:"WAIT",requestId:"wait-000000000001"};
 let s=post(initial(),"PLAYER",wait);
 assert.equal(s.log.filter(e=>e.kind==="WAIT").length,1);
 assert.deepEqual(post(JSON.parse(JSON.stringify(s)),"PLAYER",wait),s);
 const advance={kind:"ADVANCE",requestId:"npc-advance-1:1:100:0"};
 const progressed=post(s,"PLAYER",advance);
 assert.ok(progressed.processedActionRequests.some(e=>e.id===advance.requestId));
 assert.deepEqual(post(JSON.parse(JSON.stringify(progressed)),"PLAYER",advance),progressed);
});

test("a retry is accepted even after the encounter is finished",()=>{
 let s=initial();
 s.actors.NPC.hp=1;
 s.actors.NPC.maxHp=1;
 const a={kind:"ATTACK",attackType:"CUT",usesMagic:true,areaCenter:{x:.5,y:.5},
  requestId:"finish-attack-000001"};
 s=post(s,"PLAYER",a);
 const defense={kind:"DEFEND",defense:"NONE",requestId:"finish-defense-0001"};
 const finished=post(s,"NPC",defense);
 assert.equal(finished.status,"FINISHED");
 assert.deepEqual(post(JSON.parse(JSON.stringify(finished)),"NPC",defense),finished);
 assert.throws(()=>post(finished,"NPC",{
  ...defense,requestId:"new-defense-0000001",
 }),/no está activo/);
});

test("same ID with modified intent or another side is rejected, not re-executed",()=>{
 const once=post(initial(),"PLAYER",moved);
 assert.equal(isCombatActionReplay(once,"PLAYER",{...moved,
  planarMove:{y:0,x:.5}}),true,"object-key order is not meaningful");
 assert.throws(()=>post(once,"PLAYER",{...moved,meters:.7}),
  /Identificador reutilizado/);
 assert.throws(()=>post(once,"NPC",moved),
  /Identificador reutilizado/);
 assert.throws(()=>post(once,"PLAYER",{...moved,requestId:"bad"}),
  /Identificador de acción inválido/);
 assert.throws(()=>post(initial(),"PLAYER",{kind:"WAIT"}),
  /Identificador de acción inválido/);
});

test("legacy encounters without the new ledger remain compatible",()=>{
 const old=initial();
 delete old.processedActionRequests;
 const newer=post(JSON.parse(JSON.stringify(old)),"PLAYER",moved);
 assert.equal(newer.processedActionRequests.length,1);
 assert.equal(isReplayableCombatKind("CAST_SKILL"),false);
 assert.equal(isReplayableCombatKind("ADVANCE"),true);
});

test("server checks replay under row lock before FINISHED, NPC progress and equipment writes",()=>{
 const route=readFileSync(new URL("../app/api/combat/[id]/actions/route.ts",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
 const lock=route.indexOf('UPDATE public."combatSession" SET id=id');
 const replay=route.indexOf("isCombatActionReplay(state,side,replayAction)");
 const finished=route.indexOf('String(fresh?.status)!=="ACTIVE"');
 const execute=route.indexOf("next=applyCombatCommand(state,side,command");
 const persist=route.indexOf("lastAction:{combatV1:next}");
 assert.ok(lock>=0&&lock<replay&&replay<finished&&finished<execute&&execute<persist,
  "a duplicate cannot roll new dice or modify a FINISHED encounter");
 assert.match(route,/if\(replayAction\)\s*next=recordCombatAction\(state,next,side,replayAction\)/);
 assert.match(ui,/const actionRequestRef=useRef/);
 assert.match(ui,/command:outgoing/);
 assert.match(ui,/requestId:"npc-advance-"\+key/);
});
