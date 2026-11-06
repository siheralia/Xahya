import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {weaponWearSinceSnapshot,persistedDurabilityAfterAction}
 from "../lib/combat/weapon-persistence.ts";

test("ordinary damage still uses one monotone wear delta",()=>{
 assert.equal(weaponWearSinceSnapshot(80,65,0),15);
 assert.equal(persistedDurabilityAfterAction(80,80,65,0),65);
 assert.equal(persistedDurabilityAfterAction(60,80,65,0),60-15,
  "parallel damage must never be healed by a stale encounter snapshot");
});

test("self-repair without damage increases the right persisted copy exactly once",()=>{
 assert.equal(weaponWearSinceSnapshot(75,80,5),0);
 assert.equal(persistedDurabilityAfterAction(75,75,80,5),80);
 assert.equal(persistedDurabilityAfterAction(50,75,80,5),55,
  "a concurrent encounter may wear a copy further before it heals");
 assert.equal(persistedDurabilityAfterAction(0,0,5,5),5,
  "broken copies are repairable");
});

test("a BLOCK and automatic repair in the same action keep BOTH effects",()=>{
 assert.equal(weaponWearSinceSnapshot(70,65,5),10);
 assert.equal(persistedDurabilityAfterAction(70,70,65,5),65);
 assert.equal(persistedDurabilityAfterAction(40,70,65,5),35);
 assert.equal(weaponWearSinceSnapshot(100,100,20),20,
  "a damaged-then-fully-repaired weapon has a zero net delta, not zero wear");
 assert.equal(persistedDurabilityAfterAction(100,100,100,20),100);
});

test("cannot increase durability without a signed repair event",()=>{
 for(const [before,after,repair] of [[10,15,0],[50,65,10],[0,1,0]]){
  assert.throws(()=>weaponWearSinceSnapshot(before,after,repair),/sin una reparación/);
 }
 for(const bad of [-1,101,NaN,Infinity,1.1]){
  assert.throws(()=>weaponWearSinceSnapshot(bad,50,0),/inválida/);
  assert.throws(()=>weaponWearSinceSnapshot(50,bad,0),/inválida/);
  assert.throws(()=>persistedDurabilityAfterAction(bad,50,50,0),/persistida/);
 }
});

test("per-copy combat SQL uses the audited repair and refuses stale inventory copy mutations",()=>{
 const s=readFileSync(new URL("../app/api/combat/[id]/actions/route.ts",import.meta.url),"utf8");
 assert.match(s,/weaponWearSinceSnapshot\(before,integrity,repaired\)/);
 assert.match(s,/LEAST\(durability,\$\{before\}\)-\$\{worn\}\+\$\{repaired\}/);
 assert.match(s,/"characterId"=\$\{characterId\}/);
 assert.match(s,/"itemId"=\$\{weapon\.itemId\?\?0\} AND quantity=1/);
 assert.match(s,/No se pudo guardar la autorreparación/);
 assert.match(s,/SET durability=LEAST\(durability,\$\{integrity\}\)/,
  "normal weapon wear must stay compatible with previous combats");
});
