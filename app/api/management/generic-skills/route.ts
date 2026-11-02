import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {hasRolePermission} from "@/lib/role-permissions";
import {
 genericTemplateChain,normalizeGenericPayload,quoteGenericSkill,
 validateGenericTemplateSettings,type GenericSkillTemplateRow,
} from "@/lib/skills/generic-catalog";

async function gate(action:"view"|"edit"|"approve") {
 const {userId}=await auth();
 if(!userId)return null;
 const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
 return user&&await hasRolePermission(user,"management.skills",action)?user:null;
}
async function elements():Promise<string[]> {
 const settings=await db.orm.public.AppSetting.where({key:"world.elements.v1"}).first();
 try{
  const entries=JSON.parse(String(settings?.value??"[]"));
  return Array.isArray(entries)?entries.filter((x:any)=>x&&typeof x.key==="string").map((x:any)=>x.key):[];
 }catch{return [];}
}
const mapRow=(r:any):GenericSkillTemplateRow=>({
 id:Number(r.id),name:String(r.name),description:r.description??null,
 parentTemplateId:r.parentTemplateId==null?null:Number(r.parentTemplateId),
 payload:r.payload??{},elementChoice:Boolean(r.elementChoice),enabled:Boolean(r.enabled),
});

export async function GET() {
 const user=await gate("view");
 if(!user)return NextResponse.json({error:"Sin permisos para gestionar habilidades."},{status:403});
 const rows=(await (db.orm.public as any).GenericSkillTemplate.all()).map(mapRow);
 const available=await elements();const example=available.find(x=>x!=="NEUTRAL");
 const result=await Promise.all(rows.map(async row=>{
  try {
   const chain=genericTemplateChain(rows,row.id);
   const quote=await quoteGenericSkill(rows,row.id,chain.some(x=>x.elementChoice)?example:undefined);
   return {...row,pchCost:quote.pchCost,totalPch:quote.totalPch};
  }catch(error){
   return {...row,pchCost:null,totalPch:null,validationError:error instanceof Error?error.message:"Plantilla inválida."};
  }
 }));
 return NextResponse.json({templates:result});
}

async function save(request:Request,editing:boolean) {
 const user=await gate("edit");
 if(!user)return NextResponse.json({error:"Sin permiso de edición."},{status:403});
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=="object")return NextResponse.json({error:"Datos inválidos."},{status:400});
 const templateModel=(db.orm.public as any).GenericSkillTemplate;
 const rows=(await templateModel.all()).map(mapRow);
 const id=editing?Number(body.id):Math.max(0,...rows.map(r=>r.id))+1;
 const previous=editing?rows.find(r=>r.id===id):null;
 if(editing&&!previous)return NextResponse.json({error:"Plantilla inexistente."},{status:404});
 const elementChoice=Boolean(body.elementChoice);
 const parentTemplateId=body.parentTemplateId==null||body.parentTemplateId===""?null:Number(body.parentTemplateId);
 const candidate:GenericSkillTemplateRow={
  id,name:String(body.name??"").trim(),description:String(body.description??"").trim(),
  parentTemplateId,payload:normalizeGenericPayload(body.payload,elementChoice),
  elementChoice,enabled:body.enabled===true,
 };
 if(candidate.enabled&&!await hasRolePermission(user,"management.skills","approve"))
  return NextResponse.json({error:"Solo quien puede aprobar habilidades puede publicar plantillas."},{status:403});
 const validation=validateGenericTemplateSettings(candidate,parentTemplateId!==null);
 if(validation)return NextResponse.json({error:validation},{status:400});
 const proposed=editing?rows.map(r=>r.id===id?candidate:r):[...rows,candidate];
 try {
  const chain=genericTemplateChain(proposed,id);
  if(candidate.enabled&&chain.some(r=>!r.enabled))
   throw new Error("Para publicar una especialización deben estar publicadas todas sus bases.");
  const listed=await elements();
  const sample=listed.find(x=>x!=="NEUTRAL");
  const result=await quoteGenericSkill(proposed,id,chain.some(r=>r.elementChoice)?sample:undefined);
  // Changing a published parent may invalidate a descendant. Validate the entire catalog before saving.
  for(const child of proposed.filter(r=>r.id!==id)){
   const childChain=genericTemplateChain(proposed,child.id);
   if(child.enabled&&childChain.some(r=>!r.enabled))throw new Error("No puedes despublicar una plantilla que tiene especializaciones publicadas.");
   if(childChain.some(r=>r.id===id))
    await quoteGenericSkill(proposed,child.id,childChain.some(r=>r.elementChoice)?sample:undefined);
  }
  const data={name:candidate.name,description:candidate.description,
    parentTemplateId:candidate.parentTemplateId,payload:candidate.payload,
    elementChoice:candidate.elementChoice,enabled:candidate.enabled,updatedAt:new Date()};
  let saved:any;
  if(editing) saved=await templateModel.where({id}).update(data);
  else saved=await templateModel.create(data);
  await db.orm.public.AuditLog.create({
   actorUserId:user.id,action:editing?"GENERIC_SKILL_UPDATE":"GENERIC_SKILL_CREATE",
   entityType:"GENERIC_SKILL_TEMPLATE",entityId:Number(saved.id),targetUserId:null,
   details:JSON.stringify({name:candidate.name,parentTemplateId,enabled:candidate.enabled,pchCost:result.pchCost}),
  });
  return NextResponse.json({template:mapRow(saved),pchCost:result.pchCost,totalPch:result.totalPch},{status:editing?200:201});
 }catch(error){
  return NextResponse.json({error:error instanceof Error?error.message:"No se pudo guardar la plantilla."},{status:400});
 }
}
export async function POST(request:Request){return save(request,false);}
export async function PATCH(request:Request){return save(request,true);}
