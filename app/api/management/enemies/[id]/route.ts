import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

async function getManager(){ const {userId:clerkId}=await auth(); if(!clerkId)return null; const users=await db.orm.public.User.all(); const user=users.find((u)=>u.clerkId===clerkId); return user&&["GM","ADMIN"].includes(String(user.role))?user:null; }
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getManager(); if(!user)return NextResponse.json({error:"Forbidden"},{status:403});
  const id=Number((await params).id); const Enemy=(db.orm.public as any).Enemy; const existing=await Enemy.where({id}).first(); if(!existing)return NextResponse.json({error:"Enemigo no encontrado."},{status:404});
  const body=await request.json().catch(()=>null);
  const updated=await Enemy.where({id}).update({name:String(body?.name??existing.name).trim(),description:body?.description==null?existing.description:String(body.description),rank:["NORMAL","ELITE","BOSS"].includes(body?.rank)?body.rank:existing.rank,stats:body?.stats??existing.stats,abilities:Array.isArray(body?.abilities)?body.abilities:existing.abilities,loot:Array.isArray(body?.loot)?body.loot:existing.loot,encounterWeight:Math.max(1,Number(body?.encounterWeight)||Number(existing.encounterWeight)),isBoss:body?.isBoss==null?Boolean(existing.isBoss):Boolean(body.isBoss),active:body?.active==null?Boolean(existing.active):Boolean(body.active),imagePath:body?.imagePath===undefined?existing.imagePath:(body.imagePath||null)});
  return NextResponse.json(updated);
}
