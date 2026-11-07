/**
 * Contract for business-managed repair services.
 * An advertised service is not an arbitrary executable skill; its only legal
 * intent is to restore one server-selected inventory copy.
 * Configurations live in AppSetting under a per-business key (no migration).
 */
import {emptyMicroState,executeMicroEvent,validateEffectContainers,
 type EffectContainer,type MicroIntent} from "../effects/micro-modules.ts";
import type {RepairableItem} from "../effects/repair-durability.ts";

export const REPAIR_SERVICE_PREFIX="business_repair_service_v1:";
export const businessRepairKey=(businessId:number)=>REPAIR_SERVICE_PREFIX+businessId;
export type RepairService={
 id:string;name:string;description:string;active:boolean;
 fee:number;materialItemId:number|null;materialQuantity:number;
 customerAccess:"PUBLIC"|"OWNER_ONLY";requiresEmployee:boolean;
 module:EffectContainer;
};
const digits=(n:unknown,min:number,max:number):n is number=>
 Number.isSafeInteger(n)&&Number(n)>=min&&Number(n)<=max;
const allowed=new Set(["READ_ITEM","READ_STAT","CALCULATE","REPAIR_DURABILITY"]);
function safeExpr(value:unknown):boolean{
 if(typeof value==="number")return Number.isFinite(value)&&value>=0&&value<=1_000_000;
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 if(v.source!==undefined)return (v.source==="OUTPUT"||v.source==="STAT")&&
  typeof v.key==="string"&&v.key.length>0;
 return ["ADD","SUBTRACT","MULTIPLY","DIVIDE","MIN","MAX","PERCENT"].includes(String(v.operator))&&
  Array.isArray(v.args)&&v.args.length>=1&&v.args.length<=8&&v.args.every(safeExpr);
}
export function defaultBusinessRepairModule():EffectContainer{
 return {id:"WorkshopRepair",name:"Reparación de taller",type:"BusinessService",
  description:"Repara el ejemplar seleccionado por el cliente.",
  trigger:"ACTIVATE",steps:[
   {kind:"READ_ITEM",selector:"SELECTED_ITEM",output:"targetItem"},
   {kind:"CALCULATE",expression:25,output:"repairAmount"},
   {kind:"REPAIR_DURABILITY",target:{source:"OUTPUT",key:"targetItem"},
    amount:{source:"OUTPUT",key:"repairAmount"}},
  ]};
}
export function normalizeRepairService(input:unknown):RepairService{
 if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Servicio inválido.");
 const x=input as Record<string,unknown>;
 if(Object.keys(x).some(k=>!["id","name","description","active","fee",
  "materialItemId","materialQuantity","customerAccess","requiresEmployee","module"].includes(k)))
  throw new Error("Campos del servicio desconocidos.");
 const id=String(x.id??"");
 if(!/^[A-Za-z0-9_-]{8,80}$/.test(id))throw new Error("Identificador de servicio inválido.");
 const name=typeof x.name==="string"?x.name.trim():"";
 if(!name||name.length>100)throw new Error("Nombre del servicio inválido.");
 const description=typeof x.description==="string"?x.description.trim():"";
 if(description.length>500)throw new Error("Descripción del servicio demasiado larga.");
 if(typeof x.active!=="boolean"||typeof x.requiresEmployee!=="boolean")
  throw new Error("Configuración de disponibilidad inválida.");
 if(!["PUBLIC","OWNER_ONLY"].includes(String(x.customerAccess)))
  throw new Error("Permiso del cliente inválido.");
 if(!digits(x.fee,0,1_000_000))throw new Error("Tarifa de reparación inválida.");
 const materialItemId=x.materialItemId==null?null:x.materialItemId;
 const materialQuantity=x.materialQuantity;
 if(materialItemId===null?materialQuantity!==0:!digits(materialItemId,1,2_147_483_647)||!digits(materialQuantity,1,100))
  throw new Error("Material o cantidad requeridos inválidos.");
 if(x.fee===0&&materialItemId===null)
  throw new Error("Configura una tarifa o al menos un material para la reparación.");
 const module=x.module as EffectContainer;
 const error=validateEffectContainers([module]);
 if(error)throw new Error(error);
 if(module.trigger!=="ACTIVATE"||module.impactKind!==undefined||
  module.requirements?.length||module.steps.length<2||module.steps.length>12)
  throw new Error("El servicio solo admite una activación directa de reparación.");
 const itemOutputs=new Set<string>();
 let repairCount=0;
 for(const step of module.steps){
  if(!allowed.has(step.kind)||step.when?.length)
   throw new Error("El servicio solo puede leer, calcular y reparar; sin efectos adicionales.");
  if(step.kind==="READ_ITEM"){
   if(step.selector!=="SELECTED_ITEM")throw new Error("El taller solo repara el objeto seleccionado.");
   itemOutputs.add(step.output);
  }
  if(step.kind==="READ_STAT"&&step.actor!=="USER")
   throw new Error("La fórmula solo puede leer estadísticas del reparador.");
  if(step.kind==="CALCULATE"&&!safeExpr(step.expression))
   throw new Error("La fórmula de reparación contiene una fuente no permitida.");
  if(step.kind==="REPAIR_DURABILITY"){
   repairCount++;
   if(!itemOutputs.has(step.target.key)||!safeExpr(step.amount))
    throw new Error("Conecta el objeto seleccionado y una cantidad numérica válida.");
  }
 }
 if(repairCount!==1||itemOutputs.size!==1)
  throw new Error("La reparación requiere un único destino de inventario y una única acción.");
 return {id,name,description,active:x.active as boolean,
  fee:x.fee as number,materialItemId:materialItemId as number|null,
  materialQuantity:materialQuantity as number,customerAccess:x.customerAccess as RepairService["customerAccess"],
  requiresEmployee:x.requiresEmployee as boolean,module:structuredClone(module)};
}
export function readBusinessRepairServices(value:unknown):RepairService[]{
 let data:unknown;
 try{data=typeof value==="string"?JSON.parse(value):value;}catch{return [];}
 if(!Array.isArray(data))return [];
 // Reject invalid stored rows rather than falling back to permissive defaults.
 const result:RepairService[]=[];
 const seen=new Set<string>();
 for(const entry of data){
  try{const service=normalizeRepairService(entry);
   if(!seen.has(service.id)){result.push(service);seen.add(service.id);}
  }catch{}
 }
 return result.slice(0,12);
}
export function evaluateBusinessRepairService(
 service:RepairService,item:RepairableItem,staffStats:Record<string,number>
):Extract<MicroIntent,{kind:"REPAIR_DURABILITY"}>{
 const valid=normalizeRepairService(service);
 const result=executeMicroEvent(emptyMicroState(),[valid.module],{
  eventId:"BusinessRepair",ownerId:item.characterItemId,trigger:"ACTIVATE",
  stats:staffStats,actors:{USER:staffStats},
  itemTargets:[item],itemSelectors:{SELECTED_ITEM:item.characterItemId}
 });
 if(result.intents.length!==1||result.intents[0].kind!=="REPAIR_DURABILITY"||
   result.intents[0].characterItemId!==item.characterItemId)
  throw new Error("El servicio produjo una reparación no autorizada.");
 const change=result.intents[0] as Extract<MicroIntent,{kind:"REPAIR_DURABILITY"}>;
 if(change.applied<=0)throw new Error("El objeto ya está reparado o la fórmula no recupera durabilidad.");
 return change;
}
