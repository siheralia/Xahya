import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {applyResolvedCombatSkill,newCombatState,applyCombatCommand,remainingAp} from "../lib/combat/turn-engine.ts";
import {combatChargeBalance,creditCombatCharge,spendCombatCharges} from "../lib/combat/charge-pools.ts";
import {emptyMicroState,executeMicroEvent,validateEffectContainers} from "../lib/effects/micro-modules.ts";
const fighter=(name,positionMeters,patch={})=>({
 characterId:null,name,hp:250,maxHp:250,agility:200,speedValue:200,
 strength:80,constitution:10,precision:50,dodge:40,
 physicalAttack:100,physicalDefense:40,magicAttack:100,magicDefense:20,
 critical:0,luck:10,race:20,massKg:70,positionMeters,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",spentTicks:0,spentAp:0,...patch
});
const rolls={hit:0.15,critical:0.8,defense:0.9};
const newState=(charges=6,mana=250)=>{
 const s=newCombatState(fighter("Caster",0),fighter("Target",1.2,{agility:20,speedValue:20}));
 s.mana={PLAYER:{current:mana,max:mana},NPC:{current:200,max:200}};
 s.combatCharges={PLAYER:{LUNAR_CHARGES:charges},NPC:{}};
 return s;
};
const effect=(steps)=>({type:"COMPOSED",module:{
 id:"LUNAR_OVERFLOW",name:"Sobreflujo Lunar",description:"",type:"COMPOSED",
 trigger:"ACTIVATE",steps
}});
const consume={kind:"CONSUME_COMBAT_CHARGES",accumulator:"LUNAR_CHARGES",
 minCharges:1,maxCharges:6,manaCost:30,output:"spentLunarCharges"};
const buff={kind:"APPLY_CHARGE_BUFF",charges:{source:"OUTPUT",key:"spentLunarCharges"},
 stats:["STR","AGI","DODGE"],perChargePercent:25,durationTurns:2};
const skill=(steps=[consume,buff],changes={})=>({
 id:921,name:"Sobreflujo Lunar",status:"APPROVED",category:"UTILITY",
 cost:30,maintenanceCost:0,duration:"2 turnos",cooldown:"Sin cooldown",
 effect:[effect(steps)],...changes
});
const plan=compileCombatSkill(skill());
const cast=(s,chargesToSpend,requestId="lunar-overflow-123456")=>
 applyResolvedCombatSkill(s,"PLAYER",plan,{requestId,chargesToSpend},rolls);

test("lunar overflow graph is independently executable with two typed microsteps",()=>{
 assert.equal(validateEffectContainers([effect([consume,buff]).module]),null);
 assert.equal(plan.category,"CHARGE_BUFF");
 assert.equal(previewSkillExecution(skill()).needsAim,false);
 assert.deepEqual(plan.chargeBuff.stats,["STR","AGI","DODGE"]);
 const result=executeMicroEvent(emptyMicroState(),[effect([consume,buff]).module],{
  eventId:"lunar-test",ownerId:21,trigger:"ACTIVATE",
  stats:{HP:250,MAX_HP:250},chosenCombatCharges:{LUNAR_CHARGES:3}
 });
 assert.deepEqual(result.intents,[
  {kind:"CONSUME_COMBAT_CHARGES",accumulator:"LUNAR_CHARGES",amount:3},
  {kind:"APPLY_CHARGE_BUFF",charges:3,stats:["STR","AGI","DODGE"],perChargePercent:25,durationTurns:2}
 ]);
 assert.deepEqual(result.state.accumulators,{},"the pure interpreter may not debit encounter resources");
});

test("charges 1 through 6 scale three stats, charge exactly 30 mana and one action",()=>{
 for(let n=1;n<=6;n++){
  const initial=newState();
  const result=cast(initial,n);
  const factor=1+0.25*n;
  assert.equal(result.actors.PLAYER.strength,80*factor);
  assert.equal(result.actors.PLAYER.agility,200*factor);
  assert.equal(result.actors.PLAYER.dodge,40*factor);
  assert.equal(result.actors.NPC.dodge,40,"cannot buff an enemy");
  assert.equal(result.actors.PLAYER.hp,250,"no healing or HP changes");
  assert.equal(result.mana.PLAYER.current,220,"30 mana once");
  assert.equal(combatChargeBalance(result,"PLAYER","LUNAR_CHARGES"),6-n);
  assert.equal(result.actors.PLAYER.spentAp,1);
  assert.ok(result.actors.PLAYER.spentTicks>0);
  assert.equal(result.summonStatuses.length,3);
  assert.ok(result.summonStatuses.every(status=>status.expiresAtRound===3));
  assert.equal(result,cast(result,n),"replayed skill must not spend more mana, PA or charges");
  assert.equal(initial.actors.PLAYER.strength,80,"original encounter remains immutable");
 }
});

test("buffs wear off after two round boundaries and restore exact original stats",()=>{
 let s=cast(newState(),4);
 assert.equal(s.actors.PLAYER.strength,160);
 assert.equal(s.actors.PLAYER.agility,400);
 assert.equal(s.actors.PLAYER.dodge,80);
 for(let i=0;i<2;i++){
  s.actors.PLAYER.spentTicks=100;
  s.actors.NPC.spentTicks=80;
  s=applyCombatCommand(s,"NPC",{kind:"WAIT"},rolls);
 }
 assert.equal(s.round,3);
 assert.equal(s.summonStatuses.length,0);
 assert.equal(s.actors.PLAYER.strength,80);
 assert.equal(s.actors.PLAYER.agility,200);
 assert.equal(s.actors.PLAYER.dodge,40);
 assert.equal(combatChargeBalance(s,"PLAYER","LUNAR_CHARGES"),2,
   "expired buffs do not refund spent charges");
});

