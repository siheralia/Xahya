import { NextResponse } from "next/server";
import { amount, badRequest, currentUser, salaryRest } from "@/lib/role-salary";
import { db } from "@/lib/db";

export async function GET() {
 const user=await currentUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 try {
  const [wallet,roles,assignments,characters,transfers]=await Promise.all([
   salaryRest("UserSalaryWallet?userId=eq."+user.id+"&select=*"),
   salaryRest("ManagedRole?select=id,name,color,dailyPts,dailyKarma,dailyMoney"),
   salaryRest("UserManagedRole?userId=eq."+user.id+"&select=roleId"),
   db.orm.public.Character.all(),
   salaryRest("SalaryTransfer?userId=eq."+user.id+"&select=id,characterId,pts,karma,money,createdAt&order=createdAt.desc&limit=20"),
  ]);
  return NextResponse.json({wallet:wallet[0]??{pts:0,karma:0,money:0},
   roles:roles.filter((r:{id:number})=>assignments.some((a:{roleId:number})=>a.roleId===r.id)),
   characters:characters.filter(c=>Number(c.userId)===Number(user.id)).map(c=>({id:c.id,name:c.name})),
   transfers});
 } catch(e){return badRequest(e);}
}
export async function POST(request:Request) {
 const user=await currentUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 if(["BANNED","SYSTEM"].includes(String(user.role)))return NextResponse.json({error:"Forbidden"},{status:403});
 const b=await request.json().catch(()=>null);
 const characterId=Number(b?.characterId),pts=amount(b?.pts),karma=amount(b?.karma),money=amount(b?.money);
 if(!Number.isSafeInteger(characterId)||characterId<1||pts===null||karma===null||money===null||pts+karma+money===0||
 typeof b?.requestKey!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.requestKey))
 return NextResponse.json({error:"Transferencia inválida"},{status:400});
 const character=await db.orm.public.Character.where({id:characterId}).first();
 if(!character||Number(character.userId)!==Number(user.id))return NextResponse.json({error:"Personaje no autorizado"},{status:403});
 try {
  const result=await salaryRest("rpc/transfer_role_salary",{method:"POST",body:JSON.stringify({
   p_user_id:user.id,p_character_id:characterId,p_pts:pts,p_karma:karma,p_money:money,p_request_key:b.requestKey
  })});
  return NextResponse.json({success:true,transferId:result});
 } catch(e) {
  const msg=String(e);
  if(/INSUFFICIENT_WALLET|WALLET_MISSING/.test(msg))return NextResponse.json({error:"Saldo insuficiente"},{status:409});
  if(/IDEMPOTENCY_KEY_CONFLICT|CHARACTER_NOT_OWNED|RESOURCE_OVERFLOW/.test(msg))return NextResponse.json({error:"Transferencia rechazada"},{status:409});
  return badRequest(e);
 }
}
