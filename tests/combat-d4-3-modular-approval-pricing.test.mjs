import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 MODULAR_APPROVAL_FIELDS,hasComposedEffects,
 modularApprovedEditChanges,modularApprovedEditError,
} from "../lib/skills/modular-approval-lock.ts";
import {
 composedDepositPch,pricedModularStepCount,
} from "../lib/skills/composed-effects.ts";

const module=()=>({
 id:"D4PCH",name:"Golpe modular",type:"COMPOSED",
 description:"Módulos revisados",trigger:"ACTIVATE",
 steps:[{kind:"HEAL",amount:5}],
});
const modular=()=>[{type:"COMPOSED",module:module(),reviewedPch:15}];
const approved=()=>({
 status:"APPROVED",effect:modular(),mechanics:{rules:[]},effectRequirements:[],
 cost:10,maintenanceCost:0,accumulationCost:0,accumulationPerTick:0,
 category:"SUPPORT",duration:"2 turnos",cooldown:"1 turno",speed:"DEFAULT",
 areaOfEffect:"Objetivo único | Alcance máximo: 5 m",
 attackType:null,defenseType:null,condition:null,pchCost:25,
 name:"Habilidad A",description:"Descripción A",
});

test("D4.3: no edits and text-only edits preserve approved price and permission",()=>{
 const original=approved();
 assert.deepEqual(modularApprovedEditChanges(original,structuredClone(original),"edit"),[]);
 assert.equal(modularApprovedEditError(original,{...original,name:"Nueva descripción",description:"Más detalles"},"edit"),null);
 const reordered={...original,mechanics:{rules:[]},effect:[{
  reviewedPch:15,module:{...module(),steps:[{amount:5,kind:"HEAL"}]},type:"COMPOSED",
 }]};
 assert.deepEqual(modularApprovedEditChanges(original,reordered,"edit"),[]);
});

test("D4.3: all priced fields require review rather than a free edit",()=>{
 const before=approved();
 const examples={
  effect:[...modular(),{type:"STAT_BONUS",target:"STR",value:1}],
  mechanics:{rules:[{newAction:"BONUS"}]},
  effectRequirements:[{kind:"STATE",value:"READY"}],
  cost:1,maintenanceCost:1,accumulationCost:2,accumulationPerTick:3,
  category:"OFFENSIVE",duration:"10 turnos",cooldown:"Sin cooldown",
  speed:"Instantánea",areaOfEffect:"Objetivo único | Alcance máximo: 100 m",
  attackType:"CUT",defenseType:"SOLID",condition:"Siempre",pchCost:1,
 };
 assert.deepEqual(Object.keys(examples).sort(),[...MODULAR_APPROVAL_FIELDS].sort());
 for(const [field,value] of Object.entries(examples)){
  const result=modularApprovedEditError(before,{...before,[field]:value},"edit");
  assert.ok(result?.includes("PCH"),field);
 }
});

test("D4.3: removing the only modular effect does not evade reapproval",()=>{
 const before=approved();
 const after={...before,effect:[],pchCost:0};
 assert.equal(hasComposedEffects(after.effect),false);
 assert.match(modularApprovedEditError(before,after,"edit"),/efectos y conexiones/);
 assert.deepEqual(modularApprovedEditChanges(before,after,"approve"),[]);
});

test("D4.3: approvals and rejections may proceed to the authoritative price/accounting path",()=>{
 const before=approved();
 assert.equal(modularApprovedEditError(before,{...before,cost:0},"approve"),null);
 assert.equal(modularApprovedEditError(before,{...before,effect:[]},"reject"),null);
 assert.equal(modularApprovedEditError({...before,status:"PENDING"},{...before,cost:0},"edit"),null);
 assert.equal(modularApprovedEditError({...before,effect:[]},{...before,effect:[]},"edit"),null);
});

test("D4.3: action count cannot be lowered by adding free arithmetic or connections",()=>{
 const effect=module();
 const original=pricedModularStepCount(effect);
 effect.steps.unshift({kind:"CALCULATE",output:"base",expression:7});
 effect.steps.push({kind:"DAMAGE",channel:"MAGICAL",amount:{source:"OUTPUT",key:"base"}});
 assert.equal(original,1);
 assert.equal(pricedModularStepCount(effect),2);
 assert.equal(composedDepositPch({type:"COMPOSED",module:effect}),10);
});

test("D4.3: PATCH guards review and price even when the submitted graph is removed",()=>{
 const src=readFileSync(new URL("../app/api/management/skills/[id]/route.ts",import.meta.url),"utf8");
 assert.match(src,/const hadComposed=hasComposedEffects\(skill\.effect\)/);
 assert.match(src,/const modularPriceSensitive=hasComposed\|\|hadComposed/);
 assert.match(src,/modularApprovedEditError\(/);
 assert.match(src,/if\(body\.approve===true && modularPriceSensitive\)/);
 assert.match(src,/requestedPchCost!==exact/);
 assert.match(src,/if\(modularApprovedEditError\(\{/);
 assert.match(src,/MODULAR_PCH_REAPPROVAL/);
 assert.match(src,/status: approve \? "APPROVED"/);
});
