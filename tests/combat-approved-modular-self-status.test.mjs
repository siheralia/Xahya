import test from "node:test";
import assert from "node:assert/strict";
import {compileCombatSkill,previewSkillExecution} from "../lib/combat/skill-casting.ts";
import {newCombatState,applyResolvedCombatSkill,applyCombatCommand,canAct}
 from "../lib/combat/turn-engine.ts";
import {activeCombatStatusViews} from "../lib/combat/active-status-summary.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";

const micro=(id,steps)=>({
 type:"COMPOSED",reviewedPch:20,
 module:{id,name:id,type:"COMBAT_SUPPORT",description:"Estado personal aprobado",
  trigger:"ACTIVATE",steps},
});
const selfStatus=(value=1.2,operation="MULTIPLIER",durationTurns=2,stat="MAGIC_DEFENSE")=>
 micro("SELF_STATUS",[
  {kind:"SELECT_TARGET",selector:"USER",output:"self"},
  {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"self"},stat,operation,
   value,durationTurns},
 ]);
const approved=(id=231,overrides={})=>({
 id,name:"Armadura resonante",characterId:11,
 status:"APPROVED",approvedAt:"2026-11-09T00:00:00Z",pchCost:60,
 category:"SUPPORT",cost:8,maintenanceCost:0,accumulationCost:0,
 accumulationPerTick:0,condition:"",mechanics:{},
 areaOfEffect:"Personal | Alcance máximo: 0 m",
 duration:"2 turnos",cooldown:"1 turno",effect:[selfStatus()],
 ...overrides,
});
const fighter=(name,id,pos)=>({
 characterId:id,name,hp:50,maxHp:100,
 agility:80,speedValue:90,strength:20,constitution:12,
 precision:80,dodge:12,physicalAttack:35,physicalDefense:12,
 magicAttack:30,magicDefense:10,critical:0,luck:10,race:20,
 massKg:70,positionMeters:pos,weaponIntegrity:100,
 attackType:"BLUNT",defenseType:"SOLID",spentTicks:0,spentAp:0,
});
const duel=()=>{
 const s=newCombatState(fighter("Marya",11,0),fighter("Rival",22,3),"PLAYER");
 s.mana={PLAYER:{current:20,max:20},NPC:{current:20,max:20}};
 return s;
};
const dice={hit:.01,critical:.99,defense:.99};
const requestId="modular-status-activation-001";
const cast=(s,plan=compileCombatSkill(approved()),aim={requestId})=>
 applyResolvedCombatSkill(s,"PLAYER",plan,aim,dice);
const advanceRound=previous=>{
 let s=previous;const target=s.round+1;
 for(let i=0;i<25&&s.round<target;i++){
  const side=canAct(s,"PLAYER")?"PLAYER":canAct(s,"NPC")?"NPC":null;
  assert.ok(side,"an authorized action must advance the encounter");
  s=applyCombatCommand(s,side,{kind:"WAIT"},dice);
 }
 assert.equal(s.round,target);return s;
};

test("approved SELF SELECT_TARGET -> APPLY_STATUS persists, displays and expires",()=>{
 const plan=compileCombatSkill(approved());
 assert.equal(plan.category,"SUPPORT");
 assert.equal(plan.executionEngine,"MODULAR");
 assert.equal(plan.approvedActivation.definitions[0].steps[1].kind,"APPLY_STATUS");
 const initial=duel(),before=structuredClone(initial);
 let s=cast(initial,plan);
 assert.deepEqual(initial,before,"all effects remain transaction-local");
 assert.equal(s.actors.PLAYER.magicDefense,12);
 assert.equal(s.actors.NPC.magicDefense,10,"opponent must remain untouched");
 assert.equal(s.mana.PLAYER.current,12);
 assert.equal(s.actors.PLAYER.spentAp,1);
 assert.equal(s.summonStatuses.length,1);
 assert.equal(s.summonStatuses[0].target,"PLAYER");
 assert.equal(s.summonStatuses[0].sourceSummonId,"SKILL:231");
 assert.equal(s.summonStatuses[0].expiresAtRound,3);
 assert.equal(s.skillCooldowns.PLAYER["231"],3);
 assert.match(activeCombatStatusViews(s,"PLAYER")[0].description,/Defensa mágica.*1,2|Defensa mágica.*1.2/);
 assert.equal(activeCombatStatusViews(s,"NPC").length,0);
 const visible=combatClientView(s);
 assert.equal(visible.summonStatuses?.length,1);
 assert.equal(JSON.stringify(visible).includes("SELF_STATUS"),false,
   "approved module definitions must stay private");
 s=JSON.parse(JSON.stringify(s));
 const duplicate=cast(s,plan);
 assert.deepEqual(duplicate,s,"repeated requestId never spends resources or applies a second status");
 s=advanceRound(s);
 assert.equal(s.round,2);
 assert.equal(s.actors.PLAYER.magicDefense,12);
 s=advanceRound(s);
 assert.equal(s.round,3);
 assert.equal(s.actors.PLAYER.magicDefense,10);
 assert.equal(activeCombatStatusViews(s,"PLAYER").length,0);
});

