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

test("throwing beyond its configured range is rejected without consuming the weapon",()=>{
 const s=newCombatState(f("A",0,blade),f("B",6));
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"PIERCE",throwWeapon:true,areaCenter:{x:0.5,y:0.5}},roll),/alcance máximo/);
 assert.equal(s.actors.PLAYER.equippedWeapon?.itemId,1);
});
test("movement toward the dropped weapon recovers it once and never duplicates it",()=>{
 let s=newCombatState(f("A",0,blade),f("B",1));
 s=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"PIERCE",throwWeapon:true,areaCenter:{x:0.5,y:0.5}},roll);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},roll);
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"},roll);
 s=applyCombatCommand(s,"PLAYER",{kind:"MOVE",direction:"WEAPON",meters:1},roll);
 assert.equal(s.actors.PLAYER.equippedWeapon?.itemId,1);
 assert.equal(s.droppedWeapons?.length,0);
 assert.match(s.log.at(-1)?.summary??"",/recuperó/);
});
test("fight completion restores all dropped weapons in the combat snapshot",()=>{
 let s=newCombatState(f("A",0,blade),f("B",1));
 s.actors.NPC.hp=1;
 s=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"PIERCE",throwWeapon:true,areaCenter:{x:0.5,y:0.5}},roll);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},roll);
 assert.equal(s.status,"FINISHED");
 assert.equal(s.actors.PLAYER.equippedWeapon?.itemId,1);
 assert.equal(s.droppedWeapons?.length,0);
 assert.ok(s.log.some(event=>event.kind==="RECOVER"));
});
test("ranged piercing must hit the projected defender center",()=>{
 const bow={name:"Arco",attackType:"PIERCE",mode:"RANGED",effectiveRangeMeters:8,maximumRangeMeters:16};
 const s=newCombatState(f("A",0,bow),f("B",5));
 const miss=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"PIERCE",rangedPhysical:true,areaCenter:{x:0.1,y:0.1}},roll);
 const missResult=applyCombatCommand(miss,"NPC",{kind:"DEFEND",defense:"NONE"},roll);
 assert.equal(missResult.actors.NPC.hp,100);
 const hit=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackType:"PIERCE",rangedPhysical:true,areaCenter:{x:0.5,y:0.5}},roll);
 const hitResult=applyCombatCommand(hit,"NPC",{kind:"DEFEND",defense:"NONE"},roll);
 assert.ok(hitResult.actors.NPC.hp<100);
});
test("outside effective range but within maximum range applies the hit penalty",()=>{
 const longBlade={name:"Espada",attackType:"PIERCE",mode:"MELEE",effectiveRangeMeters:1,maximumRangeMeters:2};
 const initial=newCombatState(f("A",0,longBlade),f("B",1.5));
 const attack={kind:"ATTACK",attackType:"PIERCE",trajectory:[{x:0.1,y:0.5},{x:0.5,y:0.5}]};
 const pending=applyCombatCommand(initial,"PLAYER",attack,roll);
 assert.equal(pending.pending.beyondEffectiveRange,true);
 const missed=applyCombatCommand(pending,"NPC",{kind:"DEFEND",defense:"NONE"},{hit:0.9,critical:0.9,defense:0.9});
 const hit=applyCombatCommand(pending,"NPC",{kind:"DEFEND",defense:"NONE"},{hit:0.2,critical:0.9,defense:0.9});
 assert.equal(missed.actors.NPC.hp,100);
 assert.ok(hit.actors.NPC.hp<100);
});
