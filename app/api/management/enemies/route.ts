import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

async function getManager(){ const {userId:clerkId}=await auth(); if(!clerkId)return null; const users=await db.orm.public.User.all(); const user=users.find((u)=>u.clerkId===clerkId); return user&&["GM","ADMIN"].includes(String(user.role))?user:null; }

export async function GET(){ const user=await getManager(); if(!user)return NextResponse.json({error:"Forbidden"},{status:403}); return NextResponse.json(await (db.orm.public as any).Enemy.all()); }
export async function POST(request:Request){
  const user=await getManager(); if(!user)return NextResponse.json({error:"Forbidden"},{status:403});
  const body=await request.json().catch(()=>null);
  const name=String(body?.name??"").trim(); if(!name)return NextResponse.json({error:"El enemigo necesita un nombre."},{status:400});
  const Enemy=(db.orm.public as any).Enemy;
  const enemy=await Enemy.create({name,description:String(body?.description??"").trim()||null,rank:["NORMAL","ELITE","BOSS"].includes(body?.rank)?body.rank:"NORMAL",stats:body?.stats??{},abilities:Array.isArray(body?.abilities)?body.abilities:[],loot:Array.isArray(body?.loot)?body.loot:[],encounterWeight:Math.max(1,Number(body?.encounterWeight)||1),isBoss:Boolean(body?.isBoss),active:true});
  return NextResponse.json(enemy,{status:201});
}
