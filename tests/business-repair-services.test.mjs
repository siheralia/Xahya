import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {calculateDurabilityRepair} from "../lib/effects/repair-durability.ts";
import {
 businessRepairKey,defaultBusinessRepairModule,normalizeRepairService,
 readBusinessRepairServices,evaluateBusinessRepairService,
} from "../lib/business-repair.ts";
import {
 MANAGED_REPAIR_SERVICES_KEY,normalizeManagedRepairService,readManagedRepairServices,
 authorizedRepairServices,checkManagedRepairServiceLimits
} from "../lib/managed-repair-services.ts";

const source=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const example=()=>({
 id:"RepairStandard001",name:"Herrería",description:"Servicio de reparación.",
 active:true,fee:30,materialItemId:null,materialQuantity:0,
 customerAccess:"PUBLIC",requiresEmployee:false,
 module:defaultBusinessRepairModule(),
});
test("legacy per-business keys remain isolated, but authorization is now global",()=>{
 assert.equal(businessRepairKey(8),"business_repair_service_v1:8");
 assert.notEqual(businessRepairKey(8),businessRepairKey(9));
});
test("default service repairs only SELECTED_ITEM through typed modular graph",()=>{
 const service=normalizeRepairService(example());
 const change=evaluateBusinessRepairService(service,{characterItemId:123,durability:65},{HP:100,MAX_HP:100});
 assert.equal(change.characterItemId,123);
 assert.equal(change.applied,25);
 assert.equal(change.after,90);
 assert.equal(change.before,65);
 const capped=evaluateBusinessRepairService(service,{characterItemId:123,durability:95},{HP:100,MAX_HP:100});
 assert.equal(capped.after,100);assert.equal(capped.applied,5);
 assert.deepEqual(calculateDurabilityRepair({characterItemId:123,durability:95},25),{
  characterItemId:123,requested:25,applied:5,before:95,after:100
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
 const result=evaluateBusinessRepairService(service,{characterItemId:45,durability:10},{HP:100,MAX_HP:100,STR:12});
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
test("only administration can define services and assign eligible businesses",()=>{
 const oldRoute=source("app/api/businesses/repair-services/route.ts");
 const staffRoute=source("app/api/management/businesses/repair-services/route.ts");
 assert.match(oldRoute,/export async function POST\(\)/);
 assert.match(oldRoute,/status:403/);
 assert.doesNotMatch(oldRoute,/normalizeRepairService/);
 assert.match(oldRoute,/authorizedRepairServices/);
 assert.match(staffRoute,/String\(user.role\)==="ADMIN"/);
 assert.match(staffRoute,/normalizeManagedRepairService/);
 assert.match(staffRoute,/MANAGED_REPAIR_SERVICES_KEY/);
 assert.match(staffRoute,/checkManagedRepairServiceLimits/);
 assert.match(staffRoute,/AuditLog.create/);
 assert.match(staffRoute,/String\(material.itemType\)!=="MATERIAL"/);
});

test("catalog allowlists, active status and validation are authoritative",()=>{
 const s=normalizeManagedRepairService({...example(),businessIds:[8,3]});
 assert.deepEqual(s.businessIds,[3,8]);
 const other=normalizeManagedRepairService({...example(),id:"RepairOther001",businessIds:[3]});
 const inactive=normalizeManagedRepairService({...example(),id:"RepairOff00001",
  active:false,businessIds:[8]});
 assert.deepEqual(authorizedRepairServices([s,other,inactive],8).map(x=>x.id),[s.id]);
 assert.deepEqual(authorizedRepairServices([s,other,inactive],3).map(x=>x.id),[s.id,other.id]);
 assert.deepEqual(authorizedRepairServices([s,other,inactive],9),[]);
 assert.deepEqual(authorizedRepairServices([s,inactive],8,true).map(x=>x.id),[s.id,inactive.id]);
 assert.deepEqual(readManagedRepairServices(JSON.stringify([s,other,{...s,fee:-1},s])),
  [s,other],"invalid and duplicate stored services fail closed");
 for(const ids of [[0],[-1],[3,3],[4.5],["3"],Array.from({length:501},(_,i)=>i+1)]){
  assert.throws(()=>normalizeManagedRepairService({...example(),businessIds:ids}),/negocios válidos/);
 }
 assert.throws(()=>normalizeManagedRepairService({...example(),businessIds:[3],forgedEffect:true}),
  /desconocidos/);
 const assigned=Array.from({length:13},(_,i)=>normalizeManagedRepairService({
  ...example(),id:"RepairTest"+String(i).padStart(8,"0"),businessIds:[7]
 }));
 assert.throws(()=>checkManagedRepairServiceLimits(assigned),/Máximo 12/);
 checkManagedRepairServiceLimits(assigned.slice(0,12));
 assert.equal(MANAGED_REPAIR_SERVICES_KEY,"managed_repair_services_v1");
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
 assert.match(code,/MANAGED_REPAIR_SERVICES_KEY/);
 assert.match(code,/authorizedRepairServices/);
 assert.match(code,/lockCatalog/);
 assert.doesNotMatch(code,/businessRepairKey\(businessId\)/);

});
test("only the management page edits modular repair plans and assigns businesses",()=>{
 const staff=source("app/management/businesses/repair-services/page.tsx");
 const owner=source("components/businesses/RepairServicesPanel.tsx");
 const page=source("app/businesses/page.tsx");
 const shop=source("app/businesses/repair/page.tsx");
 const catalog=source("app/businesses/catalog/page.tsx");
 const nav=source("app/management/_components/ManagementNavigation.tsx");
 const businessesCatalog=source("app/api/businesses/catalog/route.ts");
 assert.match(staff,/<MicroEffectBuilder value=\{draft.module\}/);
 assert.match(staff,/toggleBusiness/);
 assert.match(staff,/businessIds/);
 assert.match(staff,/requiresEmployee/);
 assert.match(staff,/api\/management\/businesses\/repair-services/);
 assert.doesNotMatch(owner,/MicroEffectBuilder|onClick=\{\(\)=>action\("save"\)/);
 assert.match(owner,/Servicios de reparación autorizados/);
 assert.match(page,/<RepairServicesPanel businessId=\{business.id\}/);
 assert.match(shop,/api\/businesses\/repair"/);
 assert.match(shop,/requestId:"Workshop"/);
 assert.match(shop,/characterItemId:Number\(itemId\)/);
 assert.match(catalog,/href="\/businesses\/repair"/);
 assert.match(nav,/adminOnly: true/);
 assert.match(businessesCatalog,/repairEnabled:authorizedRepairServices/);
 assert.match(shop,/filter\(shop=>shop.repairEnabled===true\)/);
 assert.match(staff,/Negocios autorizados/);
});
