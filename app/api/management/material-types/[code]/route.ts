import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {recordAuditEvent} from "@/lib/audit";
import {authorizedMaterialUser} from "@/lib/items/material-access";
import {validateMaterialTypeDraft} from "@/lib/items/material-types";

const Types=()=> (db.orm.public as any).MaterialType;
const getCode=async(params:Promise<{code:string}>)=>{
 const code=(await params).code?.trim().toUpperCase();
 return /^[A-Z][A-Z0-9_]{1,31}$/.test(code)?code:null;
};
export async function PATCH(req:Request,{params}:{params:Promise<{code:string}>}){
 const user=await authorizedMaterialUser("edit");
 if(!user)return NextResponse.json({error:"Sin permiso para editar tipos."},{status:403});
 const code=await getCode(params);
 if(!code)return NextResponse.json({error:"Código inválido."},{status:400});
 try{
  const current=await Types().where({code}).first();
  if(!current)return NextResponse.json({error:"Tipo no encontrado."},{status:404});
  const draft=validateMaterialTypeDraft(await req.json().catch(()=>null));
  if(draft.code!==code)return NextResponse.json({error:"El código del tipo no se puede cambiar; sus materiales dependen de él."},{status:409});
  const type=await Types().where({code}).update(draft);
  await recordAuditEvent({actorUserId:Number(user.id),action:"MATERIAL_TYPE_UPDATE",
   entityType:"MATERIAL_TYPE",entityId:0,details:{code,before:current,after:type}});
  return NextResponse.json({type});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:"No se pudo actualizar."},{status:400});
 }
}
export async function DELETE(_request:Request,{params}:{params:Promise<{code:string}>}){
 const user=await authorizedMaterialUser("delete");
 if(!user)return NextResponse.json({error:"Sin permiso para eliminar tipos."},{status:403});
 const code=await getCode(params);
 if(!code)return NextResponse.json({error:"Código inválido."},{status:400});
 const current=await Types().where({code}).first();
 if(!current)return NextResponse.json({error:"Tipo no encontrado."},{status:404});
 const used=await (db.orm.public as any).Material.where({type:code}).first();
 if(used)return NextResponse.json({error:"No puedes eliminar un tipo mientras haya materiales que lo utilicen. Cámbialos de tipo antes."},{status:409});
 await Types().where({code}).delete();
 await recordAuditEvent({actorUserId:Number(user.id),action:"MATERIAL_TYPE_DELETE",
  entityType:"MATERIAL_TYPE",entityId:0,details:{code,name:current.name}});
 return NextResponse.json({success:true});
}
