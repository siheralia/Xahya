import {auth} from "@clerk/nextjs/server";
import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {
 MANAGED_REPAIR_SERVICES_KEY,normalizeManagedRepairService,readManagedRepairServices,
 checkManagedRepairServiceLimits,type ManagedRepairService
} from "@/lib/managed-repair-services";

async function getAdmin(){
 const {userId:clerkId}=await auth();
 if(!clerkId)return null;
 const user=(await db.orm.public.User.all()).find(u=>u.clerkId===clerkId);
 return user&&String(user.role)==="ADMIN"?user:null;
}

export async function GET(){
 const admin=await getAdmin();
 if(!admin)return NextResponse.json({error:"Solo administración puede definir servicios."},{status:403});
 const Settings=(db.orm.public as any).AppSetting;
 const [row,businesses,items]=await Promise.all([
  Settings.where({key:MANAGED_REPAIR_SERVICES_KEY}).first(),
  (db.orm.public as any).Business.all(),
  (db.orm.public as any).Item.all()
 ]);
 return NextResponse.json({
  services:readManagedRepairServices(row?.value),
  businesses:businesses.map((b:any)=>({id:Number(b.id),name:String(b.name),active:Boolean(b.active)})),
  materials:items.filter((i:any)=>String(i.itemType)==="MATERIAL")
   .map((i:any)=>({id:Number(i.id),name:String(i.name)}))
 });
}

/** Only system admins can create formulas, prices, or whitelist businesses.
 * Never accept owner-submitted service definitions or per-business overrides.
 */
export async function POST(req:Request){
 const admin=await getAdmin();
 if(!admin)return NextResponse.json({error:"Solo administración puede configurar servicios."},{status:403});
 const body=await req.json().catch(()=>null);
 if(!body||!["save","delete"].includes(body.action))
  return NextResponse.json({error:"Operación de servicio inválida."},{status:400});
 try{
  const services=await db.transaction(async tx=>{
   const Settings=(tx.orm.public as any).AppSetting;
   // Serialize updates once the singleton setting exists. The initial insert
   // also has a unique key, so a competing first write cannot overwrite it.
   const lock=db.raw.sql`UPDATE public."appSetting" SET id=id WHERE key=${MANAGED_REPAIR_SERVICES_KEY}`
    .affectedCount().build();
   await tx.execute(lock);
   const row=await Settings.where({key:MANAGED_REPAIR_SERVICES_KEY}).first();
   const existing=readManagedRepairServices(row?.value);
   let next:ManagedRepairService[];
   let changedId:string;
   if(body.action==="delete"){
    if(typeof body.serviceId!=="string"||!existing.some(s=>s.id===body.serviceId))
     throw new Error("Servicio no encontrado.");
    changedId=body.serviceId;
    next=existing.filter(s=>s.id!==body.serviceId);
   }else{
    const raw=body.service;
    if(!raw||typeof raw!=="object"||Array.isArray(raw))
     throw new Error("Servicio inválido.");
    const service=normalizeManagedRepairService({
     ...raw,id:raw.id||"Repair"+randomUUID().replaceAll("-","")
    });
    changedId=service.id;
    const businesses=await (tx.orm.public as any).Business.all();
    const allowed=new Set<number>(businesses.map((b:any)=>Number(b.id)));
    if(service.businessIds.some(id=>!allowed.has(id)))
     throw new Error("Se asignó un negocio que no existe.");
    if(service.materialItemId!==null){
     const material=await (tx.orm.public as any).Item.where({id:service.materialItemId}).first();
     if(!material||String(material.itemType)!=="MATERIAL")
      throw new Error("Selecciona un material válido del catálogo.");
    }
    const index=existing.findIndex(s=>s.id===service.id);
    next=index<0?[...existing,service]:existing.map((s,i)=>i===index?service:s);
   }
   checkManagedRepairServiceLimits(next);
   if(row)await Settings.where({id:row.id}).update({value:JSON.stringify(next)});
   else await Settings.create({key:MANAGED_REPAIR_SERVICES_KEY,value:JSON.stringify(next)});
   await (tx.orm.public as any).AuditLog.create({
    actorUserId:Number(admin.id),action:"MANAGED_REPAIR_SERVICE_CONFIG",entityType:"SYSTEM",
    entityId:null,characterId:null,targetUserId:null,
    details:JSON.stringify({action:body.action,serviceId:changedId,
     businessIds:next.find(s=>s.id===changedId)?.businessIds??[]})
   });
   return next;
  });
  return NextResponse.json({success:true,services});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:"No se pudo guardar el catálogo."},{status:400});
 }
}
