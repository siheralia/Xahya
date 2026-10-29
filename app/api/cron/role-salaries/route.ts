import { NextRequest, NextResponse } from "next/server";
import { salaryRest } from "@/lib/role-salary";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function salaryDay(now:Date) {
 // Align salary accounting with the game's economy timezone.
 return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Chihuahua",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
}
export async function GET(request:NextRequest) {
 const secret=process.env.CRON_SECRET;
 if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)
  return NextResponse.json({error:"Unauthorized"},{status:401});
 try {
  const date=salaryDay(new Date());
  const creditedUsers=await salaryRest("rpc/accrue_role_salary",{method:"POST",body:JSON.stringify({p_day:date})});
  return NextResponse.json({ok:true,date,creditedUsers});
 }catch(e){
  console.error("Role salary cron failed",e);
  return NextResponse.json({error:"Salary accrual failed"},{status:500});
 }
}
