const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");

const source=fs.readFileSync(path.join(__dirname,"../lib/skills/mechanics-runtime.ts"),"utf8");
const moduleExports={};
const engine={
 activeStatMultipliers:()=>({}),advanceEnvironmentTurn:s=>s,
 applyMechanicEvent:(s)=>({state:s,manaInvestment:0}),conditionsMet:()=>true,
 parseEnvironment:s=>s,validateSkillMechanics:()=>null,
};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports:moduleExports,
 require:id=>{
  if(id==="@/lib/db")return {db:{}};
  if(id==="@/lib/stats/effective")return {getEffectiveCharacterStats:async()=>({derived:{maxMana:100}})};
  if(id==="@/lib/skills/interaction-engine")return engine;
  throw Error("Unexpected dependency "+id);
 },
 Array,Object,Number,Date,Error,
},{filename:"mechanics-runtime.ts"});

test("elemental imbuement attaches element and target as an active status",()=>{
 const state={turn:1,fields:[],exposures:{},distances:{},statuses:[]};
 const out=moduleExports.syncSkillImbuements(state,{
  id:90,effect:[{type:"ELEMENTAL_IMBUE",element:"FIRE",target:"SELF",value:1}],
 });
 assert.equal(out.statuses.length,1);
 assert.equal(out.statuses[0].status,"ELEMENTAL_IMBUE");
 assert.equal(out.statuses[0].element,"FIRE");
 assert.equal(out.statuses[0].imbueTarget,"SELF");
 assert.equal(out.statuses[0].remainingTurns,2);
 assert.equal(state.statuses.length,0);
});
test("reapplying the same effect refreshes instead of stacking",()=>{
 const state={turn:0,fields:[],exposures:{},distances:{},statuses:[]};
 const skill={id:90,effect:[{type:"ELEMENTAL_IMBUE",element:"WATER",target:"ARMOR"}]};
 const once=moduleExports.syncSkillImbuements(state,skill);
 const twice=moduleExports.syncSkillImbuements(once,skill);
 assert.equal(twice.statuses.length,1);
 assert.equal(twice.statuses[0].element,"WATER");
 assert.equal(twice.statuses[0].imbueTarget,"ARMOR");
});
test("invalid and neutral element imbuements never create an active status",()=>{
 const state={turn:0,fields:[],exposures:{},distances:{},statuses:[]};
 assert.equal(moduleExports.syncSkillImbuements(state,{id:10,effect:[{type:"ELEMENTAL_IMBUE",element:"NEUTRAL"}]}).statuses.length,0);
 assert.equal(moduleExports.syncSkillImbuements(state,{id:10,effect:[{type:"ELEMENTAL_IMBUE",element:"$ELEMENT"}]}).statuses.length,0);
});
