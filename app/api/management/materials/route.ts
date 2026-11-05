import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {recordAuditEvent} from "@/lib/audit";
import {authorizedMaterialUser} from "@/lib/items/material-access";
import {validateMaterialDraft} from "@/lib/items/materials";

const Material=()=> (db.orm.public as any).Material;

export async function GET(){
 const user=await authorizedMaterialUser("view");
 if(!user)return NextResponse.json({error:"Sin permiso para ver materiales."},{status:403});
 const [materials,types,perks]=await Promise.all([
  Material().all(),
  (db.orm.public as any).MaterialType.all(),
  db.orm.public.Perk.where({active:true}).all(),
 ]);
 const canCreate=Boolean(await authorizedMaterialUser("create"));
 const canEdit=Boolean(await authorizedMaterialUser("edit"));
 const canDelete=Boolean(await authorizedMaterialUser("delete"));
 return NextResponse.json({materials:materials.sort((a:any,b:any)=>String(a.name).localeCompare(String(b.name),"es")),
  types:types.sort((a:any,b:any)=>String(a.name).localeCompare(String(b.name),"es")),
  perks:perks.map((p:any)=>({id:Number(p.id),name:String(p.name)})).sort((a:any,b:any)=>a.name.localeCompare(b.name,"es")),
  capabilities:{create:canCreate,edit:canEdit,delete:canDelete}});
}

export async function POST(req:Request){
 const user=await authorizedMaterialUser("create");
 if(!user)return NextResponse.json({error:"Sin permiso para crear materiales."},{status:403});
 try{
  const draft=validateMaterialDraft(await req.json().catch(()=>null));
  const exists=await Material().where({name:draft.name}).first();
  if(exists)return NextResponse.json({error:"Ya existe un material con ese nombre."},{status:409});
  const type=await (db.orm.public as any).MaterialType.where({code:draft.type,active:true}).first();
  if(!type)return NextResponse.json({error:"Selecciona un tipo de material activo."},{status:400});
  if(draft.bonusAgainstPerkId!==null){
   const perk=await db.orm.public.Perk.where({id:draft.bonusAgainstPerkId,active:true}).first();
   if(!perk)return NextResponse.json({error:"La perk objetivo no existe o está inactiva."},{status:400});
  }
  const material=await Material().create(draft);
  await recordAuditEvent({actorUserId:Number(user.id),action:"MATERIAL_CREATE",
   entityType:"MATERIAL",entityId:Number(material.id),details:draft});
  return NextResponse.json({material},{status:201});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:"No se pudo crear el material."},{status:400});
 }
}
