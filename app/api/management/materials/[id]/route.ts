import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {recordAuditEvent} from "@/lib/audit";
import {authorizedMaterialUser} from "@/lib/items/material-access";
import {validateMaterialDraft} from "@/lib/items/materials";

const Material=()=> (db.orm.public as any).Material;
const getId=async(params:Promise<{id:string}>)=>{
 const n=Number((await params).id);
 return Number.isSafeInteger(n)&&n>0?n:null;
};

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 const user=await authorizedMaterialUser("edit");
 if(!user)return NextResponse.json({error:"Sin permiso para modificar materiales."},{status:403});
 const id=await getId(params);
 if(!id)return NextResponse.json({error:"Material inválido."},{status:400});
 try{
  const existing=await Material().where({id}).first();
  if(!existing)return NextResponse.json({error:"Material no encontrado."},{status:404});
  const draft=validateMaterialDraft(await req.json().catch(()=>null));
  const nameUsed=await Material().where({name:draft.name}).first();
  if(nameUsed&&Number(nameUsed.id)!==id)return NextResponse.json({error:"Ya existe otro material con este nombre."},{status:409});
  const type=await (db.orm.public as any).MaterialType.where({code:draft.type}).first();
  if(!type || (!type.active&&draft.type!==existing.type))
   return NextResponse.json({error:"El tipo seleccionado no existe o está inactivo."},{status:400});
  if(draft.bonusAgainstPerkId!==null){
   const perk=await db.orm.public.Perk.where({id:draft.bonusAgainstPerkId}).first();
   if(!perk || (!perk.active&&draft.bonusAgainstPerkId!==existing.bonusAgainstPerkId))
    return NextResponse.json({error:"La perk seleccionada no existe o está inactiva."},{status:400});
  }
  const material=await Material().where({id}).update(draft);
  await recordAuditEvent({actorUserId:Number(user.id),action:"MATERIAL_UPDATE",
   entityType:"MATERIAL",entityId:id,details:{before:existing,after:material}});
  return NextResponse.json({material});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:"No se pudo actualizar el material."},{status:400});
 }
}
export async function DELETE(_req:Request,{params}:{params:Promise<{id:string}>}){
 const user=await authorizedMaterialUser("delete");
 if(!user)return NextResponse.json({error:"Sin permiso para eliminar materiales."},{status:403});
 const id=await getId(params);
 if(!id)return NextResponse.json({error:"Material inválido."},{status:400});
 const existing=await Material().where({id}).first();
 if(!existing)return NextResponse.json({error:"Material no encontrado."},{status:404});
 await Material().where({id}).delete();
 await recordAuditEvent({actorUserId:Number(user.id),action:"MATERIAL_DELETE",
  entityType:"MATERIAL",entityId:id,details:{name:existing.name}});
 return NextResponse.json({success:true});
}
