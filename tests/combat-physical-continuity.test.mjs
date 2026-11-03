import test from "node:test";
import assert from "node:assert/strict";
import { applyCombatCommand, canAct, matchupMultiplier, newCombatState,
  physicalAttackStart } from "../lib/combat/turn-engine.ts";
import { npcAttackTrajectory, progressTrainingNpc } from "../lib/combat/npc-policy.ts";
const fighter=(name,location=0,overrides={})=>({
 characterId:null,name,hp:100,maxHp:100,agility:100,speedValue:100,
 strength:1,constitution:1,precision:30,dodge:30,physicalAttack:18,
 physicalDefense:6,magicAttack:150,magicDefense:10,critical:0,luck:10,
 race:20,massKg:70,positionMeters:location,weaponIntegrity:100,
 attackType:"CUT",defenseType:"SOLID",spentTicks:0,spentAp:0,...overrides,
});
const attack=trajectory=>({kind:"ATTACK",attackType:"CUT",trajectory});
const first=[{x:0.1,y:0.2},{x:0.8,y:0.7}];
const next=[{x:0.8,y:0.7},{x:0.25,y:0.4}];
const free=[{x:0.3,y:0.2},{x:0.55,y:0.8}];
const dice={hit:0.2,critical:0.99,defense:0.5};
function afterPlayerStrike(){
 let s=newCombatState(fighter("Guha"),fighter("Rival",1.5));
 s=applyCombatCommand(s,"PLAYER",attack(first));
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 return s;
}
test("the next physical attack must start at the exact previous endpoint, even across a round",()=>{
 let s=afterPlayerStrike();
 assert.deepEqual(physicalAttackStart(s,"PLAYER"),first[1]);
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"});
 s=applyCombatCommand(s,"PLAYER",{kind:"WAIT"});
 assert.equal(s.round,2);
 // Alternating tie initiative opens round 2 with NPC, but the path anchor
 // survives the round boundary and the absence of movement.
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"});
 assert.equal(canAct(s,"PLAYER"),true);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",attack(free)),/comenzar donde terminó/);
 s=applyCombatCommand(s,"PLAYER",attack(next));
 assert.deepEqual(s.physicalPathEnd.PLAYER,next[1]);
 assert.deepEqual(s.pending.trajectory[0],first[1]);
 // The endpoint is stored in the encounter, including after serialization.
 assert.deepEqual(physicalAttackStart(JSON.parse(JSON.stringify(s)),"PLAYER"),next[1]);
});
test("any actual movement of the attacker unlocks a new physical origin, but zero movement does not",()=>{
 let s=afterPlayerStrike();
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"});
 s=applyCombatCommand(s,"PLAYER",{kind:"MOVE",meters:0});
 assert.deepEqual(physicalAttackStart(s,"PLAYER"),first[1]);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",attack(free)),/comenzar donde terminó/);
 s=applyCombatCommand(s,"PLAYER",{kind:"MOVE",meters:0.5,direction:"TOWARD"});
 assert.equal(physicalAttackStart(s,"PLAYER"),null);
 s=applyCombatCommand(s,"PLAYER",attack(free));
 assert.deepEqual(physicalAttackStart(s,"PLAYER"),free[1]);
});
test("an opponent's movement does not reset your stroke anchor; magic also preserves it",()=>{
 let s=afterPlayerStrike();
 s=applyCombatCommand(s,"NPC",{kind:"MOVE",meters:0.1,direction:"TOWARD"});
 assert.deepEqual(physicalAttackStart(s,"PLAYER"),first[1]);
 s=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",usesMagic:true,
   attackType:"PIERCE",areaCenter:{x:0.4,y:0.3}});
 assert.deepEqual(physicalAttackStart(s,"PLAYER"),first[1]);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"});
 assert.throws(()=>applyCombatCommand(s,"PLAYER",attack(free)),/comenzar donde terminó/);
});
test("both players track their physical stroke endpoints independently",()=>{
 let s=newCombatState(fighter("Guha"),fighter("Rival",1.5));
 s=applyCombatCommand(s,"PLAYER",attack(first));
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
 s=applyCombatCommand(s,"NPC",attack(free));
 assert.deepEqual(physicalAttackStart(s,"PLAYER"),first[1]);
 assert.deepEqual(physicalAttackStart(s,"NPC"),free[1]);
});
test("NPC next physical trajectory begins at the stored endpoint, including near arena edges",()=>{
 const end={x:1,y:1};
 for(const angle of [0,0.2,0.4,0.7,0.9]) {
  const path=npcAttackTrajectory(()=>angle,end);
  assert.deepEqual(path[0],end);
  assert.ok(path.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1));
  assert.ok(Math.hypot(path[1].x-end.x,path[1].y-end.y)>0);
 }
});
test("NPC can perform subsequent physical attacks under the continuity rule",()=>{
 const player=fighter("Guha",0,{physicalAttack:2,physicalDefense:18});
 const npc=fighter("NPC",1.5,{magicAttack:0,physicalAttack:2,strength:1});
 let s=newCombatState(player,npc,"NPC");
 s=progressTrainingNpc(s,()=>dice,()=>0.6);
 assert.equal(s.pending?.by,"NPC");
 const startEndpoint=s.pending.trajectory.at(-1);
 s=applyCombatCommand(s,"PLAYER",{kind:"DEFEND",defense:"NONE"},dice);
 s=applyCombatCommand(s,"PLAYER",{kind:"WAIT"});
 s=progressTrainingNpc(s,()=>dice,()=>0.6);
 assert.equal(s.pending?.by,"NPC");
 assert.deepEqual(s.pending.trajectory[0],startEndpoint);
});
test("magic basic CUT BLUNT PIERCE preserve the same physical RPS matrix",()=>{
 const types=["CUT","BLUNT","PIERCE"];
 const defenses=["DISPERSED","SOLID","CONCENTRATED"];
 for(const [i,type] of types.entries()){
  assert.equal(matchupMultiplier(type,defenses[i]),1.2);
 }
 const damages={};
 for(const type of types){
  let s=newCombatState(fighter("Mage"),fighter("Target",2,{defenseType:"SOLID"}));
  s=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",usesMagic:true,
    attackType:type,areaCenter:{x:0.2,y:0.6}});
  assert.equal(s.pending.attackType,type);
  s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
  damages[type]=s.log.find(e=>e.kind==="RESOLVE").damage;
 }
 assert.ok(damages.BLUNT>damages.CUT && damages.CUT>damages.PIERCE,JSON.stringify(damages));
});
