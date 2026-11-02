const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const read = file => fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const moduleExports = {};
vm.runInNewContext(ts.transpileModule(read("lib/skills/passive-condition.ts"), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText, {exports:moduleExports}, {filename:"passive-condition.ts"});

const {isPassiveConditionMissing,PASSIVE_CONDITION_REQUIRED_MESSAGE} = moduleExports;

test("only passive skills with a nonblank condition may be submitted",()=>{
  assert.equal(isPassiveConditionMissing("PASSIVE",""),true);
  assert.equal(isPassiveConditionMissing("PASSIVE","  \t  "),true);
  assert.equal(isPassiveConditionMissing("PASSIVE",null),true);
  assert.equal(isPassiveConditionMissing("PASSIVE",undefined),true);
  assert.equal(isPassiveConditionMissing("PASSIVE","Sikatā activa y arena presente"),false);
  assert.equal(isPassiveConditionMissing("PASSIVE","  Se recibe un golpe  "),false);
  for(const category of ["OFFENSIVE","UTILITY","SUPPORT","BASIC"]){
    assert.equal(isPassiveConditionMissing(category,""),false);
  }
  assert.match(PASSIVE_CONDITION_REQUIRED_MESSAGE,/obligatori/i);
});

test("form marks condition mandatory immediately and gives a field-level error",()=>{
  const ui=read("components/skills/SkillCoreFields.tsx");
  assert.match(ui,/\{form.category==="PASSIVE" && \(\s*<div/);
  assert.ok(ui.indexOf('id="skill-passive-condition"') < ui.indexOf('{effectEditor &&'));
  assert.match(ui,/\brequired\s+aria-required="true"/);
  assert.match(ui,/aria-invalid=\{passiveConditionMissing\}/);
  assert.match(ui,/PASSIVE_CONDITION_REQUIRED_MESSAGE/);
  assert.match(ui,/Condición general de la pasiva/);
  const effects=read("components/skills/SkillEffectsEditor.tsx");
  assert.match(effects,/Condición del efecto \(opcional\)/);
  assert.match(effects,/no reemplaza la condición obligatoria de una habilidad pasiva/);
  const modal=read("components/skills/SkillFormModal.tsx");
  assert.match(modal,/role="alert"/);
  assert.match(modal,/Ir a condición/);
  assert.match(modal,/getElementById\("skill-passive-condition"\)\?\.focus\(\)/);
});

test("character and management UI check passive condition before submission",()=>{
  const character=read("app/characters/[id]/page.tsx");
  const management=read("app/management/skills/page.tsx");
  assert.match(character,/async function submitSkill\(\)[\s\S]*?isPassiveConditionMissing\(skillForm.category,skillForm.condition\)/);
  assert.match(character,/disabled=\{skillSaving[^}]*isPassiveConditionMissing\(skillForm.category,skillForm.condition\)/);
  assert.match(management,/async function save\([^)]*\)[\s\S]*?isPassiveConditionMissing\(form.category,form.condition\)/);
  assert.match(management,/disabled=\{busy\|\|!pricingReady\|\|isPassiveConditionMissing\(form.category,form.condition\)\}/);
});

test("player and management endpoints retain server validation",()=>{
  for(const file of [
    "app/api/characters/[id]/skills/route.ts",
    "app/api/management/skills/route.ts",
    "app/api/management/skills/[id]/route.ts",
  ]){
    assert.match(read(file),/isPassiveConditionMissing/);
    assert.match(read(file),/PASSIVE_CONDITION_REQUIRED_MESSAGE/);
  }
  assert.match(read("app/api/management/skills/[id]/route.ts"),/body.reject !== true && isPassiveConditionMissing/);
});
