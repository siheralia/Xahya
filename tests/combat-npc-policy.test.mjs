import test from "node:test";
import assert from "node:assert/strict";
import { applyCombatCommand, canAct, newCombatState, remainingAp } from "../lib/combat/turn-engine.ts";
import { chooseNpcReaction, progressTrainingNpc } from "../lib/combat/npc-policy.ts";

const fighter = (name, agility=100, overrides={}) => ({
 characterId:null,name,hp:100,maxHp:100,agility,strength:10,constitution:1,
 precision:30,dodge:30,physicalAttack:18,physicalDefense:6,
 magicAttack:12,magicDefense:4,critical:10,luck:10,race:20,
 massKg:70,positionMeters:0,weaponIntegrity:100,
 attackType:"CUT",defenseType:"SOLID",spentTicks:0,spentAp:0,...overrides,
});
const dice=()=>({hit:0.2,critical:0.9,defense:0.2});
const rng=()=>0.35;

test("slower NPC automatically attacks after two faster player moves; player can react",()=>{
 let s=newCombatState(fighter("Guha",100),fighter("NPC",50,{positionMeters:1.5}));
 s=applyCombatCommand(s,"PLAYER",{kind:"MOVE",meters:0.2,direction:"AWAY"});
 s=progressTrainingNpc(s,dice,rng);
 assert.equal(s.pending,null,"NPC must not act before its 20-tick slot");
 s=applyCombatCommand(s,"PLAYER",{kind:"MOVE",meters:0.2,direction:"TOWARD"});
 s=progressTrainingNpc(s,dice,rng);
 assert.equal(s.pending?.by,"NPC");
 assert.equal(s.pending?.against,"PLAYER");
 s=applyCombatCommand(s,"PLAYER",{kind:"DEFEND",defense:"DODGE"},dice());
 s=progressTrainingNpc(s,dice,rng);
 assert.equal(s.pending,null);
 assert.ok(canAct(s,"PLAYER"),"Guha regains her movement when her reaction ends");
});

test("ending player's turn yields NPC actions until a new round without manually controlling NPC",()=>{
 let s=newCombatState(fighter("Guha",100),fighter("NPC",50,{positionMeters:1.5}));
 s=applyCombatCommand(s,"PLAYER",{kind:"WAIT"});
 let counter=0;
 while(s.round===1 && counter++<15) {
   s=progressTrainingNpc(s,dice,rng);
   assert.equal(s.pending?.by,"NPC");
   s=applyCombatCommand(s,"PLAYER",{kind:"DEFEND",defense:"NONE"},dice());
 }
 // Some NPC actions are spent approaching again after physical knockback,
 // so the number of attack/reaction cycles can be below five.
 assert.ok(counter>=2);
 assert.ok(s.log.some(x=>x.kind==="MOVE"&&x.by==="NPC"));
 assert.ok(s.log.filter(x=>x.kind==="ATTACK"&&x.by==="NPC").length>=2);
 assert.equal(s.round,2);
 assert.ok(canAct(s,"PLAYER"));
 assert.equal(s.actors.NPC.spentAp,0);
});

test("NPC reacts with several defenses based on statistical weights, not only DODGE",()=>{
 let s=newCombatState(fighter("Guha",100),fighter("NPC",75,{positionMeters:1.5}));
 s=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"CUT"});
 let seed=51;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const counts={DODGE:0,BLOCK:0,ENDURE:0,REPEL:0,DEFLECT:0,NONE:0};
 for(let i=0;i<1200;i++){
   const r=chooseNpcReaction(s,random);
   counts[r.defense]++;
   if(r.defense==="DEFLECT") assert.ok(r.defenseAngle>=0&&r.defenseAngle<=359);
 }
 assert.equal(counts.NONE,0);
 assert.ok(counts.DODGE<600,JSON.stringify(counts));
 for(const type of ["DODGE","BLOCK","ENDURE","REPEL","DEFLECT"]) {
   assert.ok(counts[type]>75,JSON.stringify(counts));
 }
});

test("automatic training policy never takes control of a human PvP opponent",()=>{
 let s=newCombatState(fighter("Guha",100),fighter("Human",50,{characterId:99,positionMeters:1.5}));
 s=applyCombatCommand(s,"PLAYER",{kind:"WAIT"});
 assert.strictEqual(progressTrainingNpc(s,dice,rng),s);
});

