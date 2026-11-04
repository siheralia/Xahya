import test from "node:test";
import assert from "node:assert/strict";
import {TRAINING_DIFFICULTIES,parseTrainingDifficulty,trainingBaseStats,applyTrainingDifficulty} from "../lib/combat/training-difficulty.ts";
test("difficulty defaults safely and rejects unknown values",()=>{
 assert.equal(parseTrainingDifficulty(undefined),"INTERMEDIATE");
 assert.throws(()=>parseTrainingDifficulty("GODMODE"),/inválida/);
 assert.equal(Object.keys(TRAINING_DIFFICULTIES).length,5);
});
test("difficulty does not mutate original stats or change preserved speed",()=>{
 const base={agility:30,strength:20,constitution:20};
 const scaled=trainingBaseStats(base,"ADVANCED");
 assert.equal(scaled.agility,30);
 assert.equal(scaled.strength,24);
 assert.equal(base.strength,20);
});
test("endurance changes only NPC snapshot HP and defense",()=>{
 const fighter={hp:12,maxHp:12,physicalDefense:4,magicDefense:6,physicalAttack:153};
 const result=applyTrainingDifficulty(fighter,"ENDURANCE");
 assert.equal(result.hp,240);
 assert.equal(result.maxHp,240);
 assert.equal(result.physicalDefense,6);
 assert.equal(result.physicalAttack,153);
 assert.equal(fighter.hp,12);
});
