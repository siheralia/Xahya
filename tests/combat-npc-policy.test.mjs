import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyCombatCommand, canAct, newCombatState, remainingAp } from "../lib/combat/turn-engine.ts";
import { chooseNpcReaction, progressTrainingNpc } from "../lib/combat/npc-policy.ts";
import { compileCombatSkill } from "../lib/combat/skill-casting.ts";

const fighter = (name, agility=100, overrides={}) => ({
 characterId:null,name,hp:100,maxHp:100,agility,strength:10,constitution:1,
 precision:30,dodge:30,physicalAttack:18,physicalDefense:6,
 magicAttack:12,magicDefense:4,critical:10,luck:10,race:20,
 massKg:70,positionMeters:0,weaponIntegrity:100,
 attackType:"CUT",defenseType:"SOLID", equippedWeapon:{name:"Arma de entrenamiento",attackType:"CUT",mode:"MELEE",effectiveRangeMeters:2,maximumRangeMeters:2},
 spentTicks:0,spentAp:0,...overrides,
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

test("encounter 60 regression: 11-speed caster does not permanently stunlock 16-speed training NPC",()=>{
 let s=newCombatState(
   fighter("Arissa",11,{characterId:29,speedValue:11,magicAttack:42,hp:320,maxHp:320,
     equippedWeapon:undefined,positionMeters:0}),
   fighter("Training NPC",16,{speedValue:16,magicDefense:23,hp:132,maxHp:132,
     positionMeters:1.5})
 );
 s.mana={PLAYER:{current:80,max:80},NPC:{current:50,max:50}};
 s=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",usesMagic:true,attackType:"CUT",
   areaCenter:{x:.5,y:.5}},dice());
 assert.equal(chooseNpcReaction(s,()=>0.2).defense,"NONE",
   "the NPC can accept a survivable magic hit to keep a real counterturn");
 s=progressTrainingNpc(s,dice,()=>0.99);
 assert.equal(s.pending?.by,"NPC","NPC retaliates before the player can cast again");
 assert.ok(s.log.some(e=>e.kind==="ATTACK"&&e.by==="NPC"));
 assert.equal(s.actors.NPC.spentAp,1,"only the counterattack costs PA");
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
    attackType:"BLUNT",equippedWeapon:{name:"Martillo",attackType:"BLUNT",mode:"MELEE",effectiveRangeMeters:2,maximumRangeMeters:2},defenseType:"CONCENTRATED"
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
  assert.notEqual(nextChoice.defense,"NONE","NPC can defend and retain the next alternating initiative");
  state=progressTrainingNpc(state,()=>({hit:0.2,critical:0.99,defense:0.1}),rng);
  const resolution=state.log.find(e=>e.kind==="RESOLVE");
  assert.notEqual(resolution.defense,"NONE");
  assert.equal(state.pending?.by,"NPC","NPC gets to attack with its own paid action");
  assert.ok(state.log.some(e=>e.kind==="ATTACK"&&e.by==="NPC"));
  assert.equal(state.actors.NPC.spentAp,2);
  assert.ok(state.actors.NPC.hp>0);
  state=applyCombatCommand(state,"PLAYER",{kind:"DEFEND",defense:"DODGE"},dice());
  state=progressTrainingNpc(state,dice,rng);
  assert.ok(state.actors.PLAYER.spentAp>=2,"Guha pays for her defense and can act again when due");
});

test("NPC protects itself instead of sacrificing an obviously fatal hit",()=>{
  const player=fighter("Attacker",38,{physicalAttack:160,equippedWeapon:{name:"Maza",attackType:"BLUNT",mode:"MELEE",effectiveRangeMeters:2,maximumRangeMeters:2}});
  const npc=fighter("NPC",38,{hp:12,maxHp:12,positionMeters:1.5});
  let s=newCombatState(player,npc);
  s=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"BLUNT"});
  assert.notEqual(chooseNpcReaction(s,rng).defense,"NONE");
});

test("counterattack stance does not grant extra ticks or an additional free action",()=>{
  const player=fighter("Attacker",38,{strength:1,physicalAttack:7,physicalDefense:5});
  const npc=fighter("NPC",38,{positionMeters:1.5,physicalDefense:6});
  let s=newCombatState(player,npc);
  s=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"CUT"});
  const p=progressTrainingNpc(s,dice,rng);
  assert.equal(p.pending?.by,"NPC");
  assert.equal(p.actors.NPC.spentAp,2);
  assert.equal(p.actors.NPC.spentTicks,54);
  assert.equal(p.log.filter(e=>e.kind==="ATTACK"&&e.by==="NPC").length,1);
});


