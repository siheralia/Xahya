import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasRolePermission } from "@/lib/role-permissions";
import { recordAuditEvent } from "@/lib/audit";
import { readRacialSkills, validateRacialSkill } from "@/lib/skills/racial-catalog";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {userId}=await auth();
  const user=userId?(await db.orm.public.User.all()).find(u=>u.clerkId===userId):null;
  if (!user || !(await hasRolePermission(user,"management.skills","edit"))) return NextResponse.json({error:"Sin permiso."},{status:403});
  const id=Number((await params).id);
  if (!Number.isSafeInteger(id)||id<=0) return NextResponse.json({error:"ID inválido."},{status:400});
  const existing=(await readRacialSkills()).find(r=>r.id===id);
  if (!existing) return NextResponse.json({error:"Habilidad racial inexistente."},{status:404});
  const body=await request.json().catch(()=>null);
  const error=validateRacialSkill(body);
  if (error) return NextResponse.json({error},{status:400});
  const raceId=Number(body.raceId);
  if (!await db.orm.public.Race.where({id:raceId}).first()) return NextResponse.json({error:"Raza inexistente."},{status:400});
  const name=String(body.name).trim(),description=String(body.description).trim();
  const category=String(body.category),manaCost=Number(body.manaCost),maintenanceCost=Number(body.maintenanceCost);
  const active=Boolean(body.active),effects=JSON.stringify(body.effect);
  try{
    const query=db.raw.sql`
      UPDATE public."raceSkill"
      SET "raceId"=${raceId},name=${name},description=${description},category=${category},
          effect=${effects}::jsonb,"manaCost"=${manaCost},"maintenanceCost"=${maintenanceCost},active=${active}
      WHERE id=${id} RETURNING id
    `.returnsRow({id:"pg/int4@1"}).build();
    const rows=await db.runtime().query(query) as Array<{id:number}>;
    if (!rows.length) return NextResponse.json({error:"No se encontró la habilidad."},{status:404});
    await recordAuditEvent({actorUserId:Number(user.id),action:"RACIAL_SKILL_UPDATE",entityType:"RACIAL_SKILL",entityId:id,details:{before:{raceId:existing.raceId,name:existing.name,active:existing.active},after:{raceId,name,active}}});
    return NextResponse.json({ok:true,id});
  }catch(error){
    console.error("[racial-skills] update failed",error);
    return NextResponse.json({error:"No se pudo actualizar. Revisa el nombre y la configuración."},{status:409});
  }
}
