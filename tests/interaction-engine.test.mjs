import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyEnvironment, validateSkillMechanics, applyMechanicEvent, advanceEnvironmentTurn,
  localPpm, manaWardReduction, exposureKey, activeStatMultipliers,
} from "../lib/skills/interaction-engine.ts";
import { mechanicsPchCost } from "../lib/skills/mechanics-pricing.ts";

const ctx=(event="ACTIVATE",activeSkillIds=[],distances={PLAYER:0,NPC:8})=>({
  actor:"PLAYER",event,sourceSkillId:21,ownerCharacterId:17,
  approvedSkillIds:[21,24],activeSkillIds,distances,
});
const fieldRule={event:"ACTIVATE",actions:[{kind:"CREATE_FIELD",material:"SAND",rings:[
  {radius:5,ppm:2000},{radius:10,ppm:500},{radius:20,ppm:200},
],spreadMeters:5,transferPercent:50}]};

test("an empty configuration leaves no skills or fields in the character",()=>{
 assert.deepEqual(emptyEnvironment().fields,[]);
 assert.equal(validateSkillMechanics({}),null);
 assert.equal(applyMechanicEvent(emptyEnvironment(),{},ctx()).state.fields.length,0);
});

test("fields create three concentration bands and disperse in combat turns",()=>{
 const first=applyMechanicEvent(emptyEnvironment(),{rules:[fieldRule]},ctx()).state;
 assert.equal(localPpm(first,"SAND",4),2000);
 assert.equal(localPpm(first,"SAND",8),500);
 assert.equal(localPpm(first,"SAND",16),200);
 assert.equal(localPpm(first,"SAND",21),0);
 const next=advanceEnvironmentTurn(first);
 assert.equal(next.turn,1);
 assert.equal(next.fields.length,1);
 assert.equal(next.fields[0].rings[2].radius,25);
 assert.ok(localPpm(next,"SAND",4)<2000);
 assert.ok(localPpm(next,"SAND",23)>0);
});

test("inhalation needs a measured distance and supports mana ward",()=>{
 const base=applyMechanicEvent(emptyEnvironment(),{rules:[fieldRule]},ctx()).state;
 const ward=applyMechanicEvent(base,{rules:[{event:"ACTIVATE",actions:[{
   kind:"MANA_WARD",manaInvestment:100,level:2,target:"SELF",durationTurns:3
 }]}]},ctx());
 assert.equal(ward.manaInvestment,100);
 assert.equal(manaWardReduction(100,2),40);
 const exposure={rules:[{event:"TURN",actions:[{
   kind:"EXPOSE",material:"SAND",amount:0,target:"SELF",fromField:true,
 }]}]};
 const withoutPosition=applyMechanicEvent(ward.state,exposure,ctx("TURN",[],{})).state;
 assert.equal(withoutPosition.exposures[exposureKey("PLAYER","SAND")],undefined);
 const withPosition=applyMechanicEvent(withoutPosition,exposure,ctx("TURN")).state;
 assert.equal(withPosition.exposures[exposureKey("PLAYER","SAND")],1960);
});

test("links require a second active technique",()=>{
 const mechanics={rules:[{event:"TURN",linkedSkillId:24,actions:[{
   kind:"STATUS",status:"SLOWED",target:"OPPONENT",durationTurns:2,stat:"AGI",multiplier:.8,
 }]}]};
 assert.equal(applyMechanicEvent(emptyEnvironment(),mechanics,ctx("TURN")).state.statuses.length,0);
 const active=applyMechanicEvent(emptyEnvironment(),mechanics,ctx("TURN",[24])).state;
 assert.equal(active.statuses[0].actor,"NPC");
 assert.equal(activeStatMultipliers(active,"NPC").AGI,.8);
 assert.equal(advanceEnvironmentTurn(active).statuses[0].remainingTurns,1);
 assert.equal(advanceEnvironmentTurn(advanceEnvironmentTurn(active)).statuses.length,0);
});

test("exposure can be cleansed and never falls below zero",()=>{
 let state=applyMechanicEvent(emptyEnvironment(),{rules:[{event:"ACTIVATE",actions:[{
   kind:"EXPOSE",material:"SAND",amount:90,target:"OPPONENT"
 }]}]},ctx()).state;
 state=applyMechanicEvent(state,{rules:[{event:"ACTIVATE",actions:[{
   kind:"CLEANSE",material:"SAND",amount:1000,target:"OPPONENT"
 }]}]},ctx()).state;
 assert.equal(state.exposures[exposureKey("NPC","SAND")],0);
});

test("rejects malformed concentric radii and unsupported actions",()=>{
 assert.match(validateSkillMechanics({rules:[{event:"ACTIVATE",actions:[{
  kind:"CREATE_FIELD",material:"SAND",rings:[{radius:10,ppm:500},{radius:5,ppm:300}],
 }]}]}),/Zonas/);
 assert.match(validateSkillMechanics({rules:[{event:"ACTIVATE",actions:[{kind:"SCRIPT",code:"eval"}]}]}),/desconocida/);
 assert.equal(validateSkillMechanics({rules:[fieldRule]}),null);
});

test("rules have an explicit PCH surcharge and no source skill is precreated",()=>{
 assert.equal(mechanicsPchCost({}),0);
 assert.ok(mechanicsPchCost({rules:[fieldRule]})>0);
});
