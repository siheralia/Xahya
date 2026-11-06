import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {
  applyCombatCommand,applyResolvedCombatSkill,canStartComposite,newCombatState,
  remainingAp,turnTicks,
} from "../lib/combat/turn-engine.ts";
import {fieldPosition} from "../lib/combat/field-plane.ts";

const fighter=(name,speed=38,positionMeters=0)=>({
  characterId:null,name,hp:100,maxHp:100,
  speedValue:speed,agility:speed,strength:10,constitution:1,
  precision:50,dodge:25,physicalAttack:18,physicalDefense:4,
  magicAttack:22,magicDefense:4,critical:10,luck:10,race:20,massKg:70,
  positionMeters,weaponIntegrity:100,attackType:"PIERCE",defenseType:"SOLID",
  spentTicks:0,spentAp:0,
});
const dice={hit:.01,critical:.99,defense:.99};
const state=()=>{
  const s=newCombatState(fighter("Player"),fighter("NPC",45,3));
  s.mana={PLAYER:{current:50,max:50},NPC:{current:30,max:30}};
  s.actors.NPC.spentTicks=81;
  return s;
};
const skill=(id,magic)=>compileCombatSkill({
  id,name:"Técnica "+id,status:"APPROVED",category:"OFFENSIVE",cost:20,
  attackType:"PIERCE",duration:"Instantánea",cooldown:"Sin cooldown",
  areaOfEffect:"Objetivo único | Alcance máximo: 5 m",mechanics:{},condition:"",
  effect:[
    {type:"DAMAGE_MULTIPLIER",target:magic?"MAGIC_ATTACK":"PHYSICAL_ATTACK",value:100},
    {type:magic?"IGNORE_MAGIC_DEF_MULTIPLIER":"IGNORE_PHYS_DEF_MULTIPLIER",value:50},
    {type:"FINAL_DAMAGE_MULTIPLIER",value:300},
  ],
});

test("post-159: a composite starts at any 1-99 spent ticks when two PA remain",()=>{
  const s=state();
  const actor=s.actors.PLAYER;
  assert.equal(turnTicks(actor),27);
  for(let ticks=1;ticks<100;ticks++){
    actor.spentTicks=ticks;
    actor.spentAp=3;
    assert.equal(canStartComposite(actor),true,"spent ticks "+ticks);
  }
  actor.spentTicks=100;
  assert.equal(canStartComposite(actor),false);
  actor.spentTicks=99;
  actor.spentAp=9;
  assert.equal(remainingAp(actor),1);
  assert.equal(canStartComposite(actor),false);
});

test("post-159: approved physical and magical skills combine a late move in both orders",()=>{
  for(const magic of [false,true]){
    for(const order of ["BEFORE","AFTER"]){
      const s=state();
      s.actors.PLAYER.spentTicks=81;
      s.actors.PLAYER.spentAp=3;
      const beforeMana=s.mana.PLAYER.current;
      const id=magic?203:202;
      const plan=skill(id,magic);
      assert.equal(plan.category,"OFFENSE");
      assert.equal(plan.usesMagic,magic);
      const launched=applyResolvedCombatSkill(s,"PLAYER",plan,{
        requestId:"post159-skill-"+id+"-"+order,
        planarMove:{x:.5,y:0},movementOrder:order,
        ...(magic?{areaCenter:{x:.5,y:.5}}:{}),
      },dice);
      assert.ok(launched.pending,"approved skill must launch normally");
      assert.equal(launched.pending.skill.id,id);
      assert.equal(launched.actors.PLAYER.spentAp,5,"one PA for move and one for skill attack");
      assert.equal(launched.actors.PLAYER.spentTicks,100,"only one capped tick window");
      assert.equal(launched.mana.PLAYER.current,beforeMana-plan.cost);
      assert.equal(fieldPosition(launched.actors.PLAYER).x,order==="BEFORE"?.5:0);
      const resolved=applyCombatCommand(launched,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
      assert.equal(resolved.pending,null);
      assert.equal(fieldPosition(resolved.actors.PLAYER).x,.5,
        "AFTER movement applies exactly once after resolving the attack");
    }
  }
});

test("post-159: accepting an impact never requires the drawn movement's two PA",()=>{
  const ui=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
  assert.match(ui,/const paidReactionMovement=selectedDefense==="NONE"\|\|selectedDefense==="COUNTER"/);
  assert.match(ui,/planarMove:paidReactionMovement/);
  assert.match(ui,/\(!!paidReactionMovement&&!canCombine\)/);
  assert.match(ui,/selectedDefense==="NONE"\?"Recibir impacto · 0 PA"/);
  let s=state();
  s=applyCombatCommand(s,"PLAYER",{
    kind:"ATTACK",attackType:"PIERCE",usesMagic:true,areaCenter:{x:.5,y:.5},
  },dice);
  s.actors.NPC.spentTicks=100;
  s.actors.NPC.spentAp=10;
  const resolved=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},dice);
  assert.equal(resolved.pending,null,"the server never demands PA to accept a hit");
});
