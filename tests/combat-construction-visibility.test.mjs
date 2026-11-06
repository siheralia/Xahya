import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {availableConstructionMaterials,projectApprovedCombatSkills} from "../lib/combat/skill-preview.ts";

const create=(id,element)=>({
 id,name:"Construcción "+id,status:"APPROVED",category:"UTILITY",
 cost:0,condition:null,mechanics:{},effect:[{
  type:"NARRATIVE",value:1,target:"CARD:W002",element,capability:"CREATE",
 }],
});
const normal={id:4,name:"Golpe",status:"APPROVED",category:"OFFENSIVE",cost:0,
 attackType:"BLUNT",areaOfEffect:"Objetivo único | Alcance máximo: 2 m",
 duration:"Instantánea",effect:[{type:"DAMAGE_MULTIPLIER",target:"PHYSICAL_ATTACK",value:100}],
 mechanics:{}};
const projection=(skills,stolen=new Set(),requirements=()=>true)=>
 projectApprovedCombatSkills(skills,[],stolen,requirements);

test("object builder is unavailable to players without an approved usable CREATE skill",()=>{
 assert.deepEqual(availableConstructionMaterials([]),[]);
 assert.deepEqual(availableConstructionMaterials(projection([normal])),[]);
 assert.deepEqual(availableConstructionMaterials(projection([{...create(1,"LIGHT"),status:"PENDING"}])),[]);
 assert.deepEqual(availableConstructionMaterials(projection([create(1,"LIGHT")],new Set([1]))),[]);
 assert.deepEqual(availableConstructionMaterials(projection([create(1,"LIGHT")],new Set(),()=>false)),[]);
});

test("object builder recognizes generic CREATE materials from available skill effects",()=>{
 const roster=projection([normal,create(10,"LIGHT"),create(11,"EARTH"),create(12,"LIGHT")]);
 assert.deepEqual(availableConstructionMaterials(roster).sort(),["EARTH","LIGHT"]);
 assert.equal(availableConstructionMaterials(projection([create(13,"LIGHT")]))[0],"LIGHT");
 assert.equal(availableConstructionMaterials(projection([create(14,"EARTH")]))[0],"EARTH");
});

test("unsupported narrative effects and abilities without executable construction do not expose the builder",()=>{
 const unsupported={...create(20,"LIGHT"),effect:[{type:"NARRATIVE",value:1,capability:"ILLUSION",element:"LIGHT"}]};
 const notYetImplemented={...create(21,"LIGHT"),mechanics:{rules:[{event:"ACTIVATE",actions:[{kind:"UNSUPPORTED"}]}]}};
 assert.deepEqual(availableConstructionMaterials(projection([unsupported,notYetImplemented])),[]);
});

test("construction panel requires eligible CREATE skills, is generic, and keeps existing structures visible",()=>{
 const parent=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
 const child=readFileSync(new URL("../app/combat/[id]/CombatSkillLoadout.tsx",import.meta.url),"utf8");
 assert.match(parent,/const canCreateObjects=hasAccess&&creationMaterials\.length>0/);
 assert.match(parent,/open=\{constructionOptionsOpen&&panel==="construction"\}/);
 assert.match(parent,/\(state\.constructions\?\?\[\]\)\.length>0/);
 assert.match(parent,/canCreateMaterialBlocks&&<label className="mt-3 block text-sm">/);
 assert.match(parent,/onConstructionMaterialsChange=\{onConstructionMaterialsChange\}/);
 assert.match(child,/availableConstructionMaterials\(skills\[side\]\?\?\[\]\)/);
 const description=parent.split("\n").find(line=>line.includes("Las propiedades dependen del material"))??"";
 assert.match(description,/Las propiedades dependen del material/);
 assert.doesNotMatch(description,/Fotoconstrucción|Sikatā|Sikata|Espejo mágico/i);
});
