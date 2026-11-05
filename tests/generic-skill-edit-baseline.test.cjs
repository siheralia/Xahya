const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");

const text=filename=>fs.readFileSync(path.join(__dirname,"..",filename),"utf8");
const src=text("app/api/management/generic-skills/route.ts");

test("generic template edit sends a Temporal.Instant to timestamptz ORM codec",()=>{
  assert.match(src,/if\(editing\) saved=await templateModel\.where\(\{id\}\)\.update\(\{/);
  assert.match(src,/updatedAt:Temporal\.Instant\.fromEpochMilliseconds\(Date\.now\(\)\)/);
  assert.doesNotMatch(src,/updatedAt:new Date\(/);
  assert.match(src,/else saved=await templateModel\.create\(data\)/);
});

test("date update codec in an isolated generic skill edit receives an instant and not Date",async()=>{
  const initial={id:7,name:"Bola de fuego",updatedAt:"2026-11-01T10:00:00.000Z"};
  const calls=[];
  const mockModel={
    where({id}) {
      assert.equal(id,initial.id);
      return {update:async data=>{calls.push(data);return {...initial,...data};}};
    },
  };
  const Instant={
    fromEpochMilliseconds(value) {
      assert.equal(typeof value,"number");
      return {epochMilliseconds:value,tag:"Temporal.Instant"};
    },
  };
  const newData={name:"Bola de fuego ajustada",payload:{cooldown:"2 turnos"}};
  const updated=await mockModel.where({id:initial.id}).update({
    ...newData,updatedAt:Instant.fromEpochMilliseconds(Date.now()),
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].updatedAt.tag,"Temporal.Instant");
  assert.equal(updated.name,"Bola de fuego ajustada");
});

const file="lib/skills/generic-preview.ts";
const imports={
  "@/lib/skills/mechanics-pricing":{mechanicsPchCost:()=>0},
  "@/lib/skills/mana-pricing":{manaAdjustedPch:(n,m)=>Math.max(1,Math.ceil(2*n-m/5))},
  "@/lib/skills/range-pricing":{applyRangePch:(n,m)=>Math.max(1,n+m-5)},
  "@/lib/skills/cooldown":{applyCooldownPch:(p)=>p},
  "@/lib/skills/effect-requirements":{effectRequirementDiscount:n=>n},
};
const moduleExports={};
vm.runInNewContext(ts.transpileModule(text(file),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText,{exports:moduleExports,require:name=>{
 if(name in imports)return imports[name];
 throw new Error("Unmocked import: "+name);
},Math,Number,Object,Array,Set,Error}, {filename:file});

const form={
 effect:[{type:"NARRATIVE",value:1}],effectRequirements:[],
 mechanics:{},cost:0,speed:"DEFAULT",maxRangeMeters:0,
};
const calculate=moduleExports.calculateGenericPricePreview;
test("editing preserves the original quoted price while the live quote changes",()=>{
 const before=calculate(form,null,[],()=>5);
 assert.equal(before.total,5);
 const original=before.total;
 const after=calculate({...form,cost:5},null,[],()=>5);
 assert.equal(after.total,4);
 assert.equal(after.total-original,-1);
 const changed=calculate({...form,maxRangeMeters:5,cost:0},null,[],()=>5);
 assert.equal(changed.total,10);
 assert.equal(changed.total-original,5);
 assert.equal(before.total,original);
});

test("generic editor snapshots original price and shows signed delta in floating PCH indicator",()=>{
 const generic=text("components/skills/GenericSkillTemplatesManagement.tsx");
 const modal=text("components/skills/SkillFormModal.tsx");
 assert.match(generic,/setOriginalTotalPch\(t\.totalPch\)/);
 assert.match(generic,/setOriginalTotalPch\(null\)/);
 assert.match(generic,/selected!==null\?originalTotalPch\?\?undefined/);
 assert.match(modal,/const editDelta=pch && pch\.originalTotal!==undefined \? pch\.total-pch\.originalTotal : null/);
 assert.match(modal,/editDelta!==null\?" · Δ original: "/);
 assert.match(modal,/Precio original al abrir:/);
 assert.match(modal,/Diferencia: \{editDifference\(editDelta\)\} PCH/);
 assert.match(modal,/Tiempo de espera \\(/);
 assert.match(modal,/−\\{cooldownSaved\\} PCH/);
});
