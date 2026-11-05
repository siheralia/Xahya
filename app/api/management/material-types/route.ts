import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {recordAuditEvent} from "@/lib/audit";
import {authorizedMaterialUser} from "@/lib/items/material-access";
import {validateMaterialTypeDraft} from "@/lib/items/material-types";

const Types=()=> (db.orm.public as any).MaterialType;
export async function GET(){
 const user=await authorizedMaterialUser("view");
 if(!user)return NextResponse.json({error:"Sin permiso para consultar tipos."},{status:403});
 try{
  const types=await Types().all();
  const [create,edit,remove]=await Promise.all(["create","edit","delete"].map(action=>
   authorizedMaterialUser(action as "create"|"edit"|"delete")));
  return NextResponse.json({types:types.sort((a:any,b:any)=>String(a.name).localeCompare(String(b.name),"es")),
   capabilities:{create:Boolean(create),edit:Boolean(edit),delete:Boolean(remove)}});
 }catch(error){
  console.error("[material-types] Error al cargar los tipos",error);
  return NextResponse.json({error:"No se pudo consultar los tipos de material. Inténtalo de nuevo."},
   {status:503});
 }
}
export async function POST(req:Request){
 const user=await authorizedMaterialUser("create");
 if(!user)return NextResponse.json({error:"Sin permiso para crear tipos."},{status:403});
 try{
  const draft=validateMaterialTypeDraft(await req.json().catch(()=>null));
  if(await Types().where({code:draft.code}).first())
   return NextResponse.json({error:"Este código de tipo ya está en uso."},{status:409});
  const type=await Types().create(draft);
  await recordAuditEvent({actorUserId:Number(user.id),action:"MATERIAL_TYPE_CREATE",
   entityType:"MATERIAL_TYPE",entityId:0,details:{code:draft.code,name:draft.name}});
  return NextResponse.json({type},{status:201});
 }catch(e){
  return NextResponse.json({error:e instanceof Error?e.message:"No se pudo crear el tipo."},{status:400});
 }
}