test("combat log ticks never go backwards when a slower actor acts after a faster one",()=>{
 let s=newCombatState(fighter("Guha",100),fighter("NPC",30,{positionMeters:1.5}));
 for(let i=0;i<4;i++)s=applyCombatCommand(s,"PLAYER",{kind:"MOVE",meters:0.1});
 s=applyCombatCommand(s,"NPC",{kind:"MOVE",meters:0.1});
 const times=s.log.map(e=>e.tick);
 assert.deepEqual(times,[...times].sort((a,b)=>a-b));
 assert.equal(times.at(-1),40);
});

test("reactions consume AP: a slower fighter cannot dodge unlimited attacks for free",()=>{
 let s=newCombatState(fighter("Guha",100),fighter("NPC",50,{positionMeters:1.5}));
 const start=remainingAp(s.actors.NPC);
 s=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"CUT"});
 s=progressTrainingNpc(s,dice,rng);
 assert.equal(remainingAp(s.actors.NPC),start-1);
 assert.equal(s.pending,null);
});

test("encounter #2 regression: equally fast NPC counterattacks instead of defending every strike",()=>{
  // Numeric profile observed in Guha's second encounter: 38 speed,
  // 12 HP, 27 ticks per NPC action, and an incoming BLUNT attack.
  const guha=fighter("Guha",38,{
    hp:12,maxHp:12,speedValue:38,agility:38,strength:1,
    precision:62.33,physicalAttack:10.5,physicalDefense:45.5,
    constitution:1,race:1.25,dodge:136,critical:73.23,luck:31,
    attackType:"BLUNT",defenseType:"CONCENTRATED"
  });
  const npc=fighter("Training NPC",38,{
    hp:12,maxHp:12,speedValue:38,agility:38,strength:1,
    precision:62.33,physicalAttack:10.5,physicalDefense:10.5,
    constitution:1,race:1.25,dodge:136,critical:73.23,luck:31,
    attackType:"CUT",defenseType:"SOLID",positionMeters:1.5
  });
  let state=newCombatState(guha,npc);
  state=applyCombatCommand(state,"PLAYER",{kind:"ATTACK",attackType:"BLUNT"});
  const nextChoice=chooseNpcReaction(state,rng);
  assert.equal(nextChoice.defense,"NONE","NPC must save an action instead of defending every hit");
  state=progressTrainingNpc(state,()=>({hit:0.2,critical:0.99,defense:0.1}),rng);
  const resolution=state.log.find(e=>e.kind==="RESOLVE");
  assert.equal(resolution.defense,"NONE");
  assert.equal(state.pending?.by,"NPC","NPC gets to attack with its own paid action");
  assert.ok(state.log.some(e=>e.kind==="ATTACK"&&e.by==="NPC"));
  assert.equal(state.actors.NPC.spentAp,1);
  assert.ok(state.actors.NPC.hp>0);
  state=applyCombatCommand(state,"PLAYER",{kind:"DEFEND",defense:"DODGE"},dice());
  state=progressTrainingNpc(state,dice,rng);
  assert.ok(state.actors.PLAYER.spentAp>=2,"Guha pays for her defense and can act again when due");
});

test("NPC protects itself instead of sacrificing an obviously fatal hit",()=>{
  const player=fighter("Attacker",38,{physicalAttack:160});
  const npc=fighter("NPC",38,{hp:12,maxHp:12,positionMeters:1.5});
  let s=newCombatState(player,npc);
  s=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"BLUNT"});
  assert.notEqual(chooseNpcReaction(s,rng).defense,"NONE");
});

test("counterattack stance does not grant extra ticks or an additional free action",()=>{
  const player=fighter("Attacker",38,{physicalAttack:7,physicalDefense:5});
  const npc=fighter("NPC",38,{positionMeters:1.5,physicalDefense:6});
  let s=newCombatState(player,npc);
  s=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"CUT"});
  const p=progressTrainingNpc(s,dice,rng);
  assert.equal(p.pending?.by,"NPC");
  assert.equal(p.actors.NPC.spentAp,1);
  assert.equal(p.actors.NPC.spentTicks,27);
  assert.equal(p.log.filter(e=>e.kind==="ATTACK"&&e.by==="NPC").length,1);
});
