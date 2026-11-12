import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {eligibleCraftArtisans,computeCraftQualityPlan} from "../lib/crafting-artisans.ts";

const src=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const stats=(intelligence,wisdom,agility)=>({intelligence,wisdom,agility});
const ingredients=[
 {itemId:11,quantity:1},{itemId:12,quantity:4},
 {itemId:13,quantity:5},{itemId:14,quantity:20}
];
test("quality grades depend only on bounded, effective artisan statistics",()=>{
 const normal=computeCraftQualityPlan(stats(20,20,20),ingredients);
 assert.equal(normal.score,20);assert.equal(normal.grade,"NORMAL");
 assert.deepEqual(normal.inputs,ingredients);
 assert.deepEqual(normal.savings,[]);
 const expert=computeCraftQualityPlan(stats(40,40,40),ingredients);
 assert.equal(expert.score,40);assert.equal(expert.grade,"EXPERTO");
 assert.equal(expert.efficiencyPercent,20);
 assert.deepEqual(expert.inputs,[
  {itemId:11,quantity:1},{itemId:12,quantity:4},
  {itemId:13,quantity:4},{itemId:14,quantity:16}
 ]);
 assert.deepEqual(expert.savings,[
  {itemId:13,quantity:1},{itemId:14,quantity:4}
 ]);
 const master=computeCraftQualityPlan(stats(75,75,75),ingredients);
 assert.equal(master.grade,"MAESTRO");assert.equal(master.score,75);
 assert.equal(master.efficiencyPercent,25);
 assert.deepEqual(master.inputs,[
  {itemId:11,quantity:1},{itemId:12,quantity:3},
  {itemId:13,quantity:4},{itemId:14,quantity:15}
 ]);
 assert.deepEqual(master.savings,[
  {itemId:12,quantity:1},{itemId:13,quantity:1},{itemId:14,quantity:5}
 ]);
 assert.deepEqual(computeCraftQualityPlan(stats(9999,9999,9999),ingredients).inputs,master.inputs,
  "very high stats cannot grant unbounded free materials");
});
test("weighted intelligence, wisdom and agility are used, missing or invalid stats fail closed",()=>{
 const plan=computeCraftQualityPlan(stats(80,40,20),[{itemId:9,quantity:10}]);
 assert.equal(plan.score,56);assert.equal(plan.grade,"EXPERTO");
 assert.deepEqual(plan.inputs,[{itemId:9,quantity:8}]);
 for(const bad of [stats(-1,40,40),stats(NaN,40,40),stats(Infinity,40,40),
  {intelligence:40,wisdom:40},{}])
  assert.throws(()=>computeCraftQualityPlan(bad,[{itemId:1,quantity:8}]),/estadísticas/);
 for(const invalid of [[{itemId:1,quantity:0}],[{itemId:1,quantity:1.5}],[{itemId:0,quantity:4}]])
  assert.throws(()=>computeCraftQualityPlan(stats(100,100,100),invalid),/Ingrediente/);
});
test("artisans are selected from valid active contracts, and owner only if employee not required",()=>{
 const positions=[
  {id:1,businessId:3,active:true},{id:2,businessId:3,active:false},
  {id:4,businessId:99,active:true}
 ];
 const contracts=[
  {id:1,positionId:1,characterId:50,active:true},
  {id:2,positionId:1,characterId:51,active:false},
  {id:3,positionId:2,characterId:52,active:true},
  {id:4,positionId:4,characterId:53,active:true},
  {id:5,positionId:1,characterId:50,active:true},
 ];
 const characters=[
  {id:10,name:"Dueña"},{id:50,name:"Herrera"},
  {id:51,name:"Despedida"},{id:52,name:"Turno cerrado"},{id:53,name:"Otro negocio"}
 ];
 const params={ownerCharacterId:10,positions:positions.filter(x=>x.businessId===3),contracts,characters};
 assert.deepEqual(eligibleCraftArtisans({...params,requiresEmployee:true}),[
  {characterId:50,name:"Herrera",source:"EMPLOYEE",contractId:1,positionId:1}
 ]);
 assert.deepEqual(eligibleCraftArtisans({...params,requiresEmployee:false}),[
  {characterId:10,name:"Dueña",source:"OWNER",contractId:null,positionId:null},
  {characterId:50,name:"Herrera",source:"EMPLOYEE",contractId:1,positionId:1}
 ]);
 assert.deepEqual(eligibleCraftArtisans({...params,requiresEmployee:true,contracts:[]}),[]);
});
test("server validates selected artisan and transactionally derives discounts; never trusts client stats",()=>{
 const api=src("app/api/businesses/crafting/route.ts");
 assert.match(api,/artisanCharacterId/);
 assert.match(api,/eligibleCraftArtisans/);
 assert.match(api,/find\(x=>x.characterId===requestedArtisanId\)/);
 assert.match(api,/UPDATE public."employmentContract" SET id=id WHERE id=/);
 assert.match(api,/BusinessPosition/);
 assert.match(api,/artisan.source==="EMPLOYEE"/);
 assert.match(api,/getEffectiveCharacterStats\(artisan.characterId,tx\)/);
 assert.match(api,/computeCraftQualityPlan\(/);
 assert.match(api,/allocateCraftMaterials\(craftsmanship.inputs,/);
 assert.doesNotMatch(api,/computeCraftQualityPlan\(body/);
 assert.match(api,/ARTISAN_IN_COMBAT/);
 assert.match(api,/requestedArtisanId,result:receipt/);
 assert.match(api,/\(data\?\.requestedArtisanId\?\?null\)!==requestedArtisanId/);
 assert.match(api,/savedMaterials:craftsmanship.savings/);
});
test("client selects an authorized artisan and receipts show savings without falsely blocking discounted inputs",()=>{
 const ui=src("app/businesses/crafting/page.tsx");
 assert.match(ui,/Artesano responsable/);
 assert.match(ui,/selected.artisans.map/);
 assert.match(ui,/artisanCharacterId:artisan.characterId/);
 assert.match(ui,/currentRequest.current=null/);
 assert.match(ui,/data.craftsmanship\?\.savedMaterials/);
 assert.match(ui,/Materiales de la receta \(consumo máximo\)/);
 assert.doesNotMatch(ui,/selected.materials.every\(x=>holdings\(x.itemId\)>=x.quantity\)&&!busy/);
});
