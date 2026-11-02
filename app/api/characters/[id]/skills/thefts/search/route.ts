import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {canStealSkill,requiredTheftPch,type TheftEffect} from "@/lib/skills/theft";
import {copyComplexityPch} from "@/lib/skills/copy-complexity";
import {defaultEffectPricing} from "@/lib/skills/pch";
import {readEffectPricing} from "@/lib/effects/pricing";

type SkillResult={id:number;name:string;characterName:string;pchCost:number;
  grantedRaceSkill:number;grantedRacePerk:number;effectText:string};
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const id=Number((await params).id);
  if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:"Personaje inválido."},{status:400});
  const {userId}=await auth();
  if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
  const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
  const character=await db.orm.public.Character.where({id}).first();
  if(!user||!character||(Number(character.userId)!==Number(user.id)&&!["GM","ADMIN"].includes(String(user.role))))
    return NextResponse.json({error:"Forbidden"},{status:403});
  const url=new URL(request.url);
  const term=(url.searchParams.get("q")??"").trim().normalize("NFKC");
  const stealingSkillId=Number(url.searchParams.get("stealingSkillId"));
  if(term.length>80||!Number.isSafeInteger(stealingSkillId)||stealingSkillId<1)
    return NextResponse.json({error:"Búsqueda inválida."},{status:400});
  const skill=await (db.orm.public as any).Skill.where({id:stealingSkillId,characterId:id,status:"APPROVED"}).first();
  const effect=(Array.isArray(skill?.effect)?skill.effect:[]).find((e:TheftEffect)=>e.type==="STEAL_SKILL") as TheftEffect|undefined;
  if(!effect)return NextResponse.json({error:"No tienes una habilidad de robo aprobada."},{status:403});
  if(term.length<2)return NextResponse.json({skills:[]},{headers:{"Cache-Control":"private, no-store"}});
  const safe=term.replace(/[!%_]/g,char=>"!"+char);
  const pattern="%"+safe+"%";
  const q=db.raw.sql`
    SELECT s.id,s.name,c.name AS "characterName",s."pchCost",
      COALESCE(s."grantedByRaceSkillId",0) AS "grantedRaceSkill",
      COALESCE(s."grantedByRacePerkId",0) AS "grantedRacePerk",
      s.effect::text AS "effectText"
    FROM public."skill" s
    JOIN public."character" c ON c.id=s."characterId"
    WHERE s.status='APPROVED' AND s."characterId"<>${id}
      AND s.name ILIKE ${pattern} ESCAPE '!'
      AND NOT EXISTS (SELECT 1 FROM public."skillTheft" t
        WHERE (t."sourceSkillId"=s.id AND t.status='ACTIVE') OR t."stolenSkillId"=s.id)
      AND NOT EXISTS (SELECT 1 FROM public."skillCopy" sc WHERE sc."copiedSkillId"=s.id)
    ORDER BY CASE WHEN lower(s.name)=lower(${term}) THEN 0 ELSE 1 END,s.name,s.id LIMIT 80
  `.returnsRow({id:"pg/int4@1",name:"pg/text@1",characterName:"pg/text@1",pchCost:"pg/int4@1",
    grantedRaceSkill:"pg/int4@1",grantedRacePerk:"pg/int4@1",effectText:"pg/text@1"}).build();
  const rows=await db.runtime().query(q) as SkillResult[];
  const prices={...defaultEffectPricing(),...await readEffectPricing()};
  const results:Array<{id:number;name:string;characterName:string;complexityPch:number;requiredPch:number}>=[];
  for(const row of rows){
    let effects:unknown;
    try{effects=JSON.parse(row.effectText)}catch{continue}
    if(!Array.isArray(effects))continue;
    const complexity=copyComplexityPch({pchCost:row.pchCost,effect:effects},prices);
    if(canStealSkill(effect,{pchCost:complexity,effect:effects,
      grantedByRacePerkId:row.grantedRacePerk||null,grantedByRaceSkillId:row.grantedRaceSkill||null},complexity))continue;
    results.push({id:row.id,name:row.name,characterName:row.characterName,complexityPch:complexity,requiredPch:requiredTheftPch(complexity)});
    if(results.length>=20)break;
  }
  return NextResponse.json({skills:results},{headers:{"Cache-Control":"private, no-store"}});
}
