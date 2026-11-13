import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {compileCombatSkill} from "../lib/combat/skill-casting.ts";
import {applySummonStatus} from "../lib/combat/summon-status.ts";
import {newTimelineDeclarationSession,declareTimelineCommand}
 from "../lib/combat/timeline-declarations.ts";
import {resolveBasicTimelineWindow}
 from "../lib/combat/timeline-basic-actions.ts";
import {parseExperimentalV2Command}
 from "../lib/combat/timeline-experiment.ts";
const fighter=(name,x)=>({
 name,characterId:null,hp:180,maxHp:180,agility:100,speedValue:100,
 strength:80,constitution:16,precision:50,dodge:40,
 physicalAttack:60,physicalDefense:20,magicAttack:40,magicDefense:10,
 critical:0,luck:10,race:20,massKg:70,positionMeters:x,
 weaponIntegrity:100,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,
});
const battle=()=>{
 const c=newCombatState(fighter("Invocadora",0),fighter("Rival",1.5),"PLAYER",true);
 c.timelineMode="SHARED";
 c.mana={PLAYER:{current:100,max:100},NPC:{current:100,max:100}};
 return c;
};
const graph=steps=>({type:"COMPOSED",module:{
 id:"LUNAR_V2",name:"Sobreflujo Lunar",type:"COMPOSED",
 description:"",trigger:"ACTIVATE",steps,
}});
const consume={kind:"CONSUME_COMBAT_CHARGES",accumulator:"LUNAR_CHARGES",
 minCharges:1,maxCharges:6,manaCost:30,output:"spentLunarCharges"};
const buff={kind:"APPLY_CHARGE_BUFF",
 charges:{source:"OUTPUT",key:"spentLunarCharges"},
 stats:["STR","AGI","DODGE"],perChargePercent:25,durationTurns:2};
const plan=compileCombatSkill({
 id:921,name:"Sobreflujo Lunar",status:"APPROVED",category:"UTILITY",
 cost:30,maintenanceCost:0,duration:"2 turnos",cooldown:"Sin cooldown",
 effect:[graph([consume,buff])],
});
const dice=()=>({hit:.1,critical:.9,defense:.9});
const chargeCommand=(number,id="v2-lunar-charge-00001")=>({
 kind:"CAST_SKILL",skillId:921,requestId:id,chargesToSpend:number,
});
const summon=()=>({
 id:"PLAYER:211:follow-ally",owner:"PLAYER",sourceSkillId:211,
 entityKey:"BNUUY_INVERTER",label:"Bnuuy protector",
 fieldPosition:{x:.2,y:0},createdRound:1,expiresAtRound:5,
 controlRangeMeters:15,maintenanceMana:0,integrity:50,hitCount:0,hitLimit:3,
 links:[{mode:"FIXED",destStat:"PHYSICAL_ATTACK",value:10},
   {mode:"FIXED",destStat:"AGI",value:100},
   {mode:"FIXED",destStat:"INTEGRITY",value:50}],
 behavior:{mode:"FOLLOW",allowedModes:["FOLLOW","HOLD"],
   target:"USER",trigger:"CONTACT"},
 contactEffects:[{kind:"INVERT_STATUS",target:"USER",
   selection:"LATEST_DEBUFF",manaCost:5,chargeAccumulator:"LUNAR_CHARGES"}],
 charges:{},chargesMigrated:true,autoNextTick:15,autoRound:1,autoSpentAp:0,
});
test("charge buff reserves one PA, debits owner wallet once at tick end",async()=>{
 const c=battle();c.combatCharges={PLAYER:{LUNAR_CHARGES:6},NPC:{}};
 const original=structuredClone(c);
 let s=declareTimelineCommand(newTimelineDeclarationSession(c),
   c,"PLAYER",chargeCommand(2),"charge",{approvedSkill:plan});
 s=declareTimelineCommand(s,c,"NPC",{kind:"WAIT"},"wait");
 assert.equal(c.combatCharges.PLAYER.LUNAR_CHARGES,6);
 const result=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(result.combat.tick,10);
 assert.equal(result.combat.combatCharges.PLAYER.LUNAR_CHARGES,4);
 assert.equal(result.combat.mana.PLAYER.current,70);
 assert.equal(result.combat.actors.PLAYER.strength,120);
 assert.equal(result.combat.actors.PLAYER.agility,150);
 assert.equal(result.combat.actors.PLAYER.dodge,60);
 assert.equal(result.combat.summonStatuses.length,3);
 assert.equal(result.timeline.clock.actors.PLAYER.spentApByRound["1"],1);
 assert.deepEqual(c,original);
 assert.equal(declareTimelineCommand(result.timeline,result.combat,
   "PLAYER",chargeCommand(2),"charge",{approvedSkill:plan}),result.timeline);
});

