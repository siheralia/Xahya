import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {approvedPassiveMicroSnapshot}
 from "../lib/combat/approved-passive-micro.ts";
import {newCombatState,installEncounterMicroEffects}
 from "../lib/combat/turn-engine.ts";
import {newTimelineDeclarationSession,declareTimelineCommand}
 from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow,assertBasicTimelineEligible}
 from "../lib/combat/timeline-basic-actions.ts";
import {combatClientView} from "../lib/combat/magic-area.ts";

const condition=(key,compare,right)=>[{
 left:{source:"CHARGES",key},compare,right,
}];
const module=(id,trigger,steps)=>({
 type:"COMPOSED",reviewedPch:10,
 module:{id,name:id,type:"PASSIVE",description:"Revisado",
   trigger,steps},
});
const approved=characterId=>({
 id:71,characterId,status:"APPROVED",approvedAt:"2026-11-09",
 category:"PASSIVE",name:"Piel resonante",cost:0,maintenanceCost:0,
 accumulationCost:0,accumulationPerTick:0,pchCost:38,
 mechanics:{},condition:"",effectRequirements:[],
 effect:[
  module("stored","DAMAGE_RESOLVED",[{
   kind:"STORE",accumulator:"MITIGATION",capacity:5,
   value:{source:"EVENT",key:"MITIGATED_DAMAGE"},
  }]),
  module("resist","PASSIVE",[{
   kind:"MODIFIER",stat:"RESISTANCE",multiplier:1.3,
   when:condition("MITIGATION","EQ",0),
  }]),
  module("regen","TURN_START",[{
   kind:"HEAL",amount:{operator:"PERCENT",
     args:[{source:"STAT",key:"MAX_HP"},10]},
   when:condition("MITIGATION","GTE",1),
  }]),
 ],
});
const fighter=(name,id,x)=>({
 characterId:id,name,hp:100,maxHp:100,agility:60,speedValue:80,
 strength:20,constitution:10,precision:80,dodge:15,
 physicalAttack:50,physicalDefense:20,magicAttack:20,magicDefense:20,
 critical:0,luck:10,race:20,massKg:70,positionMeters:x,attackType:"BLUNT",
 defenseType:"SOLID",weaponIntegrity:100,spentTicks:0,spentAp:0,
 equippedWeapon:{name:"Maza",mode:"MELEE",attackType:"BLUNT",
   effectiveRangeMeters:2,maximumRangeMeters:2},
});
const duel=()=>newCombatState(fighter("A",11,0),fighter("B",22,1.5));
const dice=()=>({hit:.01,critical:.99,defense:.99});
const addPassive=(c,side,id)=>{
 const choice=approvedPassiveMicroSnapshot(id,[approved(id)],[],new Set());
 assert.equal(choice.skillIds.length,1);
 return installEncounterMicroEffects(c,side,choice.definitions);
};
const attack={kind:"ATTACK",attackType:"BLUNT",
 attackSource:"MAIN_HAND",trajectory:[{x:.1,y:.5},{x:.5,y:.5}]};
const declaration=(c,player=attack,npc={kind:"WAIT"})=>{
 let t=newTimelineDeclarationSession(c);
 t=declareTimelineCommand(t,c,"PLAYER",player,"p");
 t=declareTimelineCommand(t,c,"NPC",npc,"n");
 return t;
};

