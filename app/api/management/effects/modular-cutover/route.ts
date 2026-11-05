import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {hasRolePermission} from "@/lib/role-permissions";
import {recordAuditEvent} from "@/lib/audit";
import {
  DEFAULT_MODULAR_CUTOVER,modularCutoverStorageKey,
  readModularCutoverSetting,type ModularCutoverMode
} from "@/lib/effects/modular-cutover";
import {readModularCutover} from "@/lib/effects/modular-cutover-registry";

export const dynamic="force-dynamic";
async function gate(action:"view"|"edit"){
 const {userId}=await auth();
 if(!userId)return null;
 const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
 return user&&await hasRolePermission(user,"management.effects",action)?user:null;
}
const error=(message:string,status=400)=>NextResponse.json({error:message},{status});
export async function GET(){
 if(!await gate("view"))return error("Sin permiso de gestión de efectos.",403);
 return NextResponse.json({setting:await readModularCutover(),environment:process.env.VERCEL_ENV??"local",
  explanation:"MODULAR_FIRST utiliza los efectos equivalentes y mantiene el original como respaldo; LEGACY_ONLY fuerza el cálculo numérico original. Las capacidades narrativas siguen limitadas por sus resolutores."},
 {headers:{"Cache-Control":"private, no-store"}});
}
export async function PATCH(req:Request){
 const user=await gate("edit");
 if(!user)return error("Sin permiso de edición de efectos.",403);
 const body=await req.json().catch(()=>null);
 if(!body || !["LEGACY_ONLY","MODULAR_FIRST"].includes(body.mode)||
   !Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0)
   return error("Modo o versión inválidos.");
 const mode=body.mode as ModularCutoverMode;
 const key=modularCutoverStorageKey();
 let next:ReturnType<typeof readModularCutoverSetting>;
 try{
  next=await db.transaction(async tx=>{
   const existing=await tx.orm.public.AppSetting.where({key}).first();
   const current=existing?readModularCutoverSetting(existing.value):DEFAULT_MODULAR_CUTOVER;
   if(current.revision!==body.expectedRevision)throw new Error("CONFLICT");
   next={version:1,mode,revision:current.revision+1,
     changedBy:Number(user.id),changedAt:new Date().toISOString()};
   if(existing){
     await tx.orm.public.AppSetting.where({key}).update({value:JSON.stringify(next)});
   } else {
     await tx.orm.public.AppSetting.create({key,value:JSON.stringify(next)});
   }
   return next;
  });
 }catch(e){
   if(e instanceof Error&&/CONFLICT|unique/.test(e.message))return error("El modo cambió; recarga antes de actualizar.",409);
   return error("No se pudo guardar el modo de ejecución.",500);
 }
 try{
  await recordAuditEvent({actorUserId:Number(user.id),action:"MODULAR_CUTOVER_"+mode,
    entityType:"EFFECT_ENGINE",details:{revision:next.revision,mode,
      rollbackAvailable:true,originalSkillRowsUntouched:true}});
 }catch(e){console.error("[modular-cutover] audit failed",e);}
 return NextResponse.json({setting:next,environment:process.env.VERCEL_ENV??"local"});
}
