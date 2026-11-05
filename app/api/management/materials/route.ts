import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {recordAuditEvent} from "@/lib/audit";
import {authorizedMaterialUser} from "@/lib/items/material-access";
import {validateMaterialDraft} from "@/lib/items/materials";

const Material=()=> (db.orm.public as any).Material;

export async function GET(){
 const user=await authorizedMaterialUser("view");
 if(!user)return NextResponse.json({error:"Sin permiso para ver materiales."},{status:403});
 const materials=await Material().all();
 const canCreate=Boolean(await authorizedMaterialUser("create"));
 const canEdit=Boolean(await authorizedMaterialUser("edit"));
 const canDelete=Boolean(await authorizedMaterialUser("delete"));
 return NextResponse.json({materials:materials.sort((a:any,b:any)=>String(a.name).localeCompare(String(b.name),"es")),
  capabilities:{create:canCreate,edit:canEdit,delete:canDelete}});
}

export async function POST(req:Request){
 const user=await authorizedMaterialUser("create");
 if(!user)return NextResponse.json({error:"Sin permiso para crear materiales."},{status:403});
 try{
  const draft=validateMaterialDraft(await req.json().catch(()=>null));
  const exists=await Material().where({name:draft.name}).first();
  if(exists)return NextResponse.json({error:"Ya existe un material con ese nombre."},{status:409});
  const material=await Material().create(draft);
  await recordAuditEvent({actorUserId:Number(user.id),action:"MATERIAL_CREATE",
   entityType:"MATERIAL",entityId:Number(material.id),details:draft});
  return NextResponse.json({material},{status:201});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:"No se pudo crear el material."},{status:400});
 }
}
