import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {hasRolePermission} from "@/lib/role-permissions";
import {serializeSkillRange} from "@/lib/skills/range-storage";
import type {UpgradePayload} from "@/lib/skills/upgrade";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const {userId}=await auth();
  if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
  const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
  if(!user)return NextResponse.json({error:"Forbidden"},{status:403});
  const b=await request.json().catch(()=>null);
  if(b?.decision!=="APPROVED"&&b?.decision!=="REJECTED")return NextResponse.json({error:"Decisión inválida."},{status:400});
  const permission=b.decision==="APPROVED"?"approve":"reject";
  if(!(await hasRolePermission(user,"management.skills",permission))||!(await hasRolePermission(user,"management.skills","edit")))return NextResponse.json({error:"Sin permiso."},{status:403});
  const id=Number((await params).id);
  if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:"Solicitud inválida."},{status:400});
  const q=db.raw.sql`SELECT id,"characterId","skillId","baselinePch","nextPch","deltaPch",status,payload::text AS "payloadText"
    FROM public."skillUpgradeRequest" WHERE id=${id}`.returnsRow({id:"pg/int4@1",characterId:"pg/int4@1",skillId:"pg/int4@1",baselinePch:"pg/int4@1",nextPch:"pg/int4@1",deltaPch:"pg/int4@1",status:"pg/text@1",payloadText:"pg/text@1"}).build();
  const [row]=await db.runtime().query(q) as Array<{id:number;characterId:number;skillId:number;baselinePch:number;nextPch:number;deltaPch:number;status:string;payloadText:string}>;
  if(!row)return NextResponse.json({error:"Solicitud no encontrada."},{status:404});
  if(row.status!=="PENDING")return NextResponse.json({error:"Solicitud ya resuelta."},{status:409});
  const payload=JSON.parse(row.payloadText) as UpgradePayload;
  try{
    await db.transaction(async tx=>{
      const claim=db.raw.sql`UPDATE public."skillUpgradeRequest" SET status=${b.decision},"updatedAt"=now() WHERE id=${id} AND status='PENDING'`.affectedCount().build();
      if((await tx.execute(claim)).affectedRows!==1)throw new Error("ALREADY_REVIEWED");
      if(b.decision==="APPROVED"){
        const lock=db.raw.sql`UPDATE public."skill" SET "pchCost"="pchCost" WHERE id=${row.skillId} AND "characterId"=${row.characterId} AND "pchCost"=${row.baselinePch} AND status='APPROVED'`.affectedCount().build();
        if((await tx.execute(lock)).affectedRows!==1)throw new Error("STALE_SKILL");
        await (tx.orm.public as any).Skill.where({id:row.skillId}).update({
          name:payload.name,description:payload.description,cost:payload.cost,
          maintenanceCost:payload.maintenanceCost,accumulationCost:payload.accumulationCost,
          accumulationPerTick:payload.accumulationPerTick,duration:payload.duration,
          category:payload.category,areaOfEffect:serializeSkillRange(payload.areaOfEffect,payload.maxRangeMeters),
          speed:payload.speed,cooldown:payload.cooldown,condition:payload.condition,
          ...(payload.attackType!==undefined?{attackType:payload.attackType}:{}),
          ...(payload.defenseType!==undefined?{defenseType:payload.defenseType}:{}),
          effect:payload.effect,effectRequirements:payload.effectRequirements,mechanics:payload.mechanics,pchCost:row.nextPch
        });
      }else{
        const refund=db.raw.sql`UPDATE public."character"
          SET "pchBalance"="pchBalance"+${row.deltaPch},"skillUpgradeCredits"="skillUpgradeCredits"+1
          WHERE id=${row.characterId} AND "pchBalance"<=${2147483647-row.deltaPch} AND "skillUpgradeCredits"<2147483647
        `.affectedCount().build();
        if((await tx.execute(refund)).affectedRows!==1)throw new Error("REFUND_CONFLICT");
      }
      await tx.orm.public.AuditLog.create({
        actorUserId:user.id,action:b.decision==="APPROVED"?"SKILL_UPGRADE_APPROVE":"SKILL_UPGRADE_REJECT",
        entityType:"SKILL",entityId:row.skillId,characterId:row.characterId,targetUserId:null,
        details:JSON.stringify({requestId:id,pchDelta:row.deltaPch,decision:b.decision}),
      });
    });
  }catch(e){
    if(e instanceof Error && ["ALREADY_REVIEWED","STALE_SKILL"].includes(e.message))return NextResponse.json({error:e.message==="STALE_SKILL"?"La habilidad cambió; revisa la solicitud antes de aprobar.":"La solicitud ya fue resuelta."},{status:409});
    throw e;
  }
  return NextResponse.json({ok:true,status:b.decision,id});
}
