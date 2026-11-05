const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("passive skill forms never demand a free-text narrative condition",()=>{
  const core=read("components/skills/SkillCoreFields.tsx");
  const modal=read("components/skills/SkillFormModal.tsx");
  assert.match(core,/Boolean\(form\.condition\?\.trim\(\)\)/);
  assert.match(core,/Condición narrativa anterior/);
  assert.match(core,/onClick=\{\(\)=>set\("condition",""\)\}/);
  assert.doesNotMatch(core,/Condición general de la pasiva|aria-required="true"|passiveConditionMissing/);
  assert.doesNotMatch(modal,/PASSIVE_CONDITION_REQUIRED_MESSAGE|skill-passive-condition|passiveConditionMissing/);
});

test("player and management UIs allow submitting passives without conditions",()=>{
  const character=read("app/characters/[id]/page.tsx");
  const management=read("app/management/skills/page.tsx");
  assert.doesNotMatch(character,/isPassiveConditionMissing|PASSIVE_CONDITION_REQUIRED_MESSAGE/);
  assert.doesNotMatch(management,/isPassiveConditionMissing|PASSIVE_CONDITION_REQUIRED_MESSAGE/);
  assert.match(character,/async function submitSkill\(\)/);
  assert.match(management,/async function save\(/);
});

test("APIs allow empty narrative conditions while retaining existing data",()=>{
  const create=read("app/api/management/skills/route.ts");
  const update=read("app/api/management/skills/[id]/route.ts");
  const player=read("app/api/characters/[id]/skills/route.ts");
  for(const source of [create,update,player]){
    assert.doesNotMatch(source,/isPassiveConditionMissing|PASSIVE_CONDITION_REQUIRED_MESSAGE/);
  }
  assert.match(create,/condition: typeof body\.condition === "string" \? body\.condition\.trim\(\) \|\| null : null/);
  assert.match(player,/condition: typeof body\.condition === "string" \? body\.condition\.trim\(\) \|\| null : null/);
  assert.match(update,/const nextCondition =/);
  assert.match(update,/condition: nextCondition \|\| null/);
});

test("mechanical effect and activation conditions remain available",()=>{
  const effects=read("components/skills/SkillEffectsEditor.tsx");
  const constructs=read("lib/combat/constructs.ts");
  assert.match(effects,/Condición del efecto \(opcional\)/);
  assert.match(effects,/activationCondition/);
  assert.match(constructs,/mechanics\.activationConditions/);
  assert.match(constructs,/kind==="SKILL_ACTIVE"/);
  const compiler=read("lib/combat/skill-casting.ts");
  assert.match(compiler,/Las condiciones narrativas de esta habilidad todavía no tienen resolutor/);
});
