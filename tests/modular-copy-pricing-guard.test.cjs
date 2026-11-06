const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const options={compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}};
const load=(path,requireFn=require)=>{
  const code=ts.transpileModule(fs.readFileSync(path,"utf8"),options).outputText;
  const module={exports:{}};
  new Function("module","exports","require",code)(module,module.exports,requireFn);
  return module.exports;
};
const pricing=load("lib/skills/pch.ts");
const {copyComplexityPch,UNPRICED_MODULAR_COPY_COMPLEXITY}=load(
  "lib/skills/copy-complexity.ts",
  name=>name==="@/lib/skills/pch"?pricing:require(name)
);
const effects=pricing.defaultEffectPricing();
const modular=(reviewedPch)=>({type:"COMPOSED",module:{steps:[]},...(reviewedPch===undefined?{}:{reviewedPch})});

test("unreviewed modular skills cannot have a zero-cost copy or theft",()=>{
  const min=UNPRICED_MODULAR_COPY_COMPLEXITY;
  assert.equal(min,1_000_001);
  assert.equal(copyComplexityPch({pchCost:0,effect:[modular()]},effects),min);
  assert.equal(copyComplexityPch({pchCost:54,effect:[modular()]},effects),min);
  assert.equal(copyComplexityPch({pchCost:0,effect:[modular(30)]},effects),min);
  assert.equal(copyComplexityPch({pchCost:54,effect:[modular(0)]},effects),min);
  assert.equal(copyComplexityPch({pchCost:54,effect:[modular(5.5)]},effects),min);
  assert.equal(copyComplexityPch({pchCost:368,effect:[modular(30),modular()]},effects),min);
});
test("modular reviews use the higher of recorded final PCH or reviewed bases",()=>{
  assert.equal(copyComplexityPch({pchCost:54,effect:[modular(30)]},effects),54);
  assert.equal(copyComplexityPch({pchCost:5,effect:[modular(30)]},effects),30);
  assert.equal(copyComplexityPch({pchCost:368,effect:Array(7).fill(null).map(()=>modular(30))},effects),368);
  assert.equal(copyComplexityPch({pchCost:35,effect:[modular(30),{type:"STAT_BONUS",value:5}]},effects),35);
  assert.equal(copyComplexityPch({pchCost:30,effect:[modular(30),{type:"UNSUPPORTED"}]},effects),UNPRICED_MODULAR_COPY_COMPLEXITY);
});
test("ordinary legacy skills keep existing compatibility pricing",()=>{
  assert.equal(copyComplexityPch({pchCost:0,effect:[{type:"STAT_BONUS",value:5}]},effects),5);
  assert.equal(copyComplexityPch({pchCost:17,effect:[{type:"UNSUPPORTED"}]},effects),17);
});
test("the direct management creation route cannot approve an unreviewed COMPOSED effect",()=>{
  const route=fs.readFileSync("app/api/management/skills/route.ts","utf8");
  assert.match(route,/validateComposedSkillList\(effects,body\.approve===true\?"REVIEW":"PLAYER"\)/);
  assert.match(route,/configuredSkillEffectPch\(effect,cards,pricing,durations\)/);
  assert.match(route,/if\(pchCost!==exact\)/);
});
