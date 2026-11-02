import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {randomInt} from "node:crypto";
import {getEffectiveCharacterStats} from "@/lib/stats/effective";
import {resolveWillpowerClash} from "@/lib/combat/willpower-clash";
import {canStealSkill,snapshotStolenSkill,type TheftEffect} from "@/lib/skills/theft";
import {copyComplexityPch} from "@/lib/skills/copy-complexity";
import {defaultEffectPricing} from "@/lib/skills/pch";
import {readEffectPricing} from "@/lib/effects/pricing";

async function access(characterId:number){
  const {userId}=await auth();
  if(!userId)return null;
  const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
  const character=await db.orm.public.Character.where({id:characterId}).first();
  if(!user||!character||(Number(character.userId)!==Number(user.id)&&!["GM","ADMIN"].includes(String(user.role))))return null;
  return {user,character};
}

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const characterId=Number((await params).id);
  if(!Number.isSafeInteger(characterId)||characterId<1)return NextResponse.json({error:"Personaje inválido."},{status:400});
  if(!await access(characterId))return NextResponse.json({error:"Forbidden"},{status:403});
  const q=db.raw.sql`
    SELECT t.id,t."thiefCharacterId",t."victimCharacterId",t."sourceSkillId",
      t."stolenSkillId",t."remainingTurns",t.status,
      source.name AS "sourceName",thief.name AS "thiefName",victim.name AS "victimName"
    FROM public."skillTheft" t
    JOIN public."skill" source ON source.id=t."sourceSkillId"
    JOIN public."character" thief ON thief.id=t."thiefCharacterId"
    JOIN public."character" victim ON victim.id=t."victimCharacterId"
    WHERE (t."thiefCharacterId"=${characterId} OR t."victimCharacterId"=${characterId})
      AND t.status='ACTIVE'
    ORDER BY t.id DESC
  `.returnsRow({id:"pg/int4@1",thiefCharacterId:"pg/int4@1",victimCharacterId:"pg/int4@1",
    sourceSkillId:"pg/int4@1",stolenSkillId:"pg/int4@1",remainingTurns:"pg/int4@1",
    status:"pg/text@1",sourceName:"pg/text@1",thiefName:"pg/text@1",victimName:"pg/text@1"}).build();
  return NextResponse.json({thefts:await db.runtime().query(q)},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const characterId=Number((await params).id);
  if(!Number.isSafeInteger(characterId)||characterId<1)return NextResponse.json({error:"Personaje inválido."},{status:400});
  const owner=await access(characterId);
  if(!owner)return NextResponse.json({error:"Forbidden"},{status:403});
  const data=await request.json().catch(()=>null);
  const stealingSkillId=Number(data?.stealingSkillId),sourceSkillId=Number(data?.sourceSkillId);
  if(!Number.isSafeInteger(stealingSkillId)||stealingSkillId<1||!Number.isSafeInteger(sourceSkillId)||sourceSkillId<1)
    return NextResponse.json({error:"Selecciona ambas habilidades."},{status:400});

  const Skill=(db.orm.public as any).Skill;
  const [stealingSkill,source]=await Promise.all([
    Skill.where({id:stealingSkillId,characterId,status:"APPROVED"}).first(),
    Skill.where({id:sourceSkillId,status:"APPROVED"}).first()
  ]);
  if(!stealingSkill||!source||Number(source.characterId)===characterId)
    return NextResponse.json({error:"El robo requiere una habilidad aprobada de otro personaje."},{status:400});
  const effect=(Array.isArray(stealingSkill.effect)?stealingSkill.effect:[])
    .find((e:TheftEffect)=>e?.type==="STEAL_SKILL") as TheftEffect|undefined;
  if(!effect)return NextResponse.json({error:"Esta habilidad no permite robar."},{status:400});
  const complexity=copyComplexityPch(source,{...defaultEffectPricing(),...await readEffectPricing()});
  const rule=canStealSkill(effect,source,complexity);
  if(rule)return NextResponse.json({error:rule},{status:400});
  const duration=Number(effect.stealDurationTurns??3),capacity=Number(effect.stealCapacity??1);

  try{
    const theftResult=await db.transaction(async tx=>{
      // Serialize all thefts using a skill; validate the source after obtaining both locks.
      const lockThief=db.raw.sql`
        UPDATE public."skill" SET "pchCost"="pchCost"
        WHERE id=${stealingSkillId} AND "characterId"=${characterId} AND status='APPROVED'
      `.affectedCount().build();
      if((await tx.execute(lockThief)).affectedRows!==1)throw new Error("STEALING_SKILL_CHANGED");
      const lockSource=db.raw.sql`
        UPDATE public."skill" SET "pchCost"="pchCost"
        WHERE id=${sourceSkillId} AND status='APPROVED'
          AND NOT EXISTS (SELECT 1 FROM public."skillCopy" WHERE "copiedSkillId"=${sourceSkillId})
          AND NOT EXISTS (SELECT 1 FROM public."skillTheft" WHERE "stolenSkillId"=${sourceSkillId})
      `.affectedCount().build();
      if((await tx.execute(lockSource)).affectedRows!==1)throw new Error("SOURCE_NOT_AVAILABLE");

      const TxSkill=(tx.orm.public as any).Skill;
      const fresh=await TxSkill.where({id:sourceSkillId,status:"APPROVED"}).first();
      const freshTheftSkill=await TxSkill.where({id:stealingSkillId,characterId,status:"APPROVED"}).first();
      const freshEffect=(Array.isArray(freshTheftSkill?.effect)?freshTheftSkill.effect:[])
        .find((e:TheftEffect)=>e?.type==="STEAL_SKILL") as TheftEffect|undefined;
      if(!fresh||!freshEffect)throw new Error("STEALING_SKILL_CHANGED");
      const changed=canStealSkill(freshEffect,fresh,copyComplexityPch(fresh,{...defaultEffectPricing(),...await readEffectPricing()}));
      if(changed)throw new Error("STEAL_RULE:"+changed);

      // Each attempt is claimed in the same transaction: a failed roll cannot be spammed.
      const attempt=db.raw.sql`
        INSERT INTO public."skillTheftAttemptGuard" ("thiefCharacterId","sourceSkillId","nextAllowedAt")
        VALUES (${characterId},${sourceSkillId},now()+interval '60 seconds')
        ON CONFLICT ("thiefCharacterId","sourceSkillId") DO UPDATE
          SET "nextAllowedAt"=EXCLUDED."nextAllowedAt"
          WHERE public."skillTheftAttemptGuard"."nextAllowedAt"<=now()
      `.affectedCount().build();
      if((await tx.execute(attempt)).affectedRows!==1)throw new Error("THEFT_COOLDOWN");
      const [attackerStats,defenderStats]=await Promise.all([
        getEffectiveCharacterStats(characterId,tx),
        getEffectiveCharacterStats(Number(fresh.characterId),tx)
      ]);
      if(!attackerStats||!defenderStats)throw new Error("WILLPOWER_STATS_MISSING");
      const clash=resolveWillpowerClash({
        attacker:attackerStats.effectiveStats,
        defender:defenderStats.effectiveStats,
        attackRoll:randomInt(1,21),
        defenseRoll:randomInt(1,21),
        bodyCoercion:freshEffect.stealBodyCoercion===true
      });
      if(clash.resisted){
        await tx.orm.public.AuditLog.create({
          actorUserId:owner.user.id,action:"SKILL_STEAL_RESISTED",entityType:"SKILL",
          entityId:sourceSkillId,characterId,targetUserId:null,
          details:JSON.stringify({stealingSkillId,sourceSkillId,clash})
        });
        return {resisted:true,stolenSkillId:null,clash};
      }
      const original=snapshotStolenSkill(fresh,freshEffect);
      const created=await TxSkill.create({
        characterId,name:original.name,cost:Number(original.cost??0),
        accumulationCost:Number(original.accumulationCost??0),accumulationPerTick:Number(original.accumulationPerTick??0),
        maintenanceCost:Number(original.maintenanceCost??0),description:original.description??null,
        duration:original.duration??null,category:original.category??"UTILITY",
        areaOfEffect:original.areaOfEffect??null,speed:original.speed??"DEFAULT",
        cooldown:original.cooldown??null,condition:original.condition??null,
        effect:original.effect??[],effectRequirements:original.effectRequirements??[],
        requiredSkillIds:[],pchCost:0,status:"APPROVED"
      });
      const insert=db.raw.sql`
        INSERT INTO public."skillTheft" ("thiefCharacterId","victimCharacterId","stealingSkillId",
          "sourceSkillId","stolenSkillId","remainingTurns",status)
        SELECT ${characterId},${Number(fresh.characterId)},${stealingSkillId},${sourceSkillId},
          ${Number(created.id)},${Number(freshEffect.stealDurationTurns??duration)},'ACTIVE'
        WHERE NOT EXISTS (SELECT 1 FROM public."skillTheft" WHERE "sourceSkillId"=${sourceSkillId} AND status='ACTIVE')
          AND (SELECT count(*) FROM public."skillTheft"
              WHERE "thiefCharacterId"=${characterId} AND "stealingSkillId"=${stealingSkillId} AND status='ACTIVE')
              < ${Number(freshEffect.stealCapacity??capacity)}
      `.affectedCount().build();
      if((await tx.execute(insert)).affectedRows!==1)throw new Error("THEFT_INSERT_FAILED");
      const suspend=db.raw.sql`
        UPDATE public."characterSkillState" SET active=false,"updatedAt"=now()
        WHERE "characterId"=${Number(fresh.characterId)} AND "skillId"=${sourceSkillId} AND active=true
      `.affectedCount().build();
      await tx.execute(suspend);
      await tx.orm.public.AuditLog.create({
        actorUserId:owner.user.id,action:"SKILL_STEAL",entityType:"SKILL",
        entityId:sourceSkillId,characterId,targetUserId:null,
        details:JSON.stringify({stealingSkillId,sourceSkillId,stolenSkillId:Number(created.id),duration,complexity,clash})
      });
      return {resisted:false,stolenSkillId:Number(created.id),clash};
    });
    if(theftResult.resisted)
      return NextResponse.json({ok:false,resisted:true,clash:theftResult.clash,
        message:"La víctima resistió el choque de voluntades. No se robó su habilidad."});
    return NextResponse.json({ok:true,stolenSkillId:theftResult.stolenSkillId,
      clash:theftResult.clash,remainingTurns:duration},{status:201});
  }catch(error){
    const reason=error instanceof Error?error.message:"";
    if(reason.startsWith("STEAL_RULE:"))return NextResponse.json({error:reason.slice(11)},{status:409});
    if(reason==="THEFT_COOLDOWN")
      return NextResponse.json({error:"Ya intentaste robar esta habilidad recientemente. Puedes volver a intentarlo en 60 segundos."},{status:429});
    if(reason==="WILLPOWER_STATS_MISSING")
      return NextResponse.json({error:"Faltan estadísticas de voluntad para resolver el choque."},{status:409});
    if(["SOURCE_NOT_AVAILABLE","STEALING_SKILL_CHANGED","THEFT_CAPACITY","THEFT_INSERT_FAILED"].includes(reason)||/unique|duplicate/i.test(reason))
      return NextResponse.json({error:"La habilidad ya fue robada o se alcanzó el límite de robos activos."},{status:409});
    throw error;
  }
}