test("aggressive NPC casts a real published-style ability using encounter mana and AP",()=>{
 const plan=compileCombatSkill({
  id:1_000_000_016,name:"Orbe arcano",status:"APPROVED",category:"OFFENSIVE",
  cost:10,attackType:"PIERCE",areaOfEffect:"Oponente único | Alcance máximo: 5 m",
  duration:"Instantánea",cooldown:"2 turnos",mechanics:{},condition:"",
  effect:[{type:"DAMAGE_MULTIPLIER",target:"MAGIC_ATK",value:150}],
 });
 let s=newCombatState(fighter("Hero",100),fighter("Aggressive",50,{positionMeters:1.5}));
 s.mana={PLAYER:{current:60,max:60},NPC:{current:60,max:60}};
 s.trainingNpc={difficulty:"AGGRESSIVE",race:{id:2,name:"Enano"},
  racialPerks:[{id:1,name:"Racial",mechanical:true}],
  extraPerks:[{id:2,name:"Uno"},{id:3,name:"Dos"},{id:4,name:"Tres"}],skills:[plan]};
 s=applyCombatCommand(s,"PLAYER",{kind:"MOVE",meters:0.1});
 s=applyCombatCommand(s,"PLAYER",{kind:"MOVE",meters:0.1});
 s=progressTrainingNpc(s,dice,()=>0);
 assert.equal(s.pending?.by,"NPC");
 assert.equal(s.pending?.skill?.id,1_000_000_016);
 assert.equal(s.mana.NPC.current,50);
 assert.equal(s.actors.NPC.spentAp,1);
 assert.equal(s.skillCooldowns.NPC[String(plan.id)],4);
 assert.equal(s.trainingNpc.extraPerks.length,3);
 assert.equal(s.trainingNpc.racialPerks.length,1);
});


test("encounter 49: an exhausted Arissa can resolve Robin Hood's arrow without an illegal dodge-direction error",()=>{
 const arissa=fighter("Arissa Grazzi",11,{positionMeters:0,hp:80,maxHp:80});
 const robin=fighter("Robin Hood",31,{positionMeters:1.5,attackType:"PIERCE",
  equippedWeapon:{name:"Ballesta",attackType:"PIERCE",mode:"RANGED",
   effectiveRangeMeters:14,maximumRangeMeters:28}});
 let state=newCombatState(arissa,robin,"NPC");
 // Her opening Meia-lua (BLUNT at speed 11) has consumed the whole tick budget.
 state.actors.PLAYER.spentTicks=100;
 state.actors.PLAYER.spentAp=1;
 state=applyCombatCommand(state,"NPC",{
   kind:"ATTACK",attackType:"PIERCE",rangedPhysical:true,
   attackSource:"MAIN_HAND",areaCenter:{x:0.5,y:0.5},
 },{hit:0.01,critical:0.99,defense:0.99});
 assert.equal(state.pending?.against,"PLAYER");
 assert.equal(state.pending?.rangedPhysical,true);
 const original=structuredClone(state);
 const next=applyCombatCommand(state,"PLAYER",{
   kind:"DEFEND",defense:"DODGE",dodgeDirection:"AWAY",
   predictedCenter:{x:0.5,y:0.5},
 },{hit:0.99,critical:0.99,defense:0.99});
 const resolve=next.log.findLast(e=>e.kind==="RESOLVE");
 assert.equal(resolve.defense,"NONE","exhausted fighters still cannot gain a free dodge");
 const noReaction=applyCombatCommand(original,"PLAYER",{kind:"DEFEND",defense:"NONE"},
  {hit:0.99,critical:0.99,defense:0.99});
 assert.equal(next.actors.PLAYER.positionMeters,noReaction.actors.PLAYER.positionMeters,
  "the fallback cannot grant a dodge displacement (natural knockback remains allowed)");
 assert.equal(next.actors.PLAYER.spentAp,1,"no extra AP is spent");
 assert.equal(next.actors.PLAYER.hp,noReaction.actors.PLAYER.hp,
  "a downgraded dodge and an explicit no-reaction take identical damage");
 assert.equal(original.pending.rangedPhysical,true,"the original state stays immutable");
 assert.throws(()=>applyCombatCommand(state,"PLAYER",{
   kind:"DEFEND",defense:"NONE",dodgeDirection:"AWAY",
 }),/Solo puedes elegir desplazamiento para Esquivar/,"invalid explicit displacement remains rejected");
});

test("combat UI explains exhausted reaction instead of offering impossible aim/prediction",()=>{
 const page=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
 assert.match(page,/const hasReactionBudget=.*remainingAp\(actor\)>0&&actor\.spentTicks<100/);
 assert.match(page,/!hasReactionBudget\?opt\.value==="NONE"/);
 assert.match(page,/agotaste los 100 ticks de este turno/);
 assert.match(page,/Recibir impacto \(sin reacción\)/);
});


test("own combat HUD shows remaining ticks in both compact and expanded modes",()=>{
 const hud=readFileSync(new URL("../app/combat/[id]/CombatCharacterHud.tsx",import.meta.url),"utf8");
 assert.match(hud,/const usedTicks=Math\.max\(0,Math\.min\(100,fighter\.spentTicks\)\)/);
 assert.match(hud,/const remainingTicks=100-usedTicks/);
 assert.match(hud,/const ticks=remainingTicks\+"\/"\+100|const ticks=remainingTicks\+"\/100"/);
 assert.match(hud,/Ticks disponibles: /);
 assert.match(hud,/Ticks gastados:/);
 assert.match(hud,/grid-cols-4/);
 assert.match(hud,/remainingTicks===0\?"Sin ticks disponibles/);
 const fighterProfile=fighter("Arissa",11,{spentTicks:100,spentAp:1});
 assert.equal(100-Math.min(100,fighterProfile.spentTicks),0);
 assert.ok(remainingAp(fighterProfile)>0,"PA remaining does not imply a viable dodge");
});
