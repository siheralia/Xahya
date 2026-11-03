import test from "node:test";
import assert from "node:assert/strict";
import {selectTrainingIdentity,applyTrainingBasePerks,applyTrainingDerivedPerks} from "../lib/combat/training-identity.ts";
const perks=[
 {id:1,name:"Fuerza racial",active:true,effects:[{type:"STAT_BONUS",target:"STR",value:7}]},
 {id:2,name:"Resistencia racial",active:true,effects:[{type:"STAT_BONUS",target:"PHYSICAL_DEFENSE",value:10}]},
 {id:3,name:"Reflejos generales",active:true,effects:[{type:"STAT_BONUS",target:"DODGE",value:25}]},
 {id:4,name:"Agilidad general",active:true,effects:[{type:"STAT_BONUS",target:"AGI",value:4}]},
 {id:5,name:"Narrativa sin resolver",active:true,effects:[{type:"NARRATIVE",target:"DODGE",value:20}]},
];
test("NPC receives exactly three unique compatible perks, prioritizing its race",()=>{
 const profile=selectTrainingIdentity([{id:4,name:"Enano",active:true}],perks,
  [{raceId:4,perkId:1},{raceId:4,perkId:2}],()=>0);
 assert.equal(profile.race.name,"Enano");
 assert.equal(profile.perks.length,3);
 assert.equal(new Set(profile.perks.map(p=>p.id)).size,3);
 assert.deepEqual(profile.perks.slice(0,2).map(p=>p.id),[1,2]);
 assert.ok(!profile.perks.some(p=>p.id===5));
 const original={strength:20,constitution:10,agility:12};
 const base=applyTrainingBasePerks(original,profile.perks);
 assert.equal(base.strength,27);
 assert.equal(original.strength,20);
 const derived=applyTrainingDerivedPerks({physicalDefense:5,dodge:12,maxHp:50},profile.perks);
 assert.equal(derived.physicalDefense,15);
 assert.notEqual(derived.dodge,undefined);
});
test("does not mutate database snapshots and fails closed on insufficient traits",()=>{
 assert.throws(()=>selectTrainingIdentity([{id:1,name:"Solo",active:true}],perks.slice(0,2),[],()=>0),/tres perks/);
 assert.equal(perks[0].effects[0].value,7);
});
