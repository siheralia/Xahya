import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveWillpowerClash,strongestWillpowerDefense,allowedWillpowerDefenses,
  DEFAULT_ATTACK_STAT
} from "../lib/combat/willpower-clash.ts";

test("choque usa SPI atacante contra mejor defensa WIS, CHA o SPI",()=>{
  const result=resolveWillpowerClash({
    attacker:{spirit:12},defender:{wisdom:15,charisma:8,spirit:11,constitution:30},
    attackRoll:10,defenseRoll:12
  });
  assert.equal(DEFAULT_ATTACK_STAT,"spirit");
  assert.equal(result.attackerStat,"spirit");
  assert.equal(result.defenderStat,"wisdom");
  assert.equal(result.attackTotal,22);
  assert.equal(result.defenseTotal,27);
  assert.equal(result.resisted,true);
  assert.equal(result.success,false);
});
test("CHA sirve para resistir mediante seguridad y determinación",()=>{
  const result=resolveWillpowerClash({
    attacker:{spirit:12},defender:{wisdom:3,charisma:17,spirit:8,constitution:50},
    attackRoll:20,defenseRoll:1
  });
  assert.equal(result.defenderStat,"charisma");
  assert.equal(result.success,true);
});
test("SPI puede ganar el choque como defensa espiritual",()=>{
  const result=resolveWillpowerClash({
    attacker:{spirit:10},defender:{wisdom:4,charisma:8,spirit:19,constitution:40},
    attackRoll:10,defenseRoll:6
  });
  assert.equal(result.defenderStat,"spirit");
  assert.equal(result.resisted,true);
});
test("CON solo participa cuando la habilidad impone voluntad directamente sobre el cuerpo",()=>{
  const defender={wisdom:3,charisma:4,spirit:5,constitution:24};
  assert.equal(strongestWillpowerDefense(defender,false).stat,"spirit");
  assert.equal(strongestWillpowerDefense(defender,true).stat,"constitution");
  assert.deepEqual(allowedWillpowerDefenses(false),["wisdom","charisma","spirit"]);
  assert.ok(allowedWillpowerDefenses(true).includes("constitution"));
  assert.throws(()=>resolveWillpowerClash({
    attacker:{spirit:10},defender,attackRoll:10,defenseRoll:10,defenseStat:"constitution"
  }),/CON/);
});
test("empates favorecen a quien se resiste",()=>{
  const result=resolveWillpowerClash({
    attacker:{spirit:8},defender:{wisdom:9,charisma:2,spirit:3},
    attackRoll:12,defenseRoll:11
  });
  assert.equal(result.attackTotal,result.defenseTotal);
  assert.equal(result.resisted,true);
});
test("rechaza tiradas manipuladas o estadísticas inexistentes",()=>{
  const normal={attacker:{spirit:10},defender:{wisdom:9,charisma:8,spirit:7}};
  assert.throws(()=>resolveWillpowerClash({...normal,attackRoll:0,defenseRoll:10}),/tiradas/);
  assert.throws(()=>resolveWillpowerClash({...normal,attackRoll:21,defenseRoll:10}),/tiradas/);
  assert.throws(()=>resolveWillpowerClash({...normal,attackRoll:5,defenseRoll:1,attackStat:"charisma"}),/no disponible/);
});
