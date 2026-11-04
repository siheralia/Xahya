import test from "node:test";
import assert from "node:assert/strict";
import {
 selectTrainingIdentity,allTrainingPerks,applyTrainingBasePerks,
 applyTrainingDerivedPerks,trainingResourceBonus,
} from "../lib/combat/training-identity.ts";

const perk=(id,name,effects,probability=0,active=true)=>({id,name,active,probability,effects});
const stat=(target,value)=>[{type:"STAT_BONUS",target,value}];
const catalog=[
 perk(1,"Fuerza racial",stat("STR",7)),
 perk(2,"Testarudo enano",stat("PHYSICAL_DEFENSE",10),7),
 perk(3,"Reflejos raciales",stat("DODGE",25)),
 perk(4,"Instinto racial narrativo",[{type:"NARRATIVE",target:"RACE",value:1}]),
 perk(5,"Fuerte",stat("STR",10),10),
 perk(6,"Maná Masivo",[{type:"RESOURCE_BONUS",target:"MANA",value:100}],"8"),
 perk(7,"HP Masivo",[{type:"RESOURCE_BONUS",target:"HP",value:100}],8),
 perk(8,"Karma Extra",[{type:"RESOURCE_BONUS",target:"KARMA",value:100}],9),
 perk(9,"Nada",[],50),
 perk(10,"Perk general al 0%",stat("STR",99),0),
 perk(11,"General desactivado",stat("STR",3),50,false),
 perk(12,"Agilidad felina",stat("AGI",10),5),
 perk(13,"Pisada sin eco sombría",stat("AGI",5),0),
];
const links=[
 {raceId:4,perkId:1},{raceId:4,perkId:2},
 {raceId:4,perkId:3},{raceId:4,perkId:4},
 {raceId:5,perkId:12},{raceId:15,perkId:13},
];
const enano=[{id:4,name:"Enano",active:true}];

test("receives all racial perks (including 0%) plus 3 positive-probability non-racial perks",()=>{
 const profile=selectTrainingIdentity(enano,catalog,links,()=>0);
 assert.equal(profile.race.name,"Enano");
 assert.deepEqual(profile.racialPerks.map(p=>p.id),[1,2,3,4]);
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

test("Sombrío cannot draw Enano or Felino perks, even if their chance is >0%",()=>{
 const profile=selectTrainingIdentity([{id:15,name:"Sombrío",active:true}],catalog,links,()=>0.99999);
 assert.deepEqual(profile.racialPerks.map(p=>p.id),[13]);
 assert.equal(profile.extraPerks.length,3);
 assert.ok(profile.extraPerks.every(p=>![1,2,3,4,9,10,11,12,13].includes(p.id)));
 assert.equal(new Set(profile.extraPerks.map(p=>p.id)).size,3);
});

test("unsupported GENERAL perks can be drawn but do not invent combat effects",()=>{
 const sequence=[0,0.999999,0,0];
 const profile=selectTrainingIdentity(enano,catalog,links,()=>sequence.shift()??0);
 assert.equal(profile.extraPerks[0].id,8);
 assert.equal(profile.extraPerks[0].mechanical,false);
 assert.deepEqual(profile.extraPerks[0].effects,[]);
 assert.equal(trainingResourceBonus(profile.extraPerks,"HP"),0);
});

test("positive probabilities are weighted, with 3 draws without replacement",()=>{
 const pool=[
  perk(5,"Fuerte",stat("STR",10),10),
  perk(6,"Maná",[{type:"RESOURCE_BONUS",target:"MANA",value:100}],40),
  perk(7,"HP",[{type:"RESOURCE_BONUS",target:"HP",value:100}],50),
 ];
 const rolls=[0,0.15,0.9,0];
 const profile=selectTrainingIdentity([{id:15,name:"Sombrío",active:true}],pool,[],()=>rolls.shift()??0);
 assert.deepEqual(profile.extraPerks.map(p=>p.id),[6,7,5]);
 assert.deepEqual(profile.racialPerks,[]);
});

test("catalog remains unchanged; empty Nada, 0%, inactive and all racial entries are excluded",()=>{
 const before=JSON.stringify(catalog);
 const profile=selectTrainingIdentity(enano,catalog,links,()=>0.3);
 assert.ok(profile.extraPerks.every(p=>[5,6,7,8].includes(p.id)));
 assert.equal(JSON.stringify(catalog),before);
 assert.throws(()=>selectTrainingIdentity(enano,[
  perk(1,"Racial",stat("STR",5),0),
  perk(2,"Dwarf",stat("CON",5),7),
  perk(5,"Fuerte",stat("STR",10),10),
  perk(6,"Mana",[{type:"RESOURCE_BONUS",target:"MANA",value:100}],8),
  perk(9,"Nada",[],50),
  perk(10,"Cero",stat("STR",5),0),
 ],links,()=>0),/tres perks generales/);
});


test("ghost NPC keeps combat damage perks even when floating is maze-only (encounter 46)",()=>{
 const ghostEffects=[
   {type:"DAMAGE_REDUCTION",target:"PHYSICAL",value:10},
   {type:"DAMAGE_INCREASE",target:"MAGICAL",value:300},
   {type:"MAZE_UTILITY",target:"FLOATING",value:0},
 ];
 const pool=[
   perk(16,"Cuerpo ethereo",ghostEffects),
   perk(5,"Fuerte",stat("STR",10),10),
   perk(6,"Mana",[{type:"RESOURCE_BONUS",target:"MANA",value:100}],10),
   perk(7,"HP",[{type:"RESOURCE_BONUS",target:"HP",value:100}],10),
 ];
 const profile=selectTrainingIdentity([{id:4,name:"Fantasma",active:true}],pool,
   [{raceId:4,perkId:16}],()=>0);
 assert.equal(profile.racialPerks.length,1);
 assert.equal(profile.racialPerks[0].mechanical,true);
 assert.deepEqual(profile.racialPerks[0].effects,ghostEffects.slice(0,2));
 assert.equal(allTrainingPerks(profile).length,4);
});

test("partially supported perks preserve only valid combat effects",()=>{
 const pool=[
   perk(16,"Racial mezclada",[
     {type:"NARRATIVE",target:"OTHER",value:1},
     {type:"DAMAGE_REDUCTION",target:"PHYSICAL",value:10},
     {type:"DAMAGE_INCREASE",target:"MAGICAL",value:99999},
     {type:"MAZE_UTILITY",target:"FLOATING",value:0},
   ]),
   perk(5,"Fuerte",stat("STR",10),10),
   perk(6,"Mana",[{type:"RESOURCE_BONUS",target:"MANA",value:100}],10),
   perk(7,"HP",[{type:"RESOURCE_BONUS",target:"HP",value:100}],10),
 ];
 const profile=selectTrainingIdentity([{id:4,name:"Fantasma",active:true}],pool,
   [{raceId:4,perkId:16}],()=>0);
 assert.deepEqual(profile.racialPerks[0].effects,[
   {type:"DAMAGE_REDUCTION",target:"PHYSICAL",value:10}
 ]);
 assert.equal(profile.racialPerks[0].mechanical,true);
});
