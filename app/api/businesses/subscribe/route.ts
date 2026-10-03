import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function addInterval(date: Date, value: number, unit: string) {
  const next = new Date(date);
  if (unit === "DAY") next.setUTCDate(next.getUTCDate() + value);
  else if (unit === "WEEK") next.setUTCDate(next.getUTCDate() + value * 7);
  else next.setUTCMonth(next.getUTCMonth() + value);
  return next;
}
async function getUser(){const {userId:clerkId}=await auth();if(!clerkId)return null;const users=await db.orm.public.User.all();return users.find((u)=>u.clerkId===clerkId)??null;}
export async function POST(request:Request){
  const user=await getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const body=await request.json().catch(()=>null);const characterId=Number(body?.characterId);const planId=Number(body?.planId);
  const Character=db.orm.public.Character;const Plan=(db.orm.public as any).BusinessSubscriptionPlan;const Subscription=(db.orm.public as any).BusinessSubscription;const Business=(db.orm.public as any).Business;
  const character=await Character.where({id:characterId}).first();if(!character||Number(character.userId)!==Number(user.id))return NextResponse.json({error:"Forbidden"},{status:403});
  const plan=await Plan.where({id:planId}).first();if(!plan||!plan.active)return NextResponse.json({error:"Plan no disponible."},{status:404});
  const existing=(await Subscription.where({planId,characterId}).all()).find((s:any)=>s.active);if(existing)return NextResponse.json({error:"Ya tienes esta suscripción activa."},{status:400});
  const price=Number(plan.price);const next=addInterval(new Date(),Number(plan.intervalValue),String(plan.intervalUnit));
  try{
    const result=await db.transaction(async(tx)=>{const R=tx.orm.public.CharacterResource;const B=(tx.orm.public as any).Business;const S=(tx.orm.public as any).BusinessSubscription;const resource=await R.where({characterId}).first();if(!resource||Number(resource.money)<price)throw new Error("NO_MONEY");const business=await B.where({id:Number(plan.businessId)}).first();if(!business)throw new Error("BUSINESS_MISSING");const updatedResource=await R.where({id:resource.id}).update({money:Number(resource.money)-price});await B.where({id:business.id}).update({balance:Number(business.balance)+price});const subscription=await S.create({planId,characterId,active:true,nextChargeAt:next,lastChargedAt:new Date(),createdAt:new Date()});return {updatedResource,subscription};});
    return NextResponse.json({subscription:result.subscription,money:Number(result.updatedResource.money)});
  }catch(e){if(e instanceof Error&&e.message==="NO_MONEY")return NextResponse.json({error:"No tienes suficiente dinero."},{status:400});return NextResponse.json({error:"No se pudo activar la suscripción."},{status:500});}
}