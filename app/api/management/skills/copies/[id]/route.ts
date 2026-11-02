import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {hasRolePermission} from "@/lib/role-permissions";
import {canCopySkill,copySkillSnapshot,type CopyEffect,type CopyMode} from "@/lib/skills/copy";
import {copyComplexityPch} from "@/lib/skills/copy-complexity";
import {defaultEffectPricing} from "@/lib/skills/pch";
import {readEffectPricing} from "@/lib/effects/pricing";

type RequestRow={id:number;characterId:number;copierSkillId:number;sourceSkillId:number;mode:CopyMode;status:string};
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const id=Number((await params).id);
  if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:"Solicitud inválida."},{status:400});
  const {userId}=await auth();
  if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
  const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
  if(!user)return NextResponse.json({error:"Forbidden"},{status:403});
  const body=await request.json().catch(()=>null);
  const decision=body?.decision;
  if(decision!=="APPROVED" && decision!=="REJECTED")
    return NextResponse.json({error:"Decisión inválida."},{status:400});
  const permission=decision==="APPROVED"?"approve":"reject";
  if(!(await hasRolePermission(user,"management.skills",permission)))
    return NextResponse.json({error:"No tienes permiso para revisar esta solicitud."},{status:403});
  const q=db.raw.sql`
    SELECT id,"characterId","copierSkillId","sourceSkillId",mode,status
    FROM public."skillCopyRequest" WHERE id=${id}
  `.returnsRow({
    id:"pg/int4@1",characterId:"pg/int4@1",copierSkillId:"pg/int4@1",
    sourceSkillId:"pg/int4@1",mode:"pg/text@1",status:"pg/text@1"
  }).build();
  const [row]=await db.runtime().query(q) as RequestRow[];
  if(!row)return NextResponse.json({error:"Solicitud no encontrada."},{status:404});
  if(row.status!=="PENDING")
    return NextResponse.json({error:"La solicitud ya fue revisada."},{status:409});
  const pricing=decision==="APPROVED"?{...defaultEffectPricing(),...await readEffectPricing()}:null;
  try {
    const copiedSkillId=await db.transaction(async tx=>{
      // Atomic claim prevents simultaneous reviews from granting two copies.
      const claim=db.raw.sql`
        UPDATE public."skillCopyRequest" SET status=${decision},"reviewedByUserId"=${Number(user.id)},
          "reviewedAt"=now() WHERE id=${id} AND status='PENDING'
      `.affectedCount().build();
      if((await tx.execute(claim)).affectedRows!==1)throw new Error("ALREADY_REVIEWED");
      let createdId:number|null=null;
      if(decision==="APPROVED"){
        // Serialize approvals of the same copying skill, including collection capacity checks.
        const lock=db.raw.sql`
          UPDATE public."skill" SET "pchCost"="pchCost"
          WHERE id=${row.copierSkillId} AND "characterId"=${row.characterId} AND status='APPROVED'
        `.affectedCount().build();
        if((await tx.execute(lock)).affectedRows!==1)throw new Error("COPIER_CHANGED");
        const origin=db.raw.sql`
          UPDATE public."skill" SET "pchCost"="pchCost"
          WHERE id=${row.sourceSkillId} AND status='APPROVED'
            AND NOT EXISTS (SELECT 1 FROM public."skillCopy" WHERE "copiedSkillId"=${row.sourceSkillId})
        `.affectedCount().build();
        if((await tx.execute(origin)).affectedRows!==1)throw new Error("COPY_RECURSION");
        const Skill=(tx.orm.public as any).Skill;
        const [copier,source]=await Promise.all([
          Skill.where({id:row.copierSkillId,characterId:row.characterId,status:"APPROVED"}).first(),
          Skill.where({id:row.sourceSkillId,status:"APPROVED"}).first()
        ]);
        if(!copier||!source)throw new Error("SOURCE_CHANGED");
        const effect=(Array.isArray(copier.effect)?copier.effect:[] as CopyEffect[])
          .find((candidate:CopyEffect)=>candidate.type==="COPY_SKILL" && (candidate.copyMode??"PERMANENT")===row.mode) as CopyEffect|undefined;
        if(!effect)throw new Error("COPY_MODE_CHANGED");
        const complexity=copyComplexityPch(source,pricing!);
        const violation=canCopySkill(effect,{...source,pchCost:complexity},row.mode);
        if(violation)throw new Error("COPY_RULE:"+violation);
        if(row.sourceSkillId===row.copierSkillId)throw new Error("COPY_SELF");
        const clone=copySkillSnapshot(source,effect);
        if(row.mode==="IMITATION"){
          // Imitation remains a recorded one-shot outcome, not automatic combat execution.
          const save=db.raw.sql`
            UPDATE public."skillCopyRequest" SET "imitationPayload"=${JSON.stringify({
              name:clone.name,effect:clone.effect,cost:clone.cost
            })}::jsonb WHERE id=${id}
          `.affectedCount().build();
          if((await tx.execute(save)).affectedRows!==1)throw new Error("COPY_SAVE_FAILED");
        }else{
          const created=await Skill.create({
            characterId:row.characterId,name:clone.name,cost:Number(clone.cost??0),
            accumulationCost:Number(clone.accumulationCost??0),accumulationPerTick:Number(clone.accumulationPerTick??0),
            maintenanceCost:Number(clone.maintenanceCost??0),description:clone.description??null,
            duration:clone.duration??null,category:clone.category??"UTILITY",
            areaOfEffect:clone.areaOfEffect??null,speed:clone.speed??"DEFAULT",
            cooldown:clone.cooldown??null,condition:clone.condition??null,
            effect:clone.effect??[],effectRequirements:clone.effectRequirements??[],mechanics:clone.mechanics??{},requiredSkillIds:[],
            pchCost:0,status:row.mode==="COLLECTION"?"STORED":"APPROVED"
          });
          createdId=Number(created.id);
          const insert=db.raw.sql`
            INSERT INTO public."skillCopy" ("characterId","copierSkillId","sourceSkillId","copiedSkillId",mode,"remainingTurns",equipped)
            SELECT ${row.characterId},${row.copierSkillId},${row.sourceSkillId},${createdId},${row.mode},
              NULLIF(${row.mode==="TEMPORARY"?Number(effect.copyDurationTurns??3):0},0),${row.mode!=="COLLECTION"}
            WHERE NOT EXISTS (SELECT 1 FROM public."skillCopy" WHERE "copiedSkillId"=${row.sourceSkillId})
              AND NOT EXISTS (SELECT 1 FROM public."skillCopy" WHERE "characterId"=${row.characterId}
                AND "copierSkillId"=${row.copierSkillId} AND "sourceSkillId"=${row.sourceSkillId} AND mode=${row.mode})
              AND (${row.mode}<>'COLLECTION' OR (SELECT count(*) FROM public."skillCopy" WHERE
                "characterId"=${row.characterId} AND "copierSkillId"=${row.copierSkillId} AND mode='COLLECTION')<${Number(effect.copyCapacity??5)})
          `.affectedCount().build();
          if((await tx.execute(insert)).affectedRows!==1)throw new Error("COPY_CONFLICT");
          const save=db.raw.sql`UPDATE public."skillCopyRequest" SET "copiedSkillId"=${createdId} WHERE id=${id}`.affectedCount().build();
          if((await tx.execute(save)).affectedRows!==1)throw new Error("COPY_SAVE_FAILED");
        }
      }
      await tx.orm.public.AuditLog.create({
        actorUserId:user.id,action:decision==="APPROVED"?"SKILL_COPY_APPROVE":"SKILL_COPY_REJECT",
        entityType:"SKILL",entityId:row.sourceSkillId,characterId:row.characterId,targetUserId:null,
        details:JSON.stringify({requestId:id,copierSkillId:row.copierSkillId,mode:row.mode,decision,copiedSkillId:createdId}),
      });
      return createdId;
    });
    return NextResponse.json({ok:true,id,status:decision,copiedSkillId});
  } catch(error) {
    const message=error instanceof Error?error.message:"UNKNOWN";
    if(message==="ALREADY_REVIEWED")return NextResponse.json({error:"La solicitud ya fue revisada."},{status:409});
    if(message.startsWith("COPY_RULE:"))return NextResponse.json({error:message.slice(10)},{status:409});
    if(["COPIER_CHANGED","SOURCE_CHANGED","COPY_MODE_CHANGED","COPY_SELF","COPY_RECURSION","ALREADY_COPIED","COLLECTION_FULL","COPY_CONFLICT"].includes(message)||/unique|duplicate/i.test(message))
      return NextResponse.json({error:"La habilidad original o los límites de copia cambiaron. No se aprobó la solicitud; revisa su estado y vuelve a intentar."},{status:409});
    throw error;
  }
}
