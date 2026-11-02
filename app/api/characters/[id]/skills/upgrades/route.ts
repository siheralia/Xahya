import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {priceUpgrade} from "@/lib/skills/upgrade";

const requestCodec={id:"pg/int4@1",skillId:"pg/int4@1",status:"pg/text@1",deltaPch:"pg/int4@1",payloadText:"pg/text@1"} as const;
async function authenticatedCharacter(id:number) {
  const {userId}=await auth();
  if(!userId)return null;
  const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
  const character=await db.orm.public.Character.where({id}).first();
  if(!user||!character||(Number(character.userId)!==Number(user.id)&&!["ADMIN","GM"].includes(String(user.role))))return null;
  return {user,character};
}
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const id=Number((await params).id);
  if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:"Personaje inválido."},{status:400});
  const owner=await authenticatedCharacter(id);
  if(!owner)return NextResponse.json({error:"Forbidden"},{status:403});
  const creditQuery=db.raw.sql`SELECT "skillUpgradeCredits" AS credits FROM public."character" WHERE id=${id}`.returnsRow({credits:"pg/int4@1"}).build();
  const credits=await db.runtime().query(creditQuery) as Array<{credits:number}>;
  const q=db.raw.sql`SELECT id,"skillId",status,"deltaPch",payload::text AS "payloadText" FROM public."skillUpgradeRequest" WHERE "characterId"=${id} ORDER BY id DESC`.returnsRow(requestCodec).build();
  const requests=await db.runtime().query(q) as Array<{id:number;skillId:number;status:string;deltaPch:number;payloadText:string}>;
  return NextResponse.json({credits:credits[0]?.credits??0,requests:requests.map(({payloadText,...row})=>({...row,payload:JSON.parse(payloadText)}))});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const id=Number((await params).id);
  if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:"Personaje inválido."},{status:400});
  const owner=await authenticatedCharacter(id);
  if(!owner)return NextResponse.json({error:"Forbidden"},{status:403});
  const b=await request.json().catch(()=>null);
  const skillId=Number(b?.skillId);
  if(!Number.isSafeInteger(skillId)||skillId<=0)return NextResponse.json({error:"Habilidad inválida."},{status:400});
  const skill=await (db.orm.public as any).Skill.where({id:skillId,characterId:id}).first();
  if(!skill||skill.status!=="APPROVED")return NextResponse.json({error:"Solo puedes mejorar habilidades aprobadas."},{status:400});
  const existingCopies=db.raw.sql`SELECT id FROM public."skillCopy" WHERE "copiedSkillId"=${skillId}`.returnsRow({id:"pg/int4@1"}).build();
  if((await db.runtime().query(existingCopies)).length)return NextResponse.json({error:"Las copias se mejoran desde su habilidad de copia original."},{status:400});
  let pch:number,payload:Awaited<ReturnType<typeof priceUpgrade>>["payload"];
  try{({pch,payload}=await priceUpgrade(b));}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Mejora inválida."},{status:400});}
  if(payload.name!==skill.name || payload.category!==skill.category) return NextResponse.json({error:"Una mejora no puede cambiar el nombre ni la categoría."},{status:400});
  const baseline=Number(skill.pchCost??0),delta=pch-baseline;
  if(delta<=0)return NextResponse.json({error:"La mejora debe aumentar el costo de construcción PCH."},{status:400});
  try{
    await db.transaction(async tx=>{
      const pending=db.raw.sql`SELECT id FROM public."skillUpgradeRequest" WHERE "skillId"=${skillId} AND status='PENDING'`.returnsRow({id:"pg/int4@1"}).build();
      // Unique partial index also protects this check under concurrent requests.
      const previous=await tx.execute(pending);
      if(previous.rows?.length)throw new Error("UPGRADE_PENDING");
      const spend=db.raw.sql`UPDATE public."character" SET "pchBalance"="pchBalance"-${delta},"skillUpgradeCredits"="skillUpgradeCredits"-1 WHERE id=${id} AND "pchBalance">=${delta} AND "skillUpgradeCredits">=1`.affectedCount().build();
      if((await tx.execute(spend)).affectedRows!==1)throw new Error("NOT_ENOUGH_RESOURCES");
      const insert=db.raw.sql`INSERT INTO public."skillUpgradeRequest" ("characterId","skillId","baselinePch","nextPch","deltaPch",payload) VALUES (${id},${skillId},${baseline},${pch},${delta},${JSON.stringify(payload)}::jsonb)`.affectedCount().build();
      if((await tx.execute(insert)).affectedRows!==1)throw new Error("UPGRADE_INSERT_FAILED");
      await tx.orm.public.AuditLog.create({actorUserId:owner.user.id,action:"SKILL_UPGRADE_SUBMIT",entityType:"SKILL",entityId:skillId,characterId:id,targetUserId:null,details:JSON.stringify({delta,pch})});
    });
  }catch(e){
    if(e instanceof Error && e.message==="NOT_ENOUGH_RESOURCES")return NextResponse.json({error:"Necesitas 1 moneda de mejora y PCH suficientes."},{status:400});
    if(e instanceof Error && (e.message==="UPGRADE_PENDING"||String(e.message).includes("unique")))return NextResponse.json({error:"Esta habilidad ya tiene una mejora pendiente."},{status:409});
    throw e;
  }
  return NextResponse.json({ok:true,status:"PENDING",deltaPch:delta},{status:201});
}
