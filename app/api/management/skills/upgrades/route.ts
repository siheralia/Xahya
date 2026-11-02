import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {hasRolePermission} from "@/lib/role-permissions";

export async function GET(){
  const {userId}=await auth();
  if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
  const user=(await db.orm.public.User.all()).find(x=>x.clerkId===userId);
  if(!user||!(await hasRolePermission(user,"management.skills","view")))return NextResponse.json({error:"Forbidden"},{status:403});
  const q=db.raw.sql`SELECT r.id,r."characterId",r."skillId",r."baselinePch",r."nextPch",r."deltaPch",
    r.status,r.payload::text AS "payloadText",s.name AS "skillName",c.name AS "characterName"
    FROM public."skillUpgradeRequest" r
    JOIN public."skill" s ON s.id=r."skillId"
    JOIN public."character" c ON c.id=r."characterId"
    ORDER BY CASE WHEN r.status='PENDING' THEN 0 ELSE 1 END,r.id DESC LIMIT 200
  `.returnsRow({id:"pg/int4@1",characterId:"pg/int4@1",skillId:"pg/int4@1",baselinePch:"pg/int4@1",nextPch:"pg/int4@1",deltaPch:"pg/int4@1",status:"pg/text@1",payloadText:"pg/text@1",skillName:"pg/text@1",characterName:"pg/text@1"}).build();
  const rows=await db.runtime().query(q) as Array<{id:number;characterId:number;skillId:number;baselinePch:number;nextPch:number;deltaPch:number;status:string;payloadText:string;skillName:string;characterName:string}>;
  return NextResponse.json({requests:rows.map(({payloadText,...row})=>({...row,payload:JSON.parse(payloadText)}))});
}
