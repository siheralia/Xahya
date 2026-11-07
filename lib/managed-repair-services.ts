/** Authoritative service definitions belong to staff, not business owners.
 * All catalog entries and their business allowlists are held in one AppSetting
 * document, so a single transaction updates offers and authorization together.
 * Legacy business_repair_service_v1:* rows are intentionally never executed.
 */
import {normalizeRepairService,type RepairService} from "./business-repair.ts";

export const MANAGED_REPAIR_SERVICES_KEY="managed_repair_services_v1";
export const MAX_MANAGED_REPAIR_SERVICES=100;
export const MAX_REPAIR_SERVICES_PER_BUSINESS=12;
export type ManagedRepairService=RepairService&{businessIds:number[]};

export function normalizeManagedRepairService(input:unknown):ManagedRepairService {
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw new Error("Servicio de gestión inválido.");
 const {businessIds,...config}=input as Record<string,unknown>;
 if(!Array.isArray(businessIds)||businessIds.length>500||
  businessIds.some(id=>!Number.isSafeInteger(id)||id<=0)||
  new Set(businessIds).size!==businessIds.length)
  throw new Error("Selecciona negocios válidos sin duplicados.");
 const base=normalizeRepairService(config);
 return {...base,businessIds:[...businessIds].sort((a,b)=>a-b)};
}

export function readManagedRepairServices(value:unknown):ManagedRepairService[]{
 let data:unknown;
 try{data=typeof value==="string"?JSON.parse(value):value;}catch{return [];}
 if(!Array.isArray(data))return [];
 const result:ManagedRepairService[]=[];
 const ids=new Set<string>();
 for(const entry of data){
  try{
   const service=normalizeManagedRepairService(entry);
   if(!ids.has(service.id)){result.push(service);ids.add(service.id);}
  }catch{ /* malformed catalog entries may never execute */ }
 }
 return result.slice(0,MAX_MANAGED_REPAIR_SERVICES);
}

export function authorizedRepairServices(
 catalog:readonly ManagedRepairService[],businessId:number,includeInactive=false
):RepairService[]{
 if(!Number.isSafeInteger(businessId)||businessId<=0)return [];
 return catalog.filter(x=>x.businessIds.includes(businessId)&&(includeInactive||x.active))
  .slice(0,MAX_REPAIR_SERVICES_PER_BUSINESS)
  .map(({businessIds:_,...service})=>service);
}

export function checkManagedRepairServiceLimits(catalog:readonly ManagedRepairService[]){
 if(catalog.length>MAX_MANAGED_REPAIR_SERVICES)
  throw new Error("Máximo 100 servicios en el catálogo.");
 const ids=new Set<string>(),counts=new Map<number,number>();
 for(const entry of catalog){
  const service=normalizeManagedRepairService(entry);
  if(ids.has(service.id))throw new Error("Hay servicios duplicados.");
  ids.add(service.id);
  for(const id of service.businessIds){
   const count=(counts.get(id)??0)+1;
   if(count>MAX_REPAIR_SERVICES_PER_BUSINESS)
    throw new Error("Máximo 12 servicios asignados por negocio.");
   counts.set(id,count);
  }
 }
}
