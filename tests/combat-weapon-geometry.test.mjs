import test from "node:test";
import assert from "node:assert/strict";
import {newCombatState,applyCombatCommand} from "../lib/combat/turn-engine.ts";
import {geometricContact} from "../lib/combat/geometry.ts";

const f=(name,positionMeters=0,equippedWeapon)=>({
 characterId:null,name,hp:100,maxHp:100,agility:100,strength:10,constitution:10,
 precision:30,dodge:30,physicalAttack:18,physicalDefense:6,
 magicAttack:12,magicDefense:4,critical:10,luck:10,race:20,massKg:70,
 positionMeters,weaponIntegrity:100,attackType:"CUT",defenseType:"SOLID",
 spentTicks:0,spentAp:0,heightMeters:1.7,unarmedReachMeters:0.765,equippedWeapon
});
const roll={hit:0.9,critical:0.9,defense:0.9};
const blade={name:"Daga",attackType:"PIERCE",mode:"MELEE",effectiveRangeMeters:1.2,throwable:true,throwRangeMeters:5,itemId:1};
test("different physical geometries produce different contacts",()=>{
 assert.equal(geometricContact("CUT",[{x:0,y:0.5},{x:1,y:0.5}]),true);
 assert.equal(geometricContact("PIERCE",[{x:0,y:0.5},{x:0.2,y:0.5}]),false);
 assert.equal(geometricContact("BLUNT",[{x:0,y:0.5},{x:0.5,y:0.5}]),true);
});
test("ranged attack requires a ranged weapon",()=>{
 const s=newCombatState(f("A"),f("B",1));
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"CUT",rangedPhysical:true,areaCenter:{x:0.5,y:0.5}},roll),/arma a distancia/);
});
test("throwing removes weapon and creates recoverable dropped weapon",()=>{
 const s=newCombatState(f("A",0,blade),f("B",1));
 const next=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"PIERCE",throwWeapon:true,areaCenter:{x:0.5,y:0.5}},roll);
 assert.equal(next.actors.PLAYER.equippedWeapon,undefined);
 assert.equal(next.droppedWeapons?.length,1);
 assert.equal(next.pending?.thrownWeapon,true);
});
test("basic magic spends one mana and cannot reach beyond four meters",()=>{
 const s=newCombatState(f("A"),f("B",1));
 s.mana={PLAYER:{current:1,max:1},NPC:{current:1,max:1}};
 const next=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"CUT",usesMagic:true,areaCenter:{x:0.5,y:0.5}},roll);
 assert.equal(next.mana.PLAYER.current,0);
 const far=newCombatState(f("A"),f("B",5));far.mana=s.mana;
 assert.throws(()=>applyCombatCommand(far,"PLAYER",{kind:"ATTACK",attackType:"CUT",usesMagic:true,areaCenter:{x:0.5,y:0.5}},roll),/alcance/);
});
