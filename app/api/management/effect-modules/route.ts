import {randomUUID} from "node:crypto";
import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {hasRolePermission} from "@/lib/role-permissions";
import {recordAuditEvent} from "@/lib/audit";
import {
  MICRO_TEMPLATE_PREFIX,isTemplateId,listMicroTemplates,readMicroTemplate,
  transitionMicroTemplate,validateTemplateInput,type MicroEffectTemplate,
} from "@/lib/effects/micro-template-registry";
import type {EffectContainer} from "@/lib/effects/micro-modules";

async function actor(action:"view"|"create"|"edit"|"approve"|"reject"){
  const {userId:clerkId}=await auth();
  if(!clerkId)return null;
  const user=(await db.orm.public.User.all()).find(u=>u.clerkId===clerkId)??null;
  return user && await hasRolePermission(user,"management.effects",action)?user:null;
}
const bad=(message:string,status=400)=>NextResponse.json({error:message},{status});
const parseBody=async(req:Request)=>req.json().catch(()=>null);
const fail=(e:unknown)=>e instanceof Error?e.message:"No se pudo actualizar la plantilla.";

export async function GET(){
  if(!await actor("view"))return bad("Sin permiso para consultar plantillas.",403);
  return NextResponse.json({templates:await listMicroTemplates(),runtimeReady:false,pricingMode:"MANUAL_PROVISIONAL"});
}
export async function POST(request:Request){
  const user=await actor("create");
  if(!user)return bad("Sin permiso para crear plantillas.",403);
  const body=await parseBody(request);
  const error=validateTemplateInput(body);
  if(error)return bad(error);
  const id=randomUUID(),now=new Date().toISOString();
  const template:MicroEffectTemplate={
    id,revision:1,status:"DRAFT",
    effect:body.effect as EffectContainer,
    proposedPch:body.proposedPch??null,
    reviewedPch:null,pricingNotes:body.pricingNotes,
    sourceTemplateId:isTemplateId(body.sourceTemplateId)?body.sourceTemplateId:null,
    createdBy:Number(user.id),reviewedBy:null,
    createdAt:now,updatedAt:now,enabledForSkills:false,
  };
  await db.orm.public.AppSetting.create({key:MICRO_TEMPLATE_PREFIX+id,value:JSON.stringify(template)});
  try{
    await recordAuditEvent({actorUserId:Number(user.id),action:"MICRO_TEMPLATE_CREATE",
      entityType:"EFFECT_TEMPLATE",details:{id,name:template.effect.name,status:template.status}});
  }catch(e){console.error("[micro-templates] audit create:",e);}
  return NextResponse.json({template},{status:201});
}
export async function PATCH(request:Request){
  const body=await parseBody(request);
  if(!body||typeof body!=="object"||!isTemplateId(body.id)||
     !Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<1)
    return bad("Identificador o revisión inválidos.");
  const action=body.action;
  if(!["SAVE","SUBMIT","APPROVE","REJECT"].includes(action))return bad("Operación inválida.");
  const permission=action==="APPROVE"?"approve":action==="REJECT"?"reject":"edit";
  const user=await actor(permission);
  if(!user)return bad("Sin permiso para esta operación.",403);
  if(!await hasRolePermission(user,"management.effects","view"))return bad("Sin permiso de lectura.",403);
  const key=MICRO_TEMPLATE_PREFIX+body.id;
  let updated:MicroEffectTemplate;
  try{
    updated=await db.transaction(async tx=>{
      // Lock the individual AppSetting row before comparing revision.
      // Prevents lost edits and double approval under concurrent requests.
      const lock=db.raw.sql`UPDATE public."appSetting" SET "value"="value" WHERE "key"=${key}`.affectedCount().build();
      if((await tx.execute(lock)).affectedRows!==1)throw new Error("NOT_FOUND");
      const current=readMicroTemplate((await tx.orm.public.AppSetting.where({key}).first())?.value);
      if(!current)throw new Error("NOT_FOUND");
      if(current.revision!==body.expectedRevision)throw new Error("REVISION_CONFLICT");
      const next=transitionMicroTemplate(current,action,body,Number(user.id),new Date().toISOString());
      await tx.orm.public.AppSetting.where({key}).update({value:JSON.stringify(next)});
      return next;
    });
  }catch(e){
    const code=e instanceof Error?e.message:"";
    if(code==="NOT_FOUND")return bad("Plantilla no encontrada.",404);
    if(code==="REVISION_CONFLICT")return bad("Esta plantilla cambió. Recarga antes de guardar.",409);
    return bad(fail(e));
  }
  try{
    await recordAuditEvent({actorUserId:Number(user.id),action:"MICRO_TEMPLATE_"+action,
      entityType:"EFFECT_TEMPLATE",details:{id:updated.id,revision:updated.revision,
        status:updated.status,reviewedPch:updated.reviewedPch}});
  }catch(e){console.error("[micro-templates] audit update:",e);}
  return NextResponse.json({template:updated});
}