test("insufficient charges, invalid count, mana and cooldown cannot spend an action",()=>{
 for(const count of [undefined,0,-1,7,1.5,NaN]){
  const state=newState();
  assert.throws(()=>cast(state,count,"unique-lunar-cast-456789"),/Elige entre|cantidad de cargas/);
  assert.equal(state.mana.PLAYER.current,250);
  assert.equal(state.actors.PLAYER.spentAp,0);
 }
 const notEnough=newState(2);
 assert.throws(()=>cast(notEnough,3),/suficientes cargas/);
 assert.equal(notEnough.combatCharges.PLAYER.LUNAR_CHARGES,2);
 const notEnoughMana=newState(6,29);
 assert.throws(()=>cast(notEnoughMana,2),/Maná insuficiente/);
 assert.equal(notEnoughMana.combatCharges.PLAYER.LUNAR_CHARGES,6);
 const cooldown=newState();
 cooldown.skillCooldowns={PLAYER:{"921":5}};
 assert.throws(()=>cast(cooldown,2),/cooldown/);
 assert.equal(cooldown.combatCharges.PLAYER.LUNAR_CHARGES,6);
});

test("the compiler rejects mismatched prices, fake outputs, duplicate or unsafe stats",()=>{
 assert.throws(()=>compileCombatSkill(skill([consume,buff],{cost:0})),/maná de la habilidad/);
 assert.throws(()=>compileCombatSkill(skill([consume,buff],{maintenanceCost:20})),/mantenimiento/);
 assert.throws(()=>compileCombatSkill(skill([buff,consume])),/Conecta primero|salida no existe/);
 assert.throws(()=>compileCombatSkill(skill([
  consume,{...buff,charges:6}
 ])),/directamente al conteo/);
 assert.throws(()=>compileCombatSkill(skill([consume,{...buff,stats:["DODGE","DODGE"]}])),/inválida/);
 assert.throws(()=>compileCombatSkill(skill([consume,{...buff,stats:["STR","HP"]}])),/estadísticas/);
 assert.throws(()=>compileCombatSkill(skill([consume,{...buff,perChargePercent:100}])),/supera los límites/);
 assert.throws(()=>compileCombatSkill(skill([
  consume,buff,{kind:"HEAL",amount:100}
 ])),/dos pasos/);
 assert.throws(()=>compileCombatSkill(skill([consume,buff],{duration:"7 turnos"})),/duración/);
});

test("old summon wallets migrate exactly once and do not vanish when the summon expires",()=>{
 const s=newState(0);
 s.combatCharges=undefined;
 s.summons=[
  {owner:"PLAYER",charges:{LUNAR_CHARGES:2},chargesMigrated:undefined},
  {owner:"PLAYER",charges:{LUNAR_CHARGES:3},chargesMigrated:undefined},
  {owner:"NPC",charges:{LUNAR_CHARGES:6},chargesMigrated:undefined}
 ];
 assert.equal(combatChargeBalance(s,"PLAYER","LUNAR_CHARGES"),5);
 assert.equal(combatChargeBalance(s,"NPC","LUNAR_CHARGES"),6);
 assert.equal(spendCombatCharges(s,"PLAYER","LUNAR_CHARGES",3),2);
 assert.equal(combatChargeBalance(s,"PLAYER","LUNAR_CHARGES"),2);
 assert.ok(s.summons.filter(v=>v.owner==="PLAYER").every(v=>v.chargesMigrated===true));
 // Legacy summon disappears, but owner-scoped charges do not.
 s.summons=[];
 assert.equal(combatChargeBalance(s,"PLAYER","LUNAR_CHARGES"),2);
 assert.equal(creditCombatCharge(s,"PLAYER","LUNAR_CHARGES"),1);
 assert.equal(combatChargeBalance(s,"PLAYER","LUNAR_CHARGES"),3);
 for(let i=0;i<10;i++)creditCombatCharge(s,"PLAYER","LUNAR_CHARGES");
 assert.equal(combatChargeBalance(s,"PLAYER","LUNAR_CHARGES"),6);
 assert.equal(creditCombatCharge(s,"PLAYER","LUNAR_CHARGES"),0,"hard cap of six");
 assert.equal(combatChargeBalance(s,"NPC","LUNAR_CHARGES"),6);
});

test("residual buffs from other skills stack with overflow and expire independently",()=>{
 let s=newState();
 s.summonStatuses=[];
 s=cast(s,2);
 assert.equal(s.actors.PLAYER.strength,120);
 // A second activation uses a unique action ID and still pays resources.
 const s2=cast(s,1,"lunar-overflow-different-789");
 assert.equal(s2.actors.PLAYER.strength,150,"x1.5 followed by x1.25");
 assert.equal(combatChargeBalance(s2,"PLAYER","LUNAR_CHARGES"),3);
 assert.equal(s2.mana.PLAYER.current,190);
 assert.equal(s2.summonStatuses.length,6);
});
