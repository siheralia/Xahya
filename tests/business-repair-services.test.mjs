import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {calculateDurabilityRepair} from "../lib/effects/repair-durability.ts";
import {
 businessRepairKey,defaultBusinessRepairModule,normalizeRepairService,
 readBusinessRepairServices,evaluateBusinessRepairService,
} from "../lib/business-repair.ts";

const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const example=()=>({
 id:"RepairStandard001",name:"Herrería",description:"Servicio de reparación.",
 active:true,fee:30,materialItemId:null,materialQuantity:0,
 customerAccess:"PUBLIC",requiresEmployee:false,
 module:defaultBusinessRepairModule(),
});
test("one setting key per business, never an unowned global service",()=>{
 assert.equal(businessRepairKey(8),"business_repair_service_v1:8");
 assert.notEqual(businessRepairKey(8),businessRepairKey(9));
});
test("default service repairs only SELECTED_ITEM through typed modular graph",()=>{
 const service=normalizeRepairService(example());
 const change=evaluateBusinessRepairService(service,{characterItemId:123,durability:65},{});
 assert.equal(change.characterItemId,123);
 assert.equal(change.applied,25);
 assert.equal(change.after,90);
 assert.equal(change.before,65);
 const capped=evaluateBusinessRepairService(service,{characterItemId:123,durability:95},{});
 assert.equal(capped.after,100);assert.equal(capped.applied,5);
 assert.deepEqual(calculateDurabilityRepair({characterItemId:123,durability:95},25),{
  characterItemId:123,durability:undefined,requested:25,applied:5,before:95,after:100
 },"original calculation module sets a single copy");
});
test("out-of-range fees, quantities and malformed permissions are rejected",()=>{
 const x=example();
 for(const fee of [-1,1.25,Infinity,1000001,NaN])
  assert.throws(()=>normalizeRepairService({...x,fee}),/Tarifa/);
 for(const quantity of [-1,0,101,1.25])
  assert.throws(()=>normalizeRepairService({...x,materialItemId:12,materialQuantity:quantity}),/Material/);
 assert.throws(()=>normalizeRepairService({...x,customerAccess:"SUPPORT"}),/Permiso/);
 assert.throws(()=>normalizeRepairService({...x,requiresEmployee:"false"}),/disponibilidad/);
 assert.throws(()=>normalizeRepairService({...x,active:1}),/disponibilidad/);
 assert.throws(()=>normalizeRepairService({...x,materialItemId:9,materialQuantity:0}),/Material/);
 assert.throws(()=>normalizeRepairService({...x,fee:0}),/tarifa o al menos un material/);
 const material=normalizeRepairService({...x,fee:0,materialItemId:23,materialQuantity:2});
 assert.equal(material.fee,0);assert.equal(material.materialQuantity,2);
});
test("service graph cannot heal, damage, use free charges, or select other copies",()=>{
 const x=example();
 const base=defaultBusinessRepairModule();
 for(const step of [
  {kind:"HEAL",amount:50},{kind:"DAMAGE",amount:25,channel:"PHYSICAL"},
  {kind:"STORE",accumulator:"coins",capacity:50,value:1},
 ]){
  assert.throws(()=>normalizeRepairService({...x,module:{
   ...base,steps:[...base.steps,step]}}),/solo puede leer|invalid|efecto|inválid/i);
 }
 const target={...base,steps:[{...base.steps[0],selector:"SOURCE_ITEM"},...base.steps.slice(1)]};
 assert.throws(()=>normalizeRepairService({...x,module:target}),/objeto seleccionado/);
 const wrong={
  ...base,steps:[...base.steps,{kind:"REPAIR_DURABILITY",
    target:{source:"OUTPUT",key:"targetItem"},amount:1}],
 };
 assert.throws(()=>normalizeRepairService({...x,module:wrong}),/única acción/);
});
test("service module accepts owner stats and arithmetic without trusting client stats",()=>{
 const x=example();
 const module={...defaultBusinessRepairModule(),steps:[
  {kind:"READ_ITEM",selector:"SELECTED_ITEM",output:"selected"},
  {kind:"READ_STAT",actor:"USER",stat:"STR",output:"base"},
  {kind:"CALCULATE",expression:{operator:"MULTIPLY",args:[
   {source:"OUTPUT",key:"base"},2]},output:"amount"},
  {kind:"REPAIR_DURABILITY",target:{source:"OUTPUT",key:"selected"},
   amount:{source:"OUTPUT",key:"amount"}},
 ]};
 const service=normalizeRepairService({...x,module});
 const result=evaluateBusinessRepairService(service,{characterItemId:45,durability:10},{STR:12});
 assert.equal(result.applied,24);
 assert.equal(result.characterItemId,45);
 const invalid={...module,steps:module.steps.map(s=>
  s.kind==="READ_STAT"?{...s,actor:"OPPONENT"}:s)};
 assert.throws(()=>normalizeRepairService({...x,module:invalid}),/reparador/);
});
test("free event sources and unowned selector outputs fail closed",()=>{
 const x=example();
 const base=defaultBusinessRepairModule();
 const withEvent={...base,steps:base.steps.map(s=>s.kind==="CALCULATE"?
  {...s,expression:{source:"EVENT",key:"APPLIED_DAMAGE"}}:s)};
 assert.throws(()=>normalizeRepairService({...x,module:withEvent}),/fuente no permitida/);
 const otherTarget={...base,steps:base.steps.map(s=>s.kind==="REPAIR_DURABILITY"?
  {...s,target:{source:"OUTPUT",key:"notRead"}}:s)};
 assert.throws(()=>normalizeRepairService({...x,module:otherTarget}),/conecta|conecta|objeto|salida/i);
});
test("invalid historical offers never execute; valid rows keep stable IDs",()=>{
 const a=example(),b={...a,id:"RepairPremium0002",fee:100};
 const c=readBusinessRepairServices(JSON.stringify([a,b,{...a,fee:-1},a]));
 assert.deepEqual(c.map(x=>x.id),[a.id,b.id]);
 assert.deepEqual(readBusinessRepairServices("{invalid"),[]);
 assert.deepEqual(readBusinessRepairServices(null),[]);
});
test("service management endpoint is owner-only, business-scoped and validates MATERIAL",()=>{
 const code=source("app/api/businesses/repair-services/route.ts");
 assert.match(code,/ownerOrAdmin\(user,business,tx\)/);
 assert.match(code,/UPDATE public\."business" SET id=id/);
 assert.match(code,/businessRepairKey\(businessId\)/);
 assert.match(code,/String\(material.itemType\)!=="MATERIAL"/);
 assert.match(code,/AuditLog\.create/);
 assert.match(code,/normalizeRepairService/);
});
test("purchase endpoint debits material and money and repairs one copy in one transaction",()=>{
 const code=source("app/api/businesses/repair/route.ts");
 assert.match(code,/await db.transaction\(async tx=>/);
 assert.match(code,/UPDATE public\."character" SET id=id/);
 assert.match(code,/UPDATE public\."business" SET id=id/);
 assert.match(code,/UPDATE public\."characterItem" SET id=id/);
 assert.match(code,/quantity=1/);
 assert.match(code,/AND equipped=false AND quantity>=/);
 assert.match(code,/remaining!==0/);
 assert.match(code,/money<service.fee/);
 assert.match(code,/balance:Number\(business.balance\)\+service.fee/);
 assert.match(code,/SET durability=LEAST\(100,durability\+/);
 assert.match(code,/Audit.create/);
});
test("purchase rejects spoofed client item copies, combat, absent employees and unauthorized customers",()=>{
 const code=source("app/api/businesses/repair/route.ts");
 assert.match(code,/Number\(character.userId\)!==Number\(user.id\)/);
 assert.match(code,/REQUEST_REUSED/);
 assert.match(code,/action:"BUSINESS_ITEM_REPAIR"/);
 assert.match(code,/data.characterItemId!==characterItemId\|\|data.serviceId!==serviceId/);
 assert.match(code,/WHERE status='ACTIVE'/);
 assert.match(code,/ownerCharacterId\)!==characterId/);
 assert.match(code,/EmploymentContract/);
 assert.match(code,/service.requiresEmployee/);
 assert.match(code,/service.customerAccess==="OWNER_ONLY"/);
 assert.match(code,/getEffectiveCharacterStats\(ownerId,tx\)/);
 assert.match(code,/evaluateBusinessRepairService/);
});
test("owner graph editor, shop browser and catalog navigation are wired",()=>{
 const admin=source("components/businesses/RepairServicesPanel.tsx");
 const page=source("app/businesses/page.tsx");
 const shop=source("app/businesses/repair/page.tsx");
 const catalog=source("app/businesses/catalog/page.tsx");
 assert.match(admin,/<MicroEffectBuilder value=\{draft.module\}/);
 assert.match(admin,/required|requiresEmployee/);
 assert.match(page,/<RepairServicesPanel businessId=\{business.id\}/);
 assert.match(shop,/api\/businesses\/repair"/);
 assert.match(shop,/requestId:"Workshop"/);
 assert.match(shop,/characterItemId:Number\(itemId\)/);
 assert.match(catalog,/href="\/businesses\/repair"/);
});
