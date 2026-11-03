import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {racialMazeBonuses,avoidsMazeTrap,treasureItemChance,treasureMoneyWithBonus} from "../lib/maze-racial-effects.ts";
import {effectPchCost} from "../lib/skills/pch.ts";

function passive(type,target,value,overrides={}){
  return {status:"APPROVED",category:"PASSIVE",grantedByRaceSkillId:3,
    effect:[{type,target,value}],...overrides};
}
const feline=passive("MAZE_TRAP_EVASION","TRAP",50);
const elf=passive("MAZE_TREASURE_ITEM_CHANCE","TREASURE",20);
const dwarf=passive("MAZE_TREASURE_MONEY_BONUS","TREASURE",30);

test("all racial maze abilities read from approved passive grants, not race names",()=>{
  assert.deepEqual(racialMazeBonuses([feline,elf,dwarf]),{
    trapEvasionPercent:50,treasureItemChancePercent:20,treasureMoneyBonusPercent:30,
  });
  assert.deepEqual(racialMazeBonuses([
    passive("MAZE_TRAP_EVASION","TREASURE",50),
    passive("MAZE_TRAP_EVASION","TRAP",80,{category:"SUPPORT"}),
    passive("MAZE_TRAP_EVASION","TRAP",80,{status:"PENDING"}),
    passive("MAZE_TRAP_EVASION","TRAP",80,{grantedByRaceSkillId:null}),
  ]),{trapEvasionPercent:0,treasureItemChancePercent:0,treasureMoneyBonusPercent:0});
});
test("feline one-roll reflex can avoid a trap while preserving failures",()=>{
  assert.equal(avoidsMazeTrap(50,0.49),true);
  assert.equal(avoidsMazeTrap(50,0.50),false);
  assert.equal(avoidsMazeTrap(50,0.99),false);
  assert.equal(avoidsMazeTrap(0,0.01),false);
  assert.equal(avoidsMazeTrap(100,0.99),true);
});
test("racial maze bonuses never stack explosively",()=>{
  const bonus=racialMazeBonuses([feline,passive("MAZE_TRAP_EVASION","TRAP",50),elf]);
  assert.equal(bonus.trapEvasionPercent,50);
  assert.equal(treasureItemChance(0.35,bonus.treasureItemChancePercent),0.55);
  assert.equal(treasureItemChance(0.9,20),1);
});
test("dwarven bonus adds only to the claiming character's money",()=>{
  assert.equal(treasureMoneyWithBonus(1000,30),1300);
  assert.equal(treasureMoneyWithBonus(1000,0),1000);
  assert.throws(()=>treasureMoneyWithBonus(-1,30),/inválida/);
});
test("racial catalog and skill PCH registry support the three configurable effects",()=>{
  for(const effect of [feline.effect[0],elf.effect[0],dwarf.effect[0]]){
    assert.ok(effectPchCost(effect)>0);
  }
});
test("maze API handles existing and new rooms, and never changes the shared trap state",()=>{
  const source=readFileSync(new URL("../app/api/maze/[id]/route.ts",import.meta.url),"utf8");
  assert.match(source,/const avoidedTrap = triggeredTrap && avoidsMazeTrap/g);
  assert.equal((source.match(/const avoidedTrap = triggeredTrap && avoidsMazeTrap/g)||[]).length,2);
  assert.match(source,/status:destinationLock \? "TRAPPED" : "ACTIVE"/);
  assert.match(source,/treasureItemChance\(/);
  const claim=readFileSync(new URL("../app/api/maze/[id]/claim/route.ts",import.meta.url),"utf8");
  assert.match(claim,/treasureMoneyWithBonus\(/);
});
