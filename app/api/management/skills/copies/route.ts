import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {hasRolePermission} from "@/lib/role-permissions";

export async function GET(){
  const {userId}=await auth();
  if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
  const user=(await db.orm.public.User.all()).find(candidate=>candidate.clerkId===userId);
  if(!user || !(await hasRolePermission(user,"management.skills","view")))
    return NextResponse.json({error:"Forbidden"},{status:403});
  const q=db.raw.sql`
    SELECT r.id,r."characterId",r."copierSkillId",r."sourceSkillId",r.mode,r.status,
      c.name AS "characterName",copier.name AS "copierName",source.name AS "sourceName",
      origin.name AS "sourceCharacterName",r."createdAt"::text AS "createdAtText",
      r."copiedSkillId"
    FROM public."skillCopyRequest" r
    JOIN public."character" c ON c.id=r."characterId"
    JOIN public."skill" copier ON copier.id=r."copierSkillId"
    JOIN public."skill" source ON source.id=r."sourceSkillId"
    JOIN public."character" origin ON origin.id=source."characterId"
    ORDER BY CASE WHEN r.status='PENDING' THEN 0 ELSE 1 END,r.id DESC LIMIT 200
  `.returnsRow({
    id:"pg/int4@1",characterId:"pg/int4@1",copierSkillId:"pg/int4@1",sourceSkillId:"pg/int4@1",
    mode:"pg/text@1",status:"pg/text@1",characterName:"pg/text@1",
    copierName:"pg/text@1",sourceName:"pg/text@1",sourceCharacterName:"pg/text@1",
    createdAtText:"pg/text@1",copiedSkillId:"pg/int4@1"
  }).build();
  const requests=await db.runtime().query(q);
  const [approve,reject]=await Promise.all([
    hasRolePermission(user,"management.skills","approve"),
    hasRolePermission(user,"management.skills","reject")
  ]);
  return NextResponse.json({requests,permissions:{approve,reject}},{headers:{"Cache-Control":"private, no-store"}});
}
