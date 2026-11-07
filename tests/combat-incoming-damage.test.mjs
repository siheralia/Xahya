import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {summarizeIncomingDamage} from "../lib/combat/incoming-damage.ts";

test("encounter 66: both simultaneous hits remain visible even when no defense prompt appeared",()=>{
 const log=[
  {kind:"ATTACK",tick:88,by:"PLAYER",against:"NPC",summary:"Ariana atacó"},
  {kind:"RESOLVE",tick:88,by:"NPC",against:"PLAYER",damage:5,defense:"NONE",
   summary:"Intercambio simultáneo: el gigante lanzó magia de corte"},
  {kind:"RESOLVE",tick:88,by:"PLAYER",against:"NPC",damage:65,summary:"Ariana acertó"},
  {kind:"RESOLVE",tick:188,by:"NPC",against:"PLAYER",damage:5,
   simultaneousCounter:true,summary:"Golpe simultáneo del gigante"},
  {kind:"RESOLVE",tick:188,by:"NPC",against:"PLAYER",damage:0,summary:"Un golpe evitado"},
 ];
 const incoming=summarizeIncomingDamage(log,"PLAYER");
 assert.equal(incoming.hitCount,2);
 assert.equal(incoming.totalDamage,10);
 assert.equal(incoming.latest.tick,188);
 assert.equal(incoming.latest.damage,5);
 assert.equal(incoming.latest.simultaneous,true);
 assert.equal(summarizeIncomingDamage(log,"NPC").totalDamage,65);
});

test("a hit on an ally or a zero-damage resolution cannot create a false alert",()=>{
 const log=[
  {kind:"RESOLVE",tick:4,by:"PLAYER",against:"NPC",damage:7,summary:"Otro"},
  {kind:"RESOLVE",tick:5,by:"NPC",against:"PLAYER",damage:0,summary:"Se esquivó"},
  {kind:"MOVE",tick:6,by:"NPC",summary:"Camina"},
 ];
 assert.equal(summarizeIncomingDamage(log,"PLAYER"),null);
});

test("the combat screen persistently reports received hits and warns before a possible exchange",()=>{
 const page=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
 assert.match(page,/summarizeIncomingDamage\(state\.log,side\)/);
 assert.match(page,/role="alert" aria-label="Daño recibido del oponente"/);
 assert.match(page,/incomingDamage\.totalDamage/);
 assert.match(page,/incomingDamage\.latest\.simultaneous/);
 assert.match(page,/Cerrar aviso de daño/);
 assert.match(page,/counterRisk/);
 assert.match(page,/sin una segunda pantalla para esquivar/);
});
