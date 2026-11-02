import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {meetsEffectRequirements} from "@/lib/skills/effect-requirements";
import {
 genericTemplateChain,quoteGenericSkill,evolveGenericSkillSnapshot,type GenericSkillTemplateRow,
} from "@/lib/skills/generic-catalog";

async function authorized(id:string){
 const characterId=Number(id);
 if(!Number.isSafeInteger(characterId)||characterId<=0)return null;
 const {userId}=await auth();
 if(!userId)return null;
 const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
 const character=await db.orm.public.Character.where({id:characterId}).first();
 if(!user||!character||(Number(character.userId)!==Number(user.id)&&!["GM","ADMIN"].includes(String(user.role))))return null;
 return {user,character,characterId};
}
const mapRow=(r:any):GenericSkillTemplateRow=>({
 id:Number(r.id),name:String(r.name),description:r.description??null,
 parentTemplateId:r.parentTemplateId==null?null:Number(r.parentTemplateId),
 payload:r.payload??{},elementChoice:Boolean(r.elementChoice),enabled:Boolean(r.enabled),
});
async function publishedTemplates(source:any=db):Promise<GenericSkillTemplateRow[]>{
 const rows=await (source.orm.public as any).GenericSkillTemplate.all();
 return rows.map(mapRow);
}
async function allowedElements():Promise<Array<{key:string;name:string}>> {
 const setting=await db.orm.public.AppSetting.where({key:"world.elements.v1"}).first();
 try {
  const elements=JSON.parse(String(setting?.value??"[]"));
  return Array.isArray(elements)?elements.filter((row:any)=>row&&typeof row.key==="string"&&typeof row.name==="string"):[];
 }catch{return [];}
}
const ownTemplateIds=(skills:any[])=>new Set(skills.map(s=>Number(s.genericTemplateId)).filter(x=>Number.isSafeInteger(x)&&x>0));

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const access=await authorized((await params).id);
 if(!access)return NextResponse.json({error:"Sin permiso."},{status:403});
 const all=await publishedTemplates();
 const owned=await (db.orm.public as any).Skill.where({characterId:access.characterId,status:"APPROVED"}).all();
 const ownedIds=ownTemplateIds(owned);
 const elements=(await allowedElements()).filter(e=>e.key!=="NEUTRAL");
 const sample=elements[0]?.key;
 const entries=await Promise.all(all.filter(t=>t.enabled).map(async t=>{
  try{
   const chain=genericTemplateChain(all,t.id);
   if(chain.some(x=>!x.enabled))return null;
   const req=chain.some(x=>x.elementChoice);
   const quote=await quoteGenericSkill(all,t.id,req?sample:undefined);
   if(quote.skill.effect.some((e:any)=>e.type==="ELEMENTAL_IMBUE" && (!e.element || e.element==="NEUTRAL" || !elements.some(el=>el.key===e.element))))return null;
   const alreadyOwned=[...ownedIds].some(existingId=>{
    try{return genericTemplateChain(all,existingId).some(x=>x.id===t.id);}
    catch{return false;}
   });
   const hasBase=quote.parentTemplateId===null||ownedIds.has(quote.parentTemplateId);
   return {id:t.id,name:t.name,description:t.description,category:quote.skill.category,
    cost:quote.skill.cost,pchCost:quote.pchCost,totalPch:quote.totalPch,
    parentTemplateId:quote.parentTemplateId,requiresElement:req,alreadyOwned,hasBase,
    affordable:Number(access.character.pchBalance??0)>=quote.pchCost,
    effects:quote.skill.effect.map((e:any)=>({type:e.type,element:e.element,target:e.target,value:e.value})),
   };
  }catch{return null;}
 }));
 return NextResponse.json({templates:entries.filter(Boolean),elements,pchBalance:Number(access.character.pchBalance??0)});
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 const access=await authorized((await params).id);
 if(!access)return NextResponse.json({error:"Sin permiso."},{status:403});
 const body=await request.json().catch(()=>null);
 const templateId=Number(body?.templateId);
 const chosenElement=typeof body?.element==="string"?body.element:undefined;
 if(!Number.isSafeInteger(templateId)||templateId<=0)
  return NextResponse.json({error:"Habilidad genérica inválida."},{status:400});
 const rows=await publishedTemplates();
 const template=rows.find(r=>r.id===templateId);
 if(!template?.enabled)return NextResponse.json({error:"La habilidad no está publicada."},{status:404});
 const chain=genericTemplateChain(rows,templateId);
 if(chain.some(x=>!x.enabled))return NextResponse.json({error:"Una habilidad base ya no está publicada."},{status:409});
 const requiresElement=chain.some(r=>r.elementChoice);
 const elements=await allowedElements();
 if(requiresElement && (!chosenElement||!elements.some(e=>e.key===chosenElement&&e.key!=="NEUTRAL")))
  return NextResponse.json({error:"Selecciona un elemento vigente, distinto de Neutro."},{status:400});
 if(!requiresElement&&chosenElement)
  return NextResponse.json({error:"Esta habilidad no admite selección elemental."},{status:400});
 let quote:Awaited<ReturnType<typeof quoteGenericSkill>>;
 try {quote=await quoteGenericSkill(rows,templateId,requiresElement?chosenElement:undefined);}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Habilidad inválida."},{status:400});}
 if(quote.skill.effect.some((e:any)=>e.type==="ELEMENTAL_IMBUE" &&
   (!e.element||e.element==="NEUTRAL"||!elements.some(el=>el.key===e.element))))
  return NextResponse.json({error:"La habilidad usa un elemento que ya no está disponible."},{status:409});
 try{
  const result=await db.transaction(async tx=>{
   // Serialize purchases per character before checking ownership, parent and balance.
   const lock=db.raw.sql`UPDATE public."character" SET "pchBalance"="pchBalance" WHERE id=${access.characterId}`.affectedCount().build();
   if((await tx.execute(lock)).affectedRows!==1)throw new Error("CHARACTER_MISSING");
   const TxSkill=(tx.orm.public as any).Skill;
   const fresh:GenericSkillTemplateRow[]=(await (tx.orm.public as any).GenericSkillTemplate.all()).map(mapRow);
   if(chain.some(original=>{
     const updated=fresh.find(row=>row.id===original.id);
     return !updated || JSON.stringify(updated)!==JSON.stringify(original);
   }))throw new Error("TEMPLATE_CHANGED");
   const owned=await TxSkill.where({characterId:access.characterId}).all();
   const active=owned.filter((row:any)=>String(row.status)==="APPROVED");
   const ownedIds=ownTemplateIds(active);
   if([...ownedIds].some(existingId=>{
    try{return genericTemplateChain(rows,existingId).some(t=>t.id===templateId);}
    catch{return false;}
   }))throw new Error("ALREADY_OWNED");
   let parentSkill:any=null;
   if(quote.parentTemplateId!==null){
    parentSkill=active.find((row:any)=>Number(row.genericTemplateId)===quote.parentTemplateId);
    if(!parentSkill)throw new Error("PARENT_NOT_OWNED");
    if(parentSkill.genericElement && parentSkill.genericElement!==chosenElement)
      throw new Error("ELEMENT_MISMATCH");
    const state=await (tx.orm.public as any).CharacterSkillState.where({characterId:access.characterId,skillId:Number(parentSkill.id)}).first();
    if(state?.active)throw new Error("PARENT_ACTIVE");
   }
   const requirements=quote.skill.effectRequirements??[];
   if(!meetsEffectRequirements(requirements,active.filter((s:any)=>Number(s.id)!==Number(parentSkill?.id??0))))
     throw new Error("MISSING_CAPABILITIES");
   const debit=db.raw.sql`UPDATE public."character" SET "pchBalance"="pchBalance"-${quote.pchCost} WHERE id=${access.characterId} AND "pchBalance">=${quote.pchCost}`.affectedCount().build();
   if((await tx.execute(debit)).affectedRows!==1)throw new Error("PCH_INSUFFICIENT");
   if(parentSkill && Number(parentSkill.pchCost??0)+quote.pchCost>2147483647)throw new Error("SKILL_PCH_OVERFLOW");
   const p=parentSkill
     ? evolveGenericSkillSnapshot(parentSkill,template,quote.skill,chosenElement)
     : quote.skill;
   const data={
    characterId:access.characterId,name:p.name,description:p.description,
    cost:p.cost,maintenanceCost:p.maintenanceCost,
    accumulationCost:p.accumulationCost,accumulationPerTick:p.accumulationPerTick,
    duration:p.duration,category:p.category,areaOfEffect:String(p.areaOfEffect??"Objetivo único")+" | Alcance máximo: "+p.maxRangeMeters+" m",
    speed:p.speed,cooldown:p.cooldown,condition:p.condition,
    attackType:p.attackType,defenseType:p.defenseType,
    effect:p.effect,effectRequirements:p.effectRequirements,
    mechanics:p.mechanics,
    genericTemplateId:templateId,genericElement:requiresElement?chosenElement:null,
    status:"APPROVED",approvedAt:new Date(),
   };
   let skill:any;
   if(parentSkill){
    skill=await TxSkill.where({id:Number(parentSkill.id)}).update({
     ...data,pchCost:Number(parentSkill.pchCost??0)+quote.pchCost,
    });
   }else{
    skill=await TxSkill.create({...data,pchCost:quote.pchCost});
   }
   const character=await tx.orm.public.Character.where({id:access.characterId}).first();
   if(!character)throw new Error("CHARACTER_MISSING");
   await tx.orm.public.AuditLog.create({
    actorUserId:access.user.id,action:parentSkill?"GENERIC_SKILL_EVOLVE":"GENERIC_SKILL_BUY",
    entityType:"SKILL",entityId:Number(skill.id),characterId:access.characterId,targetUserId:null,
    details:JSON.stringify({templateId,element:chosenElement??null,parentSkillId:parentSkill?.id??null,pchPaid:quote.pchCost,pchBalance:Number(character.pchBalance)}),
   });
   return {skill,pchCost:quote.pchCost,pchBalance:Number(character.pchBalance),evolved:Boolean(parentSkill)};
  });
  return NextResponse.json(result,{status:201});
 }catch(e){
  const error=e instanceof Error?e.message:"ERROR";
  const reasons:Record<string,string>={
   CHARACTER_MISSING:"Personaje no encontrado.",ALREADY_OWNED:"Ya conoces esta habilidad o una especialización superior.",
   PARENT_NOT_OWNED:"Primero compra la habilidad base.",ELEMENT_MISMATCH:"La especialización debe conservar el elemento de su base.",
   PARENT_ACTIVE:"Desactiva la habilidad base antes de evolucionarla.",
   MISSING_CAPABILITIES:"No cumples los requisitos de efectos y elementos.",
   PCH_INSUFFICIENT:"PCH insuficientes.",
   TEMPLATE_CHANGED:"El catálogo cambió mientras comprabas. Revisa los precios y vuelve a intentarlo.",
   SKILL_PCH_OVERFLOW:"La habilidad supera el límite de PCH permitido.",
  };
  return NextResponse.json({error:reasons[error]??"No se pudo completar la compra."},{status:409});
 }
}
