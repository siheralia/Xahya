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

const katana={name:"Katana",attackType:"CUT",mode:"MELEE",effectiveRangeMeters:1.6,maximumRangeMeters:2,itemId:91};
const secondDagger={name:"Daga",attackType:"PIERCE",mode:"MELEE",effectiveRangeMeters:1.1,maximumRangeMeters:1.3,throwable:true,throwRangeMeters:5,itemId:92};
const dual=()=>{const a=f("A",0,katana);a.offhandWeapon=secondDagger;return a;};
test("switching from katana to dagger and back preserves independent stroke endpoints",()=>{
 let s=newCombatState(dual(),f("B",1));
 const cut=(trajectory)=>({kind:"ATTACK",attackSource:"MAIN_HAND",attackType:"CUT",trajectory});
 const pierce=(trajectory)=>({kind:"ATTACK",attackSource:"OFF_HAND",attackType:"PIERCE",trajectory});
 const k1=[{x:0.1,y:0.5},{x:0.9,y:0.5}], d1=[{x:0.2,y:0.5},{x:0.5,y:0.5}];
 s=applyCombatCommand(s,"PLAYER",cut(k1),roll);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},roll);
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"},roll);
 assert.deepEqual(s.physicalPathEnds.PLAYER.MAIN_HAND,k1[1]);
 assert.equal(s.physicalPathEnds.PLAYER.OFF_HAND,undefined);
 s=applyCombatCommand(s,"PLAYER",pierce(d1),roll);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},roll);
 assert.deepEqual(s.physicalPathEnds.PLAYER.OFF_HAND,d1[1]);
 assert.deepEqual(s.physicalPathEnds.PLAYER.MAIN_HAND,k1[1]);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",cut([{x:0,y:0},{x:0.5,y:0.5}]),roll),/comenzar donde terminó/);
 s=applyCombatCommand(s,"PLAYER",cut([k1[1],{x:0.3,y:0.5}]),roll);
 assert.equal(s.pending.attackSource,"MAIN_HAND");
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},roll);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",pierce([{x:0.1,y:0},{x:0.5,y:0.5}]),roll),/comenzar donde terminó/);
 s=applyCombatCommand(s,"PLAYER",pierce([d1[1],{x:0.6,y:0.5}]),roll);
 assert.equal(s.pending.attackSource,"OFF_HAND");
});
test("each fist has its own continuity with the other hand still equipped",()=>{
 let s=newCombatState(dual(),f("B",1));
 const punch=(attackSource,trajectory)=>({kind:"ATTACK",attackSource,attackType:"BLUNT",trajectory});
 const right=[{x:0.1,y:0.5},{x:0.5,y:0.5}],left=[{x:0.8,y:0.5},{x:0.5,y:0.5}];
 s=applyCombatCommand(s,"PLAYER",punch("FIST_RIGHT",right),roll);
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},roll);
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"},roll);
 s=applyCombatCommand(s,"PLAYER",punch("FIST_LEFT",left),roll);
 assert.deepEqual(s.physicalPathEnds.PLAYER.FIST_RIGHT,right[1]);
 assert.deepEqual(s.physicalPathEnds.PLAYER.FIST_LEFT,left[1]);
});
test("an offhand throw leaves the main weapon available and recovers only to offhand",()=>{
 let s=newCombatState(dual(),f("B",1));
 s=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackSource:"OFF_HAND",attackType:"PIERCE",throwWeapon:true,areaCenter:{x:0.5,y:0.5}},roll);
 assert.equal(s.actors.PLAYER.equippedWeapon.itemId,91);
 assert.equal(s.actors.PLAYER.offhandWeapon,undefined);
 assert.equal(s.droppedWeapons[0].slot,"OFF_HAND");
 s=applyCombatCommand(s,"NPC",{kind:"DEFEND",defense:"NONE"},roll);
 s=applyCombatCommand(s,"NPC",{kind:"WAIT"},roll);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackSource:"OFF_HAND",attackType:"PIERCE"},roll),/no tienes un arma equipada/i);
 s=applyCombatCommand(s,"PLAYER",{kind:"MOVE",direction:"WEAPON",weaponSlot:"OFF_HAND",meters:1},roll);
 assert.equal(s.actors.PLAYER.equippedWeapon.itemId,91);
 assert.equal(s.actors.PLAYER.offhandWeapon.itemId,92);
 assert.equal(s.droppedWeapons.length,0);
});
test("weapon type, hand source and specific reach are validated on the server",()=>{
 const s=newCombatState(dual(),f("B",1.5));
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackSource:"OFF_HAND",attackType:"CUT"},roll),/tipo de ataque/);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackSource:"MAIN_HAND",attackType:"PIERCE"},roll),/tipo de ataque/);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackSource:"FIST_LEFT",attackType:"CUT"},roll),/puños/);
 assert.throws(()=>applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackSource:"OFF_HAND",attackType:"PIERCE",trajectory:[{x:0,y:0.5},{x:0.5,y:0.5}]},roll),/alcance máximo/);
 const ok=applyCombatCommand(s,"PLAYER",{kind:"ATTACK",attackSource:"MAIN_HAND",attackType:"CUT",trajectory:[{x:0.1,y:0.5},{x:0.5,y:0.5}]},roll);
 assert.equal(ok.pending.attackSource,"MAIN_HAND");
});
