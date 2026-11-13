import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newCombatState} from "../lib/combat/turn-engine.ts";
import {publicV2CombatState} from "../lib/combat/timeline-client-projection.ts";

const fighter=(name,id,x)=>({
 name,characterId:id,hp:100,maxHp:100,
 agility:100,speedValue:100,strength:20,constitution:15,precision:50,
 dodge:20,physicalAttack:30,physicalDefense:10,
 magicAttack:30,magicDefense:15,critical:0,luck:10,race:20,
 massKg:70,positionMeters:x,attackType:"BLUNT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,weaponIntegrity:100,
 equippedWeapon:{
  name:"Espada",itemId:123,characterItemId:id*1000,
  mode:"MELEE",attackType:"CUT",effectiveRangeMeters:1.5,
  maximumRangeMeters:1.5,durability:89,
  autoRepair:{intervalTurns:1,repairAmount:4,manaCost:1},
 },
});
const potion=(owner,i)=>({
 characterItemId:owner*1000+i,itemId:i,name:"Secreto "+i,
 quantity:3,amount:10,action:"HEAL_HP",
});
const setup=()=>{
 const c=newCombatState(fighter("Alfa",11,0),fighter("Beta",22,1),"PLAYER",true);
 c.timelineMode="SHARED";
 c.consumables={PLAYER:[potion(11,1)],NPC:[potion(22,2)]};
 c.combatCharges={PLAYER:{LUNAR_CHARGES:3},NPC:{LUNAR_CHARGES:6}};
 c.skillCooldowns={PLAYER:{"101":4},NPC:{"202":5}};
 c.processedSkillRequests=["server-skill-token"];
 c.processedItemRequests=["server-item-token"];
 c.processedKarmaRequests=["server-karma-token"];
 c.itemRepairsThisRound=[{by:"NPC",characterItemId:22000,restored:1,round:1}];
 c.mirrorRayQueue=["server-private-ray"];
 c.trainingNpc={difficulty:"BASIC",race:{id:1,name:"Raza"},
   skills:[{name:"ENTIRE_PRIVATE_SKILL_PLAN",cost:0}]};
 c.summons=[{
   owner:"NPC",id:"secret-summon",sourceSkillId:202,
   entityKey:"hidden",label:"Protector",integrity:40,
   fieldPosition:{x:1,y:1},createdRound:1,expiresAtRound:4,
   controlRangeMeters:5,maintenanceMana:0,hitCount:0,hitLimit:3,
   links:[{mode:"FIXED",destStat:"AGI",value:100}],
   contactEffects:[{kind:"INVERT_STATUS",target:"USER",
     selection:"LATEST_DEBUFF",manaCost:5}],
   behavior:{mode:"HOLD",allowedModes:["HOLD"],target:"USER",trigger:"COMMAND"},
   charges:{LUNAR_CHARGES:2},chargesMigrated:true,
   autoRound:1,autoSpentAp:0,autoNextTick:10,
 }];
 return c;
};

test("the player gets their own consumables and charge pool, not the rival's",()=>{
 const state=setup(),frozen=structuredClone(state);
 const view=publicV2CombatState(state,"PLAYER");
 assert.equal(view.consumables.PLAYER.length,1);
 assert.deepEqual(view.consumables.NPC,[]);
 assert.equal(view.combatCharges.PLAYER.LUNAR_CHARGES,3);
 assert.equal(view.combatCharges.NPC,undefined);
 assert.deepEqual(view.skillCooldowns,{PLAYER:{"101":4}});
 assert.equal(view.actors.PLAYER.equippedWeapon.characterItemId,11000);
 assert.equal(view.actors.NPC.equippedWeapon.characterItemId,undefined);
 assert.equal(view.actors.NPC.equippedWeapon.autoRepair,undefined);
 assert.deepEqual(view.summons[0].links,[]);
 assert.deepEqual(view.summons[0].contactEffects,[]);
 assert.deepEqual(view.summons[0].charges,{});
 assert.equal(view.trainingNpc,undefined);
 assert.equal(view.itemRepairsThisRound,undefined);
 assert.equal(view.mirrorRayQueue,undefined);
 assert.equal(view.processedSkillRequests,undefined);
 assert.equal(view.processedItemRequests,undefined);
 assert.equal(view.processedKarmaRequests,undefined);
 assert.equal(view.actors.NPC.hp,state.actors.NPC.hp);
 assert.equal(view.actors.NPC.positionMeters,state.actors.NPC.positionMeters);
 assert.deepEqual(state,frozen,"the authoritative snapshot must never be mutated");
});

test("the second owner receives only their own real inventory",()=>{
 const view=publicV2CombatState(setup(),"NPC");
 assert.deepEqual(view.consumables.PLAYER,[]);
 assert.equal(view.consumables.NPC[0].characterItemId,22002);
 assert.equal(view.actors.PLAYER.equippedWeapon.characterItemId,undefined);
 assert.equal(view.actors.NPC.equippedWeapon.characterItemId,22000);
 assert.equal(view.combatCharges.NPC.LUNAR_CHARGES,6);
 assert.equal(view.combatCharges.PLAYER,undefined);
});

test("a management spectator sees no character inventory, replay tokens or formulas",()=>{
 const view=publicV2CombatState(setup(),"SPECTATOR");
 const json=JSON.stringify(view);
 for(const secret of ["server-skill-token","server-item-token","server-private-ray",
   "ENTIRE_PRIVATE_SKILL_PLAN","LUNAR_CHARGES","characterItemId",
   'contactEffects":[{"kind":"INVERT_STATUS"'])
   assert.ok(!json.includes(secret),"secret leaked: "+secret);
 assert.equal(view.actors.PLAYER.name,"Alfa");
 assert.equal(view.actors.NPC.name,"Beta");
});

test("V2 and legacy combat read paths use the same strict security projection",()=>{
 for(const path of [
   "app/api/combat/[id]/timeline/route.ts",
   "app/api/combat/[id]/route.ts",
   "app/api/combat/duels/route.ts",
 ]){
   const text=readFileSync(new URL("../"+path,import.meta.url),"utf8");
   assert.match(text,/publicV2CombatState\(/);
 }
 const duels=readFileSync(new URL(
   "../app/api/combat/duels/route.ts",import.meta.url),"utf8");
 assert.match(duels,/experiment&&Number\(rival\.userId\)===Number\(character\.userId\)/);
});
