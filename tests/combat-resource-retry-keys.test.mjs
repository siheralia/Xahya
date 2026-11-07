import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {combatResourceRequestKey} from "../lib/combat/resource-request-key.ts";

const snapshot=()=>({
 version:1,round:4,tick:321,status:"ACTIVE",
 actors:{
  PLAYER:{spentTicks:21,spentAp:3},
  NPC:{spentTicks:54,spentAp:2},
 },
 pending:null,
 log:[{kind:"SKILL",tick:321,summary:"Última acción del jugador"}],
});
const cast={kind:"CAST_SKILL",skillId:41,
 constructionFieldPoint:{x:0.4,y:0.3},constructionForm:"FIELD"};
const key=(s,command=cast)=>combatResourceRequestKey("duel-66","PLAYER",s,command);

test("a lost response retries exactly the same cast on an unchanged snapshot",()=>{
 const state=snapshot();
 assert.equal(key(state),key(structuredClone(state)));
 assert.equal(key(state,{...cast,requestId:"first-attempt-00001"}),key(state),
  "the generated request ID is not part of its own fingerprint");
});

test("two valid casts of the same mirror in a round get distinct request IDs",()=>{
 const before=snapshot();
 const after=structuredClone(before);
 after.actors.PLAYER.spentAp++;
 after.actors.PLAYER.spentTicks=48;
 after.tick=348;
 after.log.push({kind:"SKILL",tick:348,summary:"Espejo colocado"});
 assert.equal(after.round,before.round);
 assert.notEqual(key(before),key(after),
  "a successful GET after a lost POST must not suppress the next mirror");
});

test("PA changes alone also distinguish legitimate new actions",()=>{
 const before=snapshot();
 const after=structuredClone(before);
 after.actors.PLAYER.spentAp++;
 assert.notEqual(key(before),key(after),
  "even a shared tick/window may not cause an accidental replay");
});

test("target, geometry, charge count and encounter identity are part of the intent",()=>{
 const state=snapshot();
 assert.notEqual(key(state),key(state,{...cast,constructionFieldPoint:{x:0.6,y:0.3}}));
 assert.notEqual(key(state),key(state,{...cast,chargesToSpend:2}));
 assert.notEqual(key(state),combatResourceRequestKey("duel-67","PLAYER",state,cast));
 assert.notEqual(key(state),combatResourceRequestKey("duel-66","NPC",state,cast));
});

test("boosts and consumables distinguish retries from later same-round uses",()=>{
 const state=snapshot();
 for(const command of [
  {kind:"BOOST_KARMA",allocation:{STR:2}},
  {kind:"USE_ITEM",itemId:15,characterItemId:91},
 ]){
  assert.equal(key(state,command),key(structuredClone(state),command));
  const next=structuredClone(state);
  next.actors.PLAYER.spentAp++;
  assert.notEqual(key(state,command),key(next,command));
 }
});

test("combat UI keys all resource submissions from the same server snapshot",()=>{
 const page=readFileSync(new URL("../app/combat/[id]/CombatEncounter.tsx",import.meta.url),"utf8");
 assert.match(page,/combatResourceRequestKey\(id,side,state,\{kind:"BOOST_KARMA",allocation\}\)/);
 assert.match(page,/combatResourceRequestKey\(id,side,state,castPayload\)/);
 assert.match(page,/combatResourceRequestKey\(id,side,state,\{kind:"USE_ITEM",/);
 assert.match(page,/void submit\(\{\.\.\.castPayload,requestId\}\)/);
});
