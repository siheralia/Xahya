const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");

const source=fs.readFileSync(require("node:path").join(__dirname,"../lib/skills/generic-catalog.ts"),"utf8");
const catalogExports={};
const quotePayload=async payload=>{
 if(!Array.isArray(payload.effect)||payload.effect.length===0)throw Error("Missing effects");
 if(payload.effect.some(e=>e.element==="$ELEMENT"))throw Error("Unresolved element");
 return {payload,pch:payload.effect.reduce((sum,e)=>sum+5+(e.element&&e.element!=="NEUTRAL"?2:0),0)};
};
vm.runInNewContext(ts.transpileModule(source,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{exports:catalogExports,require:(name)=>{
 if(name==="../../lib/skills/upgrade"||name==="@/lib/skills/upgrade")return {priceUpgrade:quotePayload};
 if(name==="@/lib/combat/matchup-types")return {validateSkillCombatTypes:()=>null};
 throw Error("Unexpected dependency: "+name);
},Set,Number,Object,Array,String,Error}, {filename:"generic-catalog.ts"});
const {genericTemplateChain,resolveGenericSkill,quoteGenericSkill,normalizeGenericPayload,validateGenericTemplateSettings,evolveGenericSkillSnapshot}=catalogExports;
const base={id:1,name:"Escudo base",description:"Escudo de maná",parentTemplateId:null,enabled:true,elementChoice:false,
 payload:{name:"Escudo base",description:"Escudo de maná",category:"SUPPORT",
 cost:20,maintenanceCost:0,accumulationCost:0,accumulationPerTick:0,
 duration:"1 turno",areaOfEffect:"Objetivo único",maxRangeMeters:5,
 speed:"DEFAULT",cooldown:"Sin cooldown",condition:"",
 effect:[{type:"NARRATIVE",description:"Protege de efectos invasivos",element:"NEUTRAL"}],
 effectRequirements:[],mechanics:{rules:[]}}};
const variant={id:2,name:"Escudo elemental",description:"Escudo imbuido",parentTemplateId:1,enabled:true,elementChoice:true,
 payload:{...base.payload,name:"Escudo elemental",description:"Escudo imbuido",
 effect:[{type:"ELEMENTAL_IMBUE",target:"SELF",element:"$ELEMENT",value:1}],
 mechanics:{rules:[{event:"ACTIVATE",actions:[{kind:"STATUS",status:"PROTECTED",target:"SELF",durationTurns:1}]}]}}};
test("una variante hereda efectos sin duplicar la habilidad base",()=>{
 const resolved=resolveGenericSkill([base,variant],2,"FIRE");
 assert.equal(resolved.skill.effect.length,2);
 assert.equal(resolved.skill.effect[1].element,"FIRE");
 assert.equal(resolved.skill.mechanics.rules.length,1);
 assert.equal(resolved.skill.name,"Escudo elemental");
});
test("el coste de la especialización no vuelve a incluir la base",async()=>{
 const baseQuote=await quoteGenericSkill([base,variant],1);
 const variantQuote=await quoteGenericSkill([base,variant],2,"FIRE");
 assert.equal(baseQuote.pchCost,5);
 assert.equal(variantQuote.totalPch,12);
 assert.equal(variantQuote.pchCost,7);
 assert.equal(variantQuote.parentTotalPch,5);
});
test("elementos variables requieren selección no neutra",()=>{
 assert.throws(()=>resolveGenericSkill([base,variant],2),/elemento/i);
 assert.throws(()=>resolveGenericSkill([base,variant],2,"NEUTRAL"),/elemento/i);
});
test("no se permite que un padre genere ciclos",()=>{
 const broken={...base,parentTemplateId:2};
 assert.throws(()=>genericTemplateChain([broken,variant],2),/ciclo/i);
});
test("una plantilla no fija habilidades de otro personaje",()=>{
 const bad={...base,payload:{...base.payload,mechanics:{rules:[{event:"ACTIVATE",linkedSkillId:18,actions:[{kind:"STATUS",status:"BUFF",target:"SELF",durationTurns:1}]}]}}};
 assert.match(validateGenericTemplateSettings(bad,false),/personaje/);
});
test("solo los efectos de imbuición ganan el marcador de selección",()=>{
 const payload=normalizeGenericPayload({effect:[
  {type:"NARRATIVE",element:"NEUTRAL"},
  {type:"ELEMENTAL_IMBUE",element:"FIRE"},
 ]},true);
 assert.equal(payload.effect[0].element,"NEUTRAL");
 assert.equal(payload.effect[1].element,"$ELEMENT");
});

test("evolución preserva mejoras personalizadas de la base",()=>{
 const customized={
  effect:[...base.payload.effect,{type:"STAT_BONUS",target:"AGI",value:10,element:"NEUTRAL"}],
  effectRequirements:[],
  mechanics:{rules:[]},
 };
 const completed=resolveGenericSkill([base,variant],2,"FIRE").skill;
 const result=evolveGenericSkillSnapshot(customized,variant,completed,"FIRE");
 assert.equal(result.effect.length,3);
 assert.equal(result.effect[1].type,"STAT_BONUS");
 assert.equal(result.effect[2].type,"ELEMENTAL_IMBUE");
 assert.equal(result.effect[2].element,"FIRE");
});
