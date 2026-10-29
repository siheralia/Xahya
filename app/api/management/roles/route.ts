import { NextResponse } from "next/server";
import { amount, badRequest, currentUser, isAdmin, salaryRest } from "@/lib/role-salary";
import { recordAuditEvent } from "@/lib/audit";
import { validPermissions, hasRolePermission } from "@/lib/role-permissions";

export async function GET() {
 const actor = await currentUser();
 if (!actor || !(await hasRolePermission(actor,"management.roles","view"))) return NextResponse.json({error:"Forbidden"},{status:403});
 try {
  const [roles, assignments] = await Promise.all([
   salaryRest("ManagedRole?select=*&order=id.asc"),
   salaryRest(isAdmin(actor) ? "UserManagedRole?select=*&order=userId.asc" : `UserManagedRole?userId=eq.${actor.id}&select=*&order=userId.asc`),
  ]);
  return NextResponse.json({roles,assignments});
 } catch(e) { return badRequest(e); }
}
export async function POST(request:Request) {
 const actor = await currentUser();
 if (!isAdmin(actor)) return NextResponse.json({error:"Forbidden"},{status:403});
 const b = await request.json().catch(()=>null);
 const name = typeof b?.name === "string" ? b.name.trim() : "";
 const slug = typeof b?.slug === "string" ? b.slug.trim().toLowerCase() : "";
 const color = typeof b?.color === "string" ? b.color : "#a1a1aa";
 const pts=amount(b?.dailyPts), karma=amount(b?.dailyKarma), money=amount(b?.dailyMoney);
 if (!name || name.length>80 || !/^[a-z][a-z0-9_-]{1,39}$/.test(slug) ||
 !/^#[a-fA-F0-9]{6}$/.test(color) || pts===null || karma===null || money===null ||
 !validPermissions(b.permissions) ||
 JSON.stringify(b.permissions).length>8000 || ["admin","gm","player","system","banned"].includes(slug))
 return NextResponse.json({error:"Datos de rol inválidos"},{status:400});
 try {
  const rows = await salaryRest("ManagedRole", {method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({name,slug,color,dailyPts:pts,dailyKarma:karma,dailyMoney:money,permissions:b.permissions})});
  const role=rows[0];
  await recordAuditEvent({actorUserId:actor!.id,action:"MANAGED_ROLE_CREATE",entityType:"MANAGED_ROLE",entityId:role.id,details:{name,slug,color,pts,karma,money,permissions:b.permissions}});
  return NextResponse.json({role},{status:201});
 } catch(e) { return badRequest(e); }
}
export async function PATCH(request:Request) {
 const actor=await currentUser();
 if (!isAdmin(actor)) return NextResponse.json({error:"Forbidden"},{status:403});
 const b=await request.json().catch(()=>null);
 const id=Number(b?.id);
 if (!Number.isSafeInteger(id)||id<1) return NextResponse.json({error:"ID inválido"},{status:400});
 try {
  const rows=await salaryRest("ManagedRole?id=eq."+id+"&select=*");
  const old=rows[0];
  if (!old || old.protected) return NextResponse.json({error:"Rol protegido o inexistente"},{status:403});
  const update:Record<string,unknown>={};
  if (b.name!==undefined) {if(typeof b.name!=="string"||!b.name.trim()||b.name.length>80)return NextResponse.json({error:"Nombre inválido"},{status:400});update.name=b.name.trim();}
  if (b.color!==undefined) {if(typeof b.color!=="string"||!/^#[a-fA-F0-9]{6}$/.test(b.color))return NextResponse.json({error:"Color inválido"},{status:400});update.color=b.color;}
  for(const key of ["dailyPts","dailyKarma","dailyMoney"]) if(b[key]!==undefined){const n=amount(b[key]);if(n===null)return NextResponse.json({error:"Salario inválido"},{status:400});update[key]=n;}
  if(b.permissions!==undefined){if(!validPermissions(b.permissions)||JSON.stringify(b.permissions).length>8000)return NextResponse.json({error:"Permisos inválidos"},{status:400});update.permissions=b.permissions;}
  if(!Object.keys(update).length)return NextResponse.json({error:"Sin cambios"},{status:400});
  update.updatedAt=new Date().toISOString();
  const changed=await salaryRest("ManagedRole?id=eq."+id,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(update)});
  await recordAuditEvent({actorUserId:actor!.id,action:"MANAGED_ROLE_UPDATE",entityType:"MANAGED_ROLE",entityId:id,details:{before:old,after:changed[0]}});
  return NextResponse.json({role:changed[0]});
 } catch(e){return badRequest(e);}
}

export async function DELETE(request:Request) {
 const actor=await currentUser();
 if(!isAdmin(actor))return NextResponse.json({error:"Forbidden"},{status:403});
 const b=await request.json().catch(()=>null);
 const id=Number(b?.id);
 if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:"ID inválido"},{status:400});
 try {
  const roles=await salaryRest("ManagedRole?id=eq."+id+"&select=*");
  const role=roles[0];
  if(!role)return NextResponse.json({error:"Rol inexistente"},{status:404});
  if(role.protected)return NextResponse.json({error:"No puedes eliminar un rol protegido"},{status:403});
  const [assigned,accrued]=await Promise.all([
   salaryRest("UserManagedRole?roleId=eq."+id+"&select=roleId&limit=1"),
   salaryRest("RoleSalaryAccrual?roleId=eq."+id+"&select=id&limit=1"),
  ]);
  if(assigned.length||accrued.length)return NextResponse.json({error:assigned.length?"Primero retira este rol de todos los usuarios.":"Este rol tiene historial de salarios y no puede eliminarse; puedes dejar de asignarlo."},{status:409});
  await salaryRest("ManagedRole?id=eq."+id,{method:"DELETE"});
  await recordAuditEvent({actorUserId:actor!.id,action:"MANAGED_ROLE_DELETE",entityType:"MANAGED_ROLE",entityId:id,details:{role}});
  return NextResponse.json({success:true});
 }catch(e){return badRequest(e);}
}