test("status BONUS can read and calculate the owner's real stat, never a client figure",()=>{
 const graph=micro("CALCULATED_SELF_STATUS",[
  {kind:"READ_STAT",actor:"USER",stat:"MAGIC_DEFENSE",output:"base"},
  {kind:"CALCULATE",expression:{operator:"PERCENT",
   args:[{source:"OUTPUT",key:"base"},20]},output:"amount"},
  {kind:"SELECT_TARGET",selector:"USER",output:"self"},
  {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"self"},
   stat:"MAGIC_DEFENSE",operation:"BONUS",
   value:{source:"OUTPUT",key:"amount"},durationTurns:2},
 ]);
 const plan=compileCombatSkill(approved(232,{effect:[graph]}));
 const s=cast(duel(),plan);
 assert.equal(s.actors.PLAYER.magicDefense,12);
 assert.equal(s.summonStatuses[0].value,2);
 assert.equal(s.summonStatuses[0].operation,"BONUS");
});

test("unsupported targets, forbidden stats and unpriced graphs fail closed",()=>{
 const invalid=[
  {effect:[micro("TARGET_RIVAL",[
    {kind:"SELECT_TARGET",selector:"OPPONENT",output:"other"},
    {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"other"},
     stat:"MAGIC_DEFENSE",operation:"BONUS",value:20,durationTurns:2},
   ])]},
  {effect:[selfStatus(3,"MULTIPLIER")]},
  {effect:[selfStatus(1.2,"MULTIPLIER",2,"RACE")]},
  {effect:[selfStatus(1.2,"MULTIPLIER",3)]},
  {effect:[selfStatus(-100,"BONUS")]},
  {effect:[{...selfStatus(),reviewedPch:undefined}]},
  {effect:[micro("FORGED_TARGET",[
    {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"self"},
     stat:"MAGIC_DEFENSE",operation:"BONUS",value:20,durationTurns:2},
   ])]},
 ];
 for(const [i,overrides] of invalid.entries()){
  const row=approved(300+i,overrides),source=duel(),before=structuredClone(source);
  if(i===1||i===4){
   const plan=compileCombatSkill(row);
   assert.throws(()=>cast(source,plan),/supera|permitido|límites/);
  }else{
   assert.equal(previewSkillExecution(row).executable,false);
   assert.throws(()=>compileCombatSkill(row));
  }
  assert.deepEqual(source,before,"invalid cast must not change mana, PA, stats or state");
 }
 assert.throws(()=>compileCombatSkill(approved(400),"LEGACY_ONLY"),/desactivadas/);
});

test("multiple statuses use bounded own-side records, no duplicate resource payment",()=>{
 const a=selfStatus(1.2,"MULTIPLIER",2,"MAGIC_DEFENSE");
 const b=micro("SECOND_STATUS",[
  {kind:"SELECT_TARGET",selector:"USER",output:"self"},
  {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"self"},stat:"PHYSICAL_DEFENSE",
   operation:"BONUS",value:4,durationTurns:2},
 ]);
 const plan=compileCombatSkill(approved(440,{effect:[a,b]}));
 const s=cast(duel(),plan);
 assert.equal(s.actors.PLAYER.magicDefense,12);
 assert.equal(s.actors.PLAYER.physicalDefense,16);
 assert.equal(s.summonStatuses.length,2);
 assert.equal(s.actors.PLAYER.spentAp,1);
 assert.equal(s.mana.PLAYER.current,12);
 assert.equal(s.log.at(-1).manaCost,8);
 const third=micro("THIRD_STATUS",[
  {kind:"SELECT_TARGET",selector:"USER",output:"self"},
  {kind:"APPLY_STATUS",target:{source:"OUTPUT",key:"self"},stat:"DODGE",
   operation:"BONUS",value:1,durationTurns:2},
 ]);
 assert.throws(()=>compileCombatSkill(approved(441,{effect:[a,b,third]})),/hasta dos estados/);
});
