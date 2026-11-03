import test from "node:test";
import assert from "node:assert/strict";
import {
 selectTrainingIdentity,allTrainingPerks,applyTrainingBasePerks,
 applyTrainingDerivedPerks,trainingResourceBonus,
} from "../lib/combat/training-identity.ts";

const perk=(id,name,effects)=>({id,name,active:true,effects});
const stat=(target,value)=>[{type:"STAT_BONUS",target,value}];
const catalog=[
 perk(1,"Fuerza racial",stat("STR",7)),
 perk(2,"Resistencia racial",stat("PHYSICAL_DEFENSE",10)),
 perk(3,"Resistencia extra racial",stat("DODGE",25)),
 perk(4,"Instinto racial sin resolutor",[{type:"NARRATIVE",target:"RACE",value:1}]),
 perk(5,"Fuerte",stat("STR",10)),
 perk(6,"Maná Masivo",[{type:"RESOURCE_BONUS",target:"MANA",value:100}]),
 perk(7,"HP Masivo",[{type:"RESOURCE_BONUS",target:"HP",value:100}]),
 perk(8,"Narrativa no compatible",[{type:"NARRATIVE",target:"HP",value:20}]),
];

test("race receives ALL of its native perks plus exactly three nonduplicated catalog perks",()=>{
 const profile=selectTrainingIdentity([{id:4,name:"Enano",active:true}],catalog,
  [{raceId:4,perkId:1},{raceId:4,perkId:2},{raceId:4,perkId:3},{raceId:4,perkId:4}],()=>0);
 assert.equal(profile.race.name,"Enano");
 assert.deepEqual(profile.racialPerks.map(p=>p.id),[1,2,3,4]);
 assert.equal(profile.extraPerks.length,3);
 assert.deepEqual(profile.extraPerks.map(p=>p.id),[5,6,7]);
 assert.equal(new Set(allTrainingPerks(profile).map(p=>p.id)).size,7);
 assert.equal(profile.racialPerks[3].mechanical,false);
 assert.deepEqual(profile.racialPerks[3].effects,[]);
 const npcPerks=allTrainingPerks(profile);
 const original={strength:20,constitution:10,agility:12};
 const base=applyTrainingBasePerks(original,npcPerks);
 assert.equal(base.strength,37);
 assert.equal(original.strength,20);
 const fighter={physicalDefense:5,dodge:12,maxHp:50};
 const derived=applyTrainingDerivedPerks(fighter,npcPerks);
 assert.equal(derived.physicalDefense,15);
 assert.equal(derived.dodge,37);
 assert.equal(fighter.physicalDefense,5);
 assert.equal(trainingResourceBonus(npcPerks,"HP"),100);
 assert.equal(trainingResourceBonus(npcPerks,"MANA"),100);
});

test("racial perks remain intrinsic even if unsupported; extras never overlap racial IDs",()=>{
 const profile=selectTrainingIdentity([{id:9,name:"Fantasma",active:true}],catalog,
  [{raceId:9,perkId:4}],()=>0);
 assert.equal(profile.racialPerks.length,1);
 assert.equal(profile.racialPerks[0].mechanical,false);
 assert.equal(profile.extraPerks.length,3);
 assert.ok(profile.extraPerks.every(p=>p.id!==4));
 assert.ok(profile.extraPerks.every(p=>p.mechanical));
});

test("selection does not alter the catalog or admit unsupported extras",()=>{
 const before=JSON.stringify(catalog);
 const noExtras=selectTrainingIdentity([{id:1,name:"Uno",active:true}],catalog,
  [{raceId:1,perkId:1}],()=>0);
 assert.ok(!noExtras.extraPerks.some(p=>p.id===8));
 assert.equal(JSON.stringify(catalog),before);
 assert.throws(()=>selectTrainingIdentity([{id:1,name:"Uno",active:true}],
  catalog.slice(0,5),[{raceId:1,perkId:1},{raceId:1,perkId:2},{raceId:1,perkId:3}],()=>0),
 /tres perks adicionales/);
});
