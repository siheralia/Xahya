import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {combatClientView} from "../lib/combat/magic-area.ts";
import {
  newCombatState,applyCombatCommand,installEncounterMicroEffects
} from "../lib/combat/turn-engine.ts";

const chance={hit:0.01,critical:0.99,defense:0.99};
const fighter=(name,characterId,positionMeters,overrides={})=>({
  characterId,name,hp:100,maxHp:100,agility:60,speedValue:80,strength:20,
  constitution:10,precision:80,dodge:15,physicalAttack:50,physicalDefense:20,
  magicAttack:20,magicDefense:20,critical:0,luck:10,race:20,massKg:70,
  positionMeters,attackType:"BLUNT",defenseType:"SOLID",weaponIntegrity:100,
  equippedWeapon:{name:"Maza",mode:"MELEE",attackType:"BLUNT",
    effectiveRangeMeters:2,maximumRangeMeters:2},
  spentTicks:0,spentAp:0,...overrides
});
const encounter=()=>newCombatState(fighter("Atacante",11,0),fighter("Gloria",22,1.5));
const chargeKey="DIVINE_GRACE";
const chargeRef={source:"CHARGES",key:chargeKey};
const condition=(compare,right)=>[{left:chargeRef,compare,right}];
const grace={id:"grace",name:"Gracia divina",type:"PASSIVE",description:"Recoge daño mitigado",trigger:"DAMAGE_RESOLVED",
  steps:[{kind:"STORE",accumulator:chargeKey,capacity:5,value:{source:"EVENT",key:"MITIGATED_DAMAGE"}}]};
const sanctuaryDefense={id:"sanctuary-guard",name:"Santuario Interior",type:"PASSIVE",description:"Defensa sin cargas",trigger:"PASSIVE",
  steps:[{kind:"MODIFIER",stat:"RESISTANCE",multiplier:1.3,when:condition("EQ",0)}]};
const sanctuaryRegen={id:"sanctuary-regen",name:"Santuario Interior",type:"PASSIVE",description:"Regen al inicio",trigger:"TURN_START",
  steps:[{kind:"HEAL",amount:{operator:"PERCENT",args:[{source:"STAT",key:"MAX_HP"},10]},when:condition("GTE",1)}]};
const effects=[grace,sanctuaryDefense,sanctuaryRegen];
const castHit=(state,defense="NONE",rolls=chance)=>{
  const sent=applyCombatCommand(state,"PLAYER",{kind:"ATTACK",attackType:"BLUNT",attackSource:"MAIN_HAND",
    trajectory:[{x:0.1,y:0.5},{x:0.5,y:0.5}]},rolls);
  return applyCombatCommand(sent,"NPC",{kind:"DEFEND",defense},rolls);
};
const charges=(state,side="NPC")=>state.microEffects?.state.accumulators[(side==="NPC"?"2":"1")+":"+chargeKey]?.charges??[];

