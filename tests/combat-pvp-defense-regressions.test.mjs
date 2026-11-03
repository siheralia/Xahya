import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {applyCombatCommand, newCombatState, matchupMultiplier}
 from "../lib/combat/turn-engine.ts";
import {magicImpactZone,magicHintCells,combatClientView}
 from "../lib/combat/magic-area.ts";
import {chooseNpcReaction}
 from "../lib/combat/npc-policy.ts";

const actor=(name,characterId,positionMeters=0,overrides={})=>({
 characterId,name,hp:100,maxHp:100,agility:100,speedValue:100,
 strength:10,constitution:10,precision:40,dodge:50,
 physicalAttack:15,physicalDefense:10,magicAttack:60,magicDefense:20,
 critical:0,luck:10,race:20,massKg:70,positionMeters,
 weaponIntegrity:100,attackType:"PIERCE",defenseType:"SOLID",
 magicFieldType:"CONCENTRATED",magicFieldDescription:"Muralla de maná",
 spentTicks:0,spentAp:0,...overrides,
});
const dice={hit:0.5,critical:0.99,defense:0.1};
const circle={kind:"ATTACK",usesMagic:true,attackType:"PIERCE",areaCenter:{x:0.88,y:0.84}};

test("four closest squares: a point in 1 reveals 1,2,4,5 (never only square 1)",()=>{
 const hint=magicImpactZone({x:0.02,y:0.02});
 assert.equal(hint,"superior izquierda");
 assert.deepEqual(magicHintCells(hint).map(i=>i+1),[1,2,4,5]);
});

test("four closest squares: point in 5 near 9 reveals 5,6,8,9",()=>{
 const hint=magicImpactZone({x:0.65,y:0.65});
 assert.equal(hint,"inferior derecha");
 assert.deepEqual(magicHintCells(hint).map(i=>i+1),[5,6,8,9]);
});

test("every location reveals exactly four unique adjacent squares containing its cell",()=>{
 const probes=[0,0.14,0.32,0.34,0.49,0.51,0.68,0.84,0.99];
 for(const x of probes)for(const y of probes){
  const cells=magicHintCells(magicImpactZone({x,y}));
  assert.equal(cells.length,4);
  assert.equal(new Set(cells).size,4);
  const trueCell=Math.floor(y*3)*3+Math.floor(x*3);
  assert.ok(cells.includes(trueCell),`missing cell ${trueCell} for ${x},${y}`);
 }
});

test("PvP defender can see four-square hint without the true target location",()=>{
 const state=applyCombatCommand(
  newCombatState(actor("Alice",101),actor("Bob",102,1.5)),"PLAYER",circle);
 const visible=combatClientView(state);
 assert.equal(visible.pending.areaHint,"inferior derecha");
 assert.deepEqual(magicHintCells(visible.pending.areaHint),[4,5,7,8]);
 assert.equal(visible.pending.targetCenter,undefined);
 assert.deepEqual(state.pending.targetCenter,{x:0.88,y:0.84});
 assert.ok(!JSON.stringify(visible).includes('"targetCenter"'));
 // The projection also upgrades old pending single-cell warnings.
 const old=structuredClone(state);
 old.pending.areaHint="inferior derecha";
 const oldView=combatClientView(old);
 assert.deepEqual(magicHintCells(oldView.pending.areaHint),[4,5,7,8]);
});

test("PvP magic field is selectable, charged in AP/ticks, and protects HP without wearing the weapon",()=>{
 const original=newCombatState(actor("Alice",101),actor("Bob",102,1.5));
 const incoming=applyCombatCommand(original,"PLAYER",circle);
 const withField=applyCombatCommand(incoming,"NPC",{kind:"DEFEND",defense:"MAGIC_FIELD"},dice);
 const unprotected=applyCombatCommand(incoming,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 assert.equal(withField.log.at(-1).defense,"MAGIC_FIELD");
 assert.equal(withField.actors.NPC.spentAp,1);
 assert.ok(withField.actors.NPC.spentTicks>0);
 assert.equal(withField.actors.NPC.weaponIntegrity,100);
 assert.ok(withField.actors.NPC.hp>unprotected.actors.NPC.hp);
 assert.equal(withField.pending,null);
});

test("magic field uses its own RPS type, not the physical blocking type",()=>{
 const incomingFor=magicFieldType=>applyCombatCommand(
  newCombatState(actor("Attacker",101),actor("Defender",102,1.5,{
   defenseType:"SOLID",magicFieldType,
  })),"PLAYER",circle);
 const concentrated=incomingFor("CONCENTRATED");
 const solid=incomingFor("SOLID");
 assert.equal(matchupMultiplier("PIERCE","CONCENTRATED"),1.2);
 assert.equal(matchupMultiplier("PIERCE","SOLID"),0.8);
 const first=applyCombatCommand(concentrated,"NPC",{kind:"DEFEND",defense:"MAGIC_FIELD"},dice);
 const second=applyCombatCommand(solid,"NPC",{kind:"DEFEND",defense:"MAGIC_FIELD"},dice);
 assert.ok(first.log.at(-1).damage>=second.log.at(-1).damage,
  "Piercing magic must be weaker against a solid field than concentrated");
});

test("a magic field cannot be used to block a physical swing",()=>{
 const first=applyCombatCommand(
  newCombatState(actor("Attacker",101),actor("Defender",102,1.5)),"PLAYER",
  {kind:"ATTACK",attackType:"CUT",trajectory:[{x:0.1,y:0.2},{x:0.7,y:0.8}]});
 assert.throws(
  ()=>applyCombatCommand(first,"NPC",{kind:"DEFEND",defense:"MAGIC_FIELD"},dice),
  /solo puede responder a ataques mágicos/);
});

test("training NPC guesses inside the four-cell warning without reading its hidden impact",()=>{
 const initial=applyCombatCommand(
  newCombatState(actor("Player",101),actor("NPC",null,1.5)),"PLAYER",
  {...circle,areaCenter:{x:0.59,y:0.60}});
 const a=chooseNpcReaction(initial,()=>0.25);
 assert.equal(a.defense,"DODGE");
 assert.ok(a.predictedCenter.x>=1/3&&a.predictedCenter.y>=1/3);
 const fake=structuredClone(initial);
 fake.pending.targetCenter={x:0.99,y:0.99};
 assert.deepEqual(chooseNpcReaction(fake,()=>0.25),a);
 assert.equal(chooseNpcReaction(initial,()=>0.65).defense,"MAGIC_FIELD");
});

test("pointer drawing does not read an expired React event inside a deferred updater",()=>{
 // On mobile React may run functional state updaters after currentTarget clears.
 // Keep this structural regression guard until browser E2E is available.
 const source=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
 assert.ok(source.includes("const point=toPoint(e);"));
 assert.ok(source.includes("setPoints(previous=>previous.length>=79?previous:[...previous,point])"));
 assert.ok(source.includes("setPoints(previous=>previous.length<2?[...previous,point]:previous)"));
 assert.doesNotMatch(source,/setPoints\(previous=>[^;]*toPoint\(e\)/);
});
