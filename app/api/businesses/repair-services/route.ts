import {auth} from "@clerk/nextjs/server";
import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {businessRepairKey,readBusinessRepairServices,normalizeRepairService,
 type RepairService} from "@/lib/business-repair";

async function currentUser(){
 const {userId:clerkId}=await auth();
 if(!clerkId)return null;
 return (await db.orm.public.User.all()).find(u=>u.clerkId===clerkId)??null;
}
const validId=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>0;
async function ownerOrAdmin(user:any,business:any,ctx:any=db){
 if(String(user.role)==="ADMIN")return true;
 const owner=await ctx.orm.public.Character.where({id:Number(business.ownerCharacterId)}).first();
 return !!owner&&Number(owner.userId)===Number(user.id);
}
/** Public offers and a private owner management view share one validated source. */
export async function GET(req:Request){
 const user=await currentUser();
 if(!user)return NextResponse.json({error:"No has iniciado sesión."},{status:401});
 const businessId=Number(new URL(req.url).searchParams.get("businessId"));
 if(!validId(businessId))return NextResponse.json({error:"Negocio inválido."},{status:400});
 const Business=(db.orm.public as any).Business,AppSetting=(db.orm.public as any).AppSetting;
 const business=await Business.where({id:businessId}).first();
 if(!business)return NextResponse.json({error:"Negocio no encontrado."},{status:404});
 const canEdit=await ownerOrAdmin(user,business);
 if(!business.active&&!canEdit)return NextResponse.json({error:"Negocio no disponible."},{status:404});
 const row=await AppSetting.where({key:businessRepairKey(businessId)}).first();
 const services=readBusinessRepairServices(row?.value).filter(x=>canEdit||x.active);
 const items=(await (db.orm.public as any).Item.all())
   .filter((x:any)=>String(x.itemType)==="MATERIAL");
 return NextResponse.json({
  business:{id:Number(business.id),name:String(business.name),active:Boolean(business.active)},
  canEdit,services,
  materials:canEdit?items.map((x:any)=>({id:Number(x.id),name:String(x.name)})):
   items.filter((x:any)=>services.some(s=>s.materialItemId===Number(x.id)))
    .map((x:any)=>({id:Number(x.id),name:String(x.name)})),
 });
}
/** Service configuration is allowed only for its business owner or ADMIN.
 * Locking that business serializes the per-business AppSetting JSON updates.
 */
export async function POST(req:Request){
 const user=await currentUser();
 if(!user)return NextResponse.json({error:"No has iniciado sesión."},{status:401});
 const body=await req.json().catch(()=>null);
 const businessId=body?.businessId;
 if(!validId(businessId)||!["save","delete"].includes(body?.action))
  return NextResponse.json({error:"Solicitud de taller inválida."},{status:400});
 try{
  const result=await db.transaction(async tx=>{
   const lock=db.raw.sql`UPDATE public."business" SET id=id WHERE id=${businessId}`.affectedCount().build();
   if((await tx.execute(lock)).affectedRows!==1)throw new Error("BUSINESS_NOT_FOUND");
   const B=(tx.orm.public as any).Business,AppSetting=(tx.orm.public as any).AppSetting;
   const business=await B.where({id:businessId}).first();
   if(!business)throw new Error("BUSINESS_NOT_FOUND");
   if(!await ownerOrAdmin(user,business,tx))throw new Error("NO_PERMISSION");
   const key=businessRepairKey(businessId);
   const setting=await AppSetting.where({key}).first();
   const services=readBusinessRepairServices(setting?.value);
   let next:RepairService[];
   if(body.action==="delete"){
    if(typeof body.serviceId!=="string"||!services.some(x=>x.id===body.serviceId))
     throw new Error("SERVICE_NOT_FOUND");
    next=services.filter(x=>x.id!==body.serviceId);
   }else{
    const raw=body.service;
    const id=raw?.id||"Repair"+randomUUID().replaceAll("-","");
    const plan=normalizeRepairService({...raw,id});
    if(plan.materialItemId!==null){
     const material=await (tx.orm.public as any).Item.where({id:plan.materialItemId}).first();
     if(!material||String(material.itemType)!=="MATERIAL")throw new Error("MATERIAL_INVALID");
    }
    const index=services.findIndex(x=>x.id===plan.id);
    if(index===-1&&services.length>=12)throw new Error("SERVICE_LIMIT");
    next=index===-1?[...services,plan]:services.map((x,i)=>i===index?plan:x);
   }
   if(setting)await AppSetting.where({id:setting.id}).update({value:JSON.stringify(next)});
   else await AppSetting.create({key,value:JSON.stringify(next)});
   await (tx.orm.public as any).AuditLog.create({
    actorUserId:Number(user.id),action:"BUSINESS_REPAIR_CONFIG",entityType:"BUSINESS",
    entityId:businessId,characterId:null,targetUserId:null,
    details:JSON.stringify({action:body.action,serviceId:body.serviceId??next.at(-1)?.id}),
   });
   return next;
  });
  return NextResponse.json({success:true,services:result});
 }catch(err){
  const e=err instanceof Error?err.message:"ERROR";
  const names:Record<string,string>={
   BUSINESS_NOT_FOUND:"Negocio no encontrado.",NO_PERMISSION:"Solo el dueño o administrador puede configurar este taller.",
   MATERIAL_INVALID:"Selecciona un objeto de tipo Material del catálogo.",
   SERVICE_NOT_FOUND:"Servicio no encontrado.",SERVICE_LIMIT:"Máximo 12 servicios por negocio."};
  return NextResponse.json({error:names[e]??e},{status:e==="NO_PERMISSION"?403:400});
 }
}