test("legacy encounter without optional micro effects resolves exactly as before",()=>{
  const raw=castHit(encounter());
  assert.equal(raw.microEffects,undefined);
  assert.equal(raw.actors.NPC.hp,55);
});
test("first hit uses 30% extra resistance and only mitigated defense damage becomes charge",()=>{
  const mod=installEncounterMicroEffects(encounter(),"NPC",effects);
  const state=castHit(mod);
  assert.equal(state.actors.NPC.hp,59); // 60 attack after matchup minus 26 * 0.75 = 41
  assert.deepEqual(charges(state),[19]); // 60 without stat defense - 41 with stat defense
  assert.equal(state.log.filter(e=>e.kind==="RESOLVE").at(-1).mitigatedByResistance,19);
  assert.equal(state.microEffects.state.processed.length,1);
  assert.equal(mod.microEffects.state.processed.length,0,"input snapshot never mutates");
});
test("after one charge, defense bonus is off for subsequent attacks",()=>{
  const plain=castHit(encounter());
  const loaded=installEncounterMicroEffects(encounter(),"NPC",effects);
  loaded.microEffects.state.accumulators["2:"+chargeKey]={capacity:5,charges:[8]};
  const next=castHit(loaded);
  assert.equal(next.actors.NPC.hp,plain.actors.NPC.hp);
  assert.deepEqual(charges(next),[8,15]);
});
test("an evaded strike stores no charge, even when it would have dealt damage",()=>{
  const loaded=installEncounterMicroEffects(encounter(),"NPC",effects);
  const first=applyCombatCommand(loaded,"PLAYER",{kind:"ATTACK",attackType:"BLUNT",attackSource:"MAIN_HAND",
    trajectory:[{x:0.1,y:0.5},{x:0.5,y:0.5}]},chance);
  const dodged=applyCombatCommand(first,"NPC",{kind:"DEFEND",defense:"DODGE"},
    {hit:0.99,critical:0.99,defense:0.99});
  assert.equal(dodged.actors.NPC.hp,100);
  assert.deepEqual(charges(dodged),[]);
});
test("regeneration at next round restores 10% max HP once when charged",()=>{
  const base=encounter();
  base.actors.NPC.hp=41;
  let s=installEncounterMicroEffects(base,"NPC",effects);
  s.microEffects.state.accumulators["2:"+chargeKey]={capacity:5,charges:[30]};
  s=applyCombatCommand(s,"PLAYER",{kind:"WAIT"});
  s=applyCombatCommand(s,"NPC",{kind:"WAIT"});
  assert.equal(s.round,2);
  assert.equal(s.actors.NPC.hp,51);
  assert.equal(s.log.filter(e=>e.kind==="REGEN").length,1);
  assert.deepEqual(charges(s),[30],"regeneration does not consume the stored energy");
  const persisted=JSON.parse(JSON.stringify(s));
  assert.deepEqual(persisted.microEffects.state,s.microEffects.state);
});
test("no regeneration at empty charges and healing is capped at max HP",()=>{
  const first=encounter();first.actors.NPC.hp=41;
  let s=installEncounterMicroEffects(first,"NPC",effects);
  s=applyCombatCommand(s,"PLAYER",{kind:"WAIT"});
  s=applyCombatCommand(s,"NPC",{kind:"WAIT"});
  assert.equal(s.actors.NPC.hp,41);
  const second=encounter();second.actors.NPC.hp=97;
  let t=installEncounterMicroEffects(second,"NPC",effects);
  t.microEffects.state.accumulators["2:"+chargeKey]={capacity:5,charges:[12]};
  t=applyCombatCommand(t,"PLAYER",{kind:"WAIT"});
  t=applyCombatCommand(t,"NPC",{kind:"WAIT"});
  assert.equal(t.actors.NPC.hp,100);
  assert.equal(t.log.find(e=>e.kind==="REGEN").healingPoints,3);
});
test("invalid unpriced damage/impact actions cannot be installed",()=>{
  const bad={...grace,steps:[{kind:"DAMAGE",channel:"MAGICAL",element:"LIGHT",amount:99999}]};
  assert.throws(()=>installEncounterMicroEffects(encounter(),"NPC",[bad]),/fase de combate no implementada/);
  const mutation=encounter();
  assert.equal(mutation.microEffects,undefined);
});
test("two sides do not share charge namespaces",()=>{
  let s=installEncounterMicroEffects(encounter(),"PLAYER",effects);
  s=installEncounterMicroEffects(s,"NPC",effects);
  s.microEffects.state.accumulators["1:"+chargeKey]={capacity:5,charges:[100]};
  assert.deepEqual(charges(s,"PLAYER"),[100]);
  assert.deepEqual(charges(s,"NPC"),[]);
});
test("existing locked combat endpoint persists combatV1 atomically; no player-controlled module installation",()=>{
  const source=readFileSync(new URL("../app/api/combat/[id]/actions/route.ts",import.meta.url),"utf8");
  assert.match(source,/UPDATE public\."combatSession" SET id=id/);
  assert.match(source,/lastAction:\{combatV1:next\}/);
  assert.doesNotMatch(source,/installEncounterMicroEffects/);
});

test("public combat projections conceal private charge values and replay tokens",()=>{
  const seeded=installEncounterMicroEffects(encounter(),"NPC",effects);
  seeded.microEffects.state.accumulators["2:"+chargeKey]={capacity:5,charges:[123,456]};
  const publicView=combatClientView(seeded);
  assert.equal(publicView.microEffects,undefined);
  assert.equal(seeded.microEffects.state.accumulators["2:"+chargeKey].charges[1],456);
});
