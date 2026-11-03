import test from "node:test";
import assert from "node:assert/strict";
import { varyTrainingNpcStats, NPC_STAT_VARIANCE } from "../lib/combat/training-npc.ts";
import { npcAttackTrajectory } from "../lib/combat/npc-policy.ts";
import { deflectionAlignment, applyCombatCommand, newCombatState } from "../lib/combat/turn-engine.ts";

const base={strength:10,constitution:10,agility:38,intelligence:20,wisdom:10,charisma:10,spirit:40,luck:10};
const fighter=(name,positionMeters=0)=>({
 characterId:null,name,hp:20,maxHp:20,agility:38,speedValue:38,
 strength:1,constitution:1,precision:60,dodge:60,physicalAttack:10,
 physicalDefense:8,magicAttack:10,magicDefense:10,critical:1,luck:10,
 race:1,massKg:70,positionMeters,weaponIntegrity:100,
 attackType:"CUT",defenseType:"SOLID",spentTicks:0,spentAp:0,
});

test("NPC variation stays within 8 percent, keeps speed exactly equal, and does not mutate input",()=>{
 const a=varyTrainingNpcStats(base,()=>0);
 const b=varyTrainingNpcStats(base,()=>0.999999);
 assert.equal(NPC_STAT_VARIANCE,0.08);
 assert.equal(a.agility,38);
 assert.equal(b.agility,38);
 assert.equal(base.strength,10);
 assert.equal(a.strength,9.2);
 assert.equal(b.strength,10.8);
 for(const key of ["strength","constitution","intelligence","wisdom","charisma","spirit","luck"]) {
   assert.ok(a[key]>=base[key]*0.92-0.01);
   assert.ok(b[key]<=base[key]*1.08+0.01);
 }
 assert.notDeepEqual(a,b);
});

test("configured combat-speed stat is never varied even if it is not AGI",()=>{
 const a=varyTrainingNpcStats(base,()=>0,"spirit");
 assert.equal(a.spirit,base.spirit);
 assert.equal(a.agility,base.agility);
 assert.notEqual(a.wisdom,base.wisdom);
});

test("NPC attack orientations are in bounds and change the optimal deflect angle",()=>{
 const angles=[0,0.125,0.25,0.375,0.5,0.75,0.9];
 const paths=angles.map(r=>npcAttackTrajectory(()=>r));
 for(const path of paths) {
  assert.equal(path.length,2);
  for(const p of path) {
   assert.ok(p.x>=0&&p.x<=1);
   assert.ok(p.y>=0&&p.y<=1);
  }
 }
 assert.ok(deflectionAlignment(paths[0],90)>0.99);
 assert.ok(deflectionAlignment(paths[2],90)<0.01);
 assert.notDeepEqual(paths[0],paths[1]);
});

test("combat attack log identifies attack kind for subsequent replay",()=>{
 let s=newCombatState(fighter("Guha"),fighter("NPC",1.5));
 s=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"PIERCE"});
 assert.equal(s.log[0].attackType,"PIERCE");
 assert.match(s.log[0].summary,/perforación/);
});