test("approved passive mitigates before its V2 hit and charges only after contact",async()=>{
 const base=duel();base.timelineMode="SHARED";
 const withPassive=addPassive(duel(),"NPC",22);
 withPassive.timelineMode="SHARED";
 assert.doesNotThrow(()=>assertBasicTimelineEligible(withPassive));
 const before=structuredClone(withPassive);
 const ordinary=await resolveBasicTimelineWindow(base,declaration(base),dice);
 const gained=await resolveBasicTimelineWindow(withPassive,
   declaration(withPassive),dice);
 assert.equal(ordinary.combat.tick,gained.combat.tick);
 assert.ok(gained.combat.actors.NPC.hp>=ordinary.combat.actors.NPC.hp,
   "paid passive resistance never increases incoming damage");
 assert.ok(gained.combat.actors.NPC.hp<100);
 assert.equal(gained.combat.microEffects.state.accumulators[
   "2:S71_CHARGE"].charges.length,1);
 assert.ok(gained.combat.microEffects.state.accumulators[
   "2:S71_CHARGE"].charges[0]>0);
 assert.equal(gained.combat.microEffects.state.processed.length,1);
 assert.deepEqual(withPassive,before);
 assert.equal(combatClientView(gained.combat).microEffects,undefined);
});

test("one passive regeneration occurs exactly on crossing tick 100",async()=>{
 let c=addPassive(duel(),"NPC",22);
 c.timelineMode="SHARED";
 let r=await resolveBasicTimelineWindow(c,declaration(c),dice);
 const hurt=r.combat.actors.NPC.hp;
 r=await resolveBasicTimelineWindow(r.combat,
   declareTimelineCommand(r.timeline,r.combat,"PLAYER",
     {kind:"WAIT"},"player-wait-next"),dice);
 assert.equal(r.combat.tick,100);
 assert.equal(r.combat.actors.NPC.hp,Math.min(100,hurt+10));
 assert.equal(r.combat.log.filter(x=>x.kind==="REGEN").length,1);
 assert.equal(r.combat.microEffects.state.accumulators[
   "2:S71_CHARGE"].charges.length,1);
 assert.ok(r.combat.narrativeHistory.some(x=>x.kind==="REGEN"));
});

test("simultaneous opposite attacks never read the other impact's newly added charge",async()=>{
 let c=duel();c.timelineMode="SHARED";
 c=addPassive(c,"PLAYER",11);
 c=addPassive(c,"NPC",22);
 // Install a different skill namespace on the PLAYER for this fixture.
 // Only the event-owner prefix needs to differ; combat pools remain isolated.
 let t=newTimelineDeclarationSession(c);
 t=declareTimelineCommand(t,c,"PLAYER",attack,"player-attack");
 t=declareTimelineCommand(t,c,"NPC",attack,"npc-attack");
 const out=await resolveBasicTimelineWindow(c,t,dice);
 assert.ok(out.combat.actors.PLAYER.hp<100);
 assert.ok(out.combat.actors.NPC.hp<100);
 assert.ok(out.combat.microEffects.state.accumulators["1:S71_CHARGE"]);
 assert.ok(out.combat.microEffects.state.accumulators["2:S71_CHARGE"]);
 assert.equal(out.combat.microEffects.state.processed.length,2);
 assert.ok(out.combat.tick>=10&&out.combat.tick<100);
});

test("unapproved micro graphs fail closed at the V2 encounter boundary",()=>{
 const c=duel();
 c.microEffects={definitions:{PLAYER:[{
   id:"rogue",name:"Sin revisar",type:"COMPOSED",
   description:"",trigger:"TURN_START",
   steps:[{kind:"HEAL",amount:100}],
 }]},state:{accumulators:{},processed:[]},sequence:0};
 assert.throws(()=>assertBasicTimelineEligible(c),
   /pasiva|revisado/i);
});
test("passive snapshots are server-owned and reused only within shared tick batches",()=>{
 const duels=readFileSync(new URL("../app/api/combat/duels/route.ts",
   import.meta.url),"utf8");
 const batch=readFileSync(new URL("../lib/combat/timeline-batch-resolver.ts",
   import.meta.url),"utf8");
 assert.match(duels,/initial=await snapshotApprovedEncounterPassives\(initial\)/);
 assert.match(batch,/applyV2ApprovedPassiveRoundStart\(state\)/);
 assert.match(batch,/applyV2ApprovedPassiveContact\(next,entry\)/);
});
