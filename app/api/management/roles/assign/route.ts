import { NextResponse } from "next/server";
import { badRequest, currentUser, isAdmin, salaryRest } from "@/lib/role-salary";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { hasRolePermission } from "@/lib/role-permissions";

export async function POST(request:Request) {
 const actor=await currentUser();
 if(!actor || !(await hasRolePermission(actor,"management.users","assign-roles")))return NextResponse.json({error:"Forbidden"},{status:403});
 const b=await request.json().catch(()=>null);
 const userId=Number(b?.userId), roleId=Number(b?.roleId);
 if(!Number.isSafeInteger(userId)||userId<1||!Number.isSafeInteger(roleId)||roleId<1||typeof b?.assigned!=="boolean")
 return NextResponse.json({error:"Asignación inválida"},{status:400});
 if(userId===Number(actor!.id))return NextResponse.json({error:"No puedes cambiar tus propios roles"},{status:403});
 try {
  const user=await db.orm.public.User.where({id:userId}).first();
  const roles=await salaryRest("ManagedRole?id=eq."+roleId+"&select=*");
  const role=roles[0];
  if(!user||!role)return NextResponse.json({error:"Usuario o rol inexistente"},{status:404});
  if(["ADMIN","BANNED","SYSTEM"].includes(String(user.role))||role.protected)
   return NextResponse.json({error:"Rol o usuario protegido"},{status:403});
  const query="UserManagedRole?userId=eq."+userId+"&roleId=eq."+roleId;
  const existing=await salaryRest(query+"&select=*");
  if(b.assigned&&!existing.length)
   await salaryRest("UserManagedRole",{method:"POST",body:JSON.stringify({userId,roleId})});
  if(!b.assigned&&existing.length)
   await salaryRest(query,{method:"DELETE"});
  if(Boolean(existing.length)!==b.assigned)
   await recordAuditEvent({actorUserId:actor!.id,action:b.assigned?"MANAGED_ROLE_ASSIGN":"MANAGED_ROLE_UNASSIGN",entityType:"USER",entityId:userId,targetUserId:userId,details:{roleId,roleName:role.name}});
  return NextResponse.json({success:true});
 } catch(e){return badRequest(e);}
}