test("a following creature earns one lunar charge only after real status inversion",async()=>{
 const c=battle();c.summons=[summon()];
 applySummonStatus(c,{
   id:"V2_HOSTILE:debuff-for-bnuuy",sourceSummonId:"SKILL:211",
   by:"NPC",target:"PLAYER",stat:"AGI",
   operation:"MULTIPLIER",value:.8,durationTurns:2,
 });
 assert.equal(c.actors.PLAYER.agility,80);
 const original=structuredClone(c);
 let s=newTimelineDeclarationSession(c);
 s=declareTimelineCommand(s,c,"PLAYER",{kind:"WAIT"},"wait-hero");
 s=declareTimelineCommand(s,c,"NPC",{kind:"WAIT"},"wait-rival");
 const tick=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(tick.combat.tick,15);
 assert.equal(tick.combat.actors.PLAYER.agility,120);
 assert.equal(tick.combat.mana.PLAYER.current,95,
   "the official contact pays exactly five mana");
 assert.equal(tick.combat.combatCharges.PLAYER.LUNAR_CHARGES,1);
 assert.equal(tick.combat.summonStatuses[0].value,1.2);
 assert.equal(tick.timeline.clock.actors.PLAYER.spentApByRound["1"]??0,0,
   "the familiar did not spend a second owner PA");
 assert.deepEqual(c,original);
});

test("no weakened status means no free inversion, mana or charge",async()=>{
 const c=battle();c.summons=[summon()];
 let s=newTimelineDeclarationSession(c);
 s=declareTimelineCommand(s,c,"PLAYER",{kind:"WAIT"},"wait-hero");
 s=declareTimelineCommand(s,c,"NPC",{kind:"WAIT"},"wait-rival");
 const out=await resolveBasicTimelineWindow(c,s,dice);
 assert.equal(out.combat.tick,15);
 assert.equal(out.combat.mana.PLAYER.current,100);
 assert.equal(out.combat.combatCharges?.PLAYER?.LUNAR_CHARGES??0,0);
});

test("insufficient wallet and forged counts reject before the shared PA is reserved",()=>{
 const c=battle();c.combatCharges={PLAYER:{LUNAR_CHARGES:2}};
 const t=newTimelineDeclarationSession(c);
 assert.throws(()=>declareTimelineCommand(t,c,"PLAYER",
   chargeCommand(3),"bad-charge",{approvedSkill:plan}),/cargas/);
 assert.throws(()=>parseExperimentalV2Command(chargeCommand(7)),/V2/);
 assert.throws(()=>parseExperimentalV2Command({
   ...chargeCommand(2),multiplier:99}),/V2/);
 assert.equal(t.clock.events.length,0);
});

test("charge bonus remains eligible at later ticks and is never a free permanent stat",async()=>{
 const c=battle();c.combatCharges={PLAYER:{LUNAR_CHARGES:4}};
 let t=newTimelineDeclarationSession(c);
 t=declareTimelineCommand(t,c,"PLAYER",
   chargeCommand(1),"buff-1",{approvedSkill:plan});
 t=declareTimelineCommand(t,c,"NPC",{kind:"WAIT"},"npc-wait");
 const first=await resolveBasicTimelineWindow(c,t,dice);
 const ongoing=declareTimelineCommand(first.timeline,first.combat,
   "PLAYER",{kind:"WAIT"},"hero-long-wait");
 const second=await resolveBasicTimelineWindow(first.combat,ongoing,dice);
 assert.ok(second.combat.tick>first.combat.tick,
   "an active charge status must not block future timeline actions");
 assert.ok(second.combat.summonStatuses.some(x=>x.id.startsWith("V2_CHARGE:")));
});
