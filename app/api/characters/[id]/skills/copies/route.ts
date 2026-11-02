import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {canCopySkill,copySkillSnapshot,type CopyEffect,type CopyMode,COPY_MODES} from "@/lib/skills/copy";
import {defaultEffectPricing} from "@/lib/skills/pch";
import {copyComplexityPch} from "@/lib/skills/copy-complexity";
import {readEffectPricing} from "@/lib/effects/pricing";

const codec={id:"pg/int4@1",copierSkillId:"pg/int4@1",sourceSkillId:"pg/int4@1",copiedSkillId:"pg/int4@1",mode:"pg/text@1",remainingTurns:"pg/int4@1",equipped:"pg/bool@1",name:"pg/text@1"} as const;
async function access(id:number){
  const {userId}=await auth();
  if(!userId)return null;
  const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
  const character=await db.orm.public.Character.where({id}).first();
  if(!user||!character||(Number(character.userId)!==Number(user.id)&&!["ADMIN","GM"].includes(String(user.role))))return null;
  return {user,character};
}
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const id=Number((await params).id);
  if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:"Personaje inválido."},{status:400});
  if(!(await access(id)))return NextResponse.json({error:"Forbidden"},{status:403});
  const q=db.raw.sql`SELECT sc.id,sc."copierSkillId",sc."sourceSkillId",sc."copiedSkillId",sc.mode,sc."remainingTurns",sc.equipped,s.name FROM public."skillCopy" sc JOIN public."skill" s ON s.id=sc."copiedSkillId" WHERE sc."characterId"=${id} ORDER BY sc.id DESC`.returnsRow(codec).build();
  return NextResponse.json({copies:await db.runtime().query(q)});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const id=Number((await params).id);
  if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:"Personaje inválido."},{status:400});
  const owner=await access(id);if(!owner)return NextResponse.json({error:"Forbidden"},{status:403});
  const body=await request.json().catch(()=>null);
  const copierId=Number(body?.copierSkillId),sourceId=Number(body?.sourceSkillId),mode=String(body?.mode??"") as CopyMode;
  if(!Number.isSafeInteger(copierId)||copierId<=0||!Number.isSafeInteger(sourceId)||sourceId<=0||!COPY_MODES.includes(mode))return NextResponse.json({error:"Datos de copia inválidos."},{status:400});
  const Skill=(db.orm.public as any).Skill;
  const [copier,source]=await Promise.all([Skill.where({id:copierId,characterId:id,status:"APPROVED"}).first(),Skill.where({id:sourceId,status:"APPROVED"}).first()]);
  if(!copier||!source)return NextResponse.json({error:"La habilidad de copia o la habilidad original no está aprobada."},{status:404});
  const effects=(Array.isArray(copier.effect)?copier.effect:[]) as CopyEffect[];
  const copyEffect=effects.find(e=>e.type==="COPY_SKILL"&&(e.copyMode??"PERMANENT")===mode);
  if(!copyEffect)return NextResponse.json({error:"La habilidad no dispone de esta modalidad de copia."},{status:400});
  const undiscounted = copyComplexityPch(source,{
    ...defaultEffectPricing(),...await readEffectPricing()
  });
  const rule=canCopySkill(copyEffect,{...source,pchCost:undiscounted},mode);
  if(rule)return NextResponse.json({error:rule},{status:400});
  if(Number(source.id)===Number(copier.id))return NextResponse.json({error:"Una habilidad de copia no puede copiarse a sí misma."},{status:400});
  const copiedSource=db.raw.sql`SELECT id FROM public."skillCopy" WHERE "copiedSkillId"=${sourceId}`.returnsRow({id:"pg/int4@1"}).build();
  if((await db.runtime().query(copiedSource)).length)return NextResponse.json({error:"No se permite copiar una habilidad que ya sea una copia."},{status:400});
  const clone=copySkillSnapshot(source,copyEffect);
  if(mode==="IMITATION"){
    // A one-shot imitation returns a self-contained effect snapshot; no saved skill is granted.
    await (db.orm.public as any).AuditLog.create({
      actorUserId:owner.user.id,action:"SKILL_IMITATE",entityType:"SKILL",
      entityId:sourceId,characterId:id,targetUserId:null,
      details:JSON.stringify({copierId,sourceId,mode}),
    });
    return NextResponse.json({mode,used:true,imitation:{name:clone.name,effect:clone.effect,cost:clone.cost}});
  }
  const check=db.raw.sql`SELECT id FROM public."skillCopy" WHERE "characterId"=${id} AND "copierSkillId"=${copierId} AND "sourceSkillId"=${sourceId} AND mode=${mode}`.returnsRow({id:"pg/int4@1"}).build();
  if((await db.runtime().query(check)).length)return NextResponse.json({error:"Ya tienes una copia de esa habilidad en esta modalidad."},{status:409});
  if(mode==="COLLECTION"){
    const countQ=db.raw.sql`SELECT count(*)::integer AS count FROM public."skillCopy" WHERE "characterId"=${id} AND "copierSkillId"=${copierId} AND mode='COLLECTION'`.returnsRow({count:"pg/int4@1"}).build();
    const [row]=await db.runtime().query(countQ) as Array<{count:number}>;
    if(Number(row?.count??0)>=Number(copyEffect.copyCapacity??5))return NextResponse.json({error:"La colección alcanzó su capacidad."},{status:400});
  }
  try{
    const copied=await db.transaction(async tx=>{
      const ts=(tx.orm.public as any).Skill;
      const created=await ts.create({
        characterId:id,name:clone.name,cost:Number(clone.cost??0),
        accumulationCost:Number(clone.accumulationCost??0),accumulationPerTick:Number(clone.accumulationPerTick??0),
        maintenanceCost:Number(clone.maintenanceCost??0),description:clone.description??null,
        duration:clone.duration??null,category:clone.category??"UTILITY",
        areaOfEffect:clone.areaOfEffect??null,speed:clone.speed??"DEFAULT",
        cooldown:clone.cooldown??null,condition:clone.condition??null,effect:clone.effect??[],
        effectRequirements:clone.effectRequirements??[],requiredSkillIds:[],
        pchCost:0,status:mode==="COLLECTION"?"STORED":"APPROVED"
      });
      const insert=db.raw.sql`INSERT INTO public."skillCopy" ("characterId","copierSkillId","sourceSkillId","copiedSkillId",mode,"remainingTurns",equipped)
      VALUES (${id},${copierId},${sourceId},${Number(created.id)},${mode},NULLIF(${mode==="TEMPORARY"?Number(copyEffect.copyDurationTurns??3):0},0),${mode!=="COLLECTION"})`.affectedCount().build();
      if((await tx.execute(insert)).affectedRows!==1)throw new Error("COPY_INSERT_FAILED");
      await tx.orm.public.AuditLog.create({
        actorUserId:owner.user.id,action:"SKILL_COPY",entityType:"SKILL",
        entityId:Number(created.id),characterId:id,targetUserId:null,
        details:JSON.stringify({copierId,sourceId,mode,complexity:source.pchCost}),
      });
      return created;
    });
    return NextResponse.json({ok:true,mode,skill:copied},{status:201});
  }catch(error){
    if(error instanceof Error && /unique|duplicate/i.test(error.message))return NextResponse.json({error:"Esta copia ya existe."},{status:409});
    throw error;
  }
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const id=Number((await params).id);
  if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:"Personaje inválido."},{status:400});
  const owner=await access(id);if(!owner)return NextResponse.json({error:"Forbidden"},{status:403});
  const b=await request.json().catch(()=>null);
  const copyId=Number(b?.copyId),equip=b?.equip;
  if(!Number.isSafeInteger(copyId)||copyId<=0||typeof equip!=="boolean")return NextResponse.json({error:"Selección inválida."},{status:400});
  const q=db.raw.sql`SELECT sc.id,sc."copierSkillId",sc."sourceSkillId",sc."copiedSkillId",sc.mode,sc."remainingTurns",sc.equipped,s.name FROM public."skillCopy" sc JOIN public."skill" s ON s.id=sc."copiedSkillId" WHERE sc.id=${copyId} AND sc."characterId"=${id}`.returnsRow(codec).build();
  const [copy]=await db.runtime().query(q) as Array<{id:number;copierSkillId:number;sourceSkillId:number;copiedSkillId:number;mode:string;equipped:boolean}>;
  if(!copy||copy.mode!=="COLLECTION")return NextResponse.json({error:"Copia de colección no encontrada."},{status:404});
  await db.transaction(async tx=>{
    const mark=db.raw.sql`UPDATE public."skillCopy" SET equipped=${equip} WHERE id=${copyId} AND "characterId"=${id}`.affectedCount().build();
    if((await tx.execute(mark)).affectedRows!==1)throw new Error("COPY_NOT_FOUND");
    if(equip){
      const unmark=db.raw.sql`UPDATE public."skillCopy" SET equipped=false WHERE "characterId"=${id} AND "copierSkillId"=${copy.copierSkillId} AND mode='COLLECTION' AND id<>${copyId}`.affectedCount().build();
      await tx.execute(unmark);
      const demote=db.raw.sql`UPDATE public."skill" SET status='STORED' WHERE id IN (SELECT "copiedSkillId" FROM public."skillCopy" WHERE "characterId"=${id} AND "copierSkillId"=${copy.copierSkillId} AND mode='COLLECTION' AND id<>${copyId})`.affectedCount().build();
      await tx.execute(demote);
    }
    const set=db.raw.sql`UPDATE public."skill" SET status=${equip?"APPROVED":"STORED"} WHERE id=${copy.copiedSkillId} AND "characterId"=${id}`.affectedCount().build();
    if((await tx.execute(set)).affectedRows!==1)throw new Error("SKILL_NOT_FOUND");
    await tx.orm.public.AuditLog.create({actorUserId:owner.user.id,action:"SKILL_COPY_EQUIP",entityType:"SKILL",entityId:copy.copiedSkillId,characterId:id,targetUserId:null,details:JSON.stringify({copyId,equip})});
  });
  return NextResponse.json({ok:true,equipped:equip});
}
