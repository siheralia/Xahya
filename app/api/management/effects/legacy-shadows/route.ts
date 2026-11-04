import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {hasRolePermission} from "@/lib/role-permissions";
import {readRacialSkills} from "@/lib/skills/racial-catalog";
import {cloneLegacySkillAsMicro,type LegacyModularShadow} from "@/lib/effects/legacy-modular-shadow";

export const dynamic="force-dynamic";

/**
 * Generates temporary shadow duplicates of ALL current approved/active
 * legacy definitions without inserting skills, altering owner entitlements,
 * charging PCH or issuing new approvals.
 */
export async function GET(){
  const {userId}=await auth();
  if(!userId)return NextResponse.json({error:"No autorizado."},{status:401});
  const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
  if(!user||!await hasRolePermission(user,"management.skills","view"))
    return NextResponse.json({error:"Sin permiso de gestión de habilidades."},{status:403});
  const [skills,racials,generics]=await Promise.all([
    (db.orm.public as any).Skill.all(),
    readRacialSkills(),
    (db.orm.public as any).GenericSkillTemplate.all(),
  ]);
  const originals:Array<{source:LegacyModularShadow["origin"]["source"];row:Record<string,unknown>}>= [
    ...skills.filter((s:any)=>s.status==="APPROVED")
      .map((row:any)=>({source:"skill" as const,row})),
    ...racials.filter(r=>r.active)
      .map(row=>({source:"raceSkill" as const,row})),
    ...generics.filter((g:any)=>g.enabled)
      .map((g:any)=>({source:"genericSkillTemplate" as const,
        row:{id:Number(g.id),name:String(g.name),category:g.payload?.category,
          mechanics:g.payload?.mechanics??{},condition:g.payload?.condition??null,
          duration:g.payload?.duration,cooldown:g.payload?.cooldown,
          maintenanceCost:g.payload?.maintenanceCost,
          effect:g.payload?.effect??[]}})),
  ];
  const duplicates:LegacyModularShadow[]=[];
  const errors:Array<{source:string;id:number;error:string}>=[];
  for(const original of originals){
    try{duplicates.push(cloneLegacySkillAsMicro(original.row,original.source));}
    catch(e){errors.push({
      source:original.source,id:Number(original.row.id),
      error:e instanceof Error?e.message:"Definición inválida",
    });}
  }
  return NextResponse.json({
    readonly:true,chargedPch:0,activated:false,
    counts:{
      originals:originals.length,duplicates:duplicates.length,
      represented:duplicates.filter(d=>d.represented).length,
      complete:duplicates.filter(d=>d.coverage==="COMPLETE").length,
      partial:duplicates.filter(d=>d.coverage==="PARTIAL").length,
      unsupported:duplicates.filter(d=>d.coverage==="UNSUPPORTED").length,
    },duplicates,errors,
  },{headers:{"Cache-Control":"private, no-store"}});
}
