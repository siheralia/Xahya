import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasRolePermission } from "@/lib/role-permissions";
import { recordAuditEvent } from "@/lib/audit";
import { readRacialSkills, validateRacialSkill } from "@/lib/skills/racial-catalog";

async function authorize(action:"view"|"edit") {
  const {userId}=await auth();
  if (!userId) return null;
  const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
  return user && await hasRolePermission(user,"management.skills",action) ? user : null;
}

export async function GET() {
  if (!await authorize("view")) return NextResponse.json({error:"Sin permiso."},{status:403});
  const [racialSkills,races]=await Promise.all([readRacialSkills(),db.orm.public.Race.all()]);
  const names=new Map(races.map(r=>[Number(r.id),String(r.name)]));
  return NextResponse.json({
    racialSkills:racialSkills.map(skill=>({...skill,raceName:names.get(skill.raceId)??"Raza desconocida"})),
    races:races.map(r=>({id:Number(r.id),name:String(r.name)})),
  });
}
export async function POST(request:Request) {
  const admin=await authorize("edit");
  if (!admin) return NextResponse.json({error:"Sin permiso."},{status:403});
  const body=await request.json().catch(()=>null);
  const error=validateRacialSkill(body);
  if (error) return NextResponse.json({error},{status:400});
  const raceId=Number(body.raceId);
  if (!await db.orm.public.Race.where({id:raceId}).first()) return NextResponse.json({error:"Raza inexistente."},{status:400});
  const name=String(body.name).trim(),description=String(body.description).trim();
  const category=String(body.category),manaCost=Number(body.manaCost),maintenanceCost=Number(body.maintenanceCost);
  const active=Boolean(body.active),effects=JSON.stringify(body.effect);
  try {
    const query=db.raw.sql`
      INSERT INTO public."raceSkill" ("raceId",name,description,category,effect,"manaCost","maintenanceCost",active)
      VALUES (${raceId},${name},${description},${category},${effects}::jsonb,${manaCost},${maintenanceCost},${active})
      RETURNING id
    `.returnsRow({id:"pg/int4@1"}).build();
    const [created]=await db.runtime().query(query) as Array<{id:number}>;
    await recordAuditEvent({actorUserId:Number(admin.id),action:"RACIAL_SKILL_CREATE",entityType:"RACIAL_SKILL",entityId:created.id,details:{raceId,name}});
    return NextResponse.json({id:created.id},{status:201});
  }catch(error){
    console.error("[racial-skills] create failed",error);
    return NextResponse.json({error:"No se pudo guardar. Comprueba que no exista otra habilidad con el mismo nombre para esa raza."},{status:409});
  }
}
