import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readBalance, writeBalance } from "@/lib/stats/balance";
async function admin(){
 const {userId}=await auth();if(!userId)return false;
 const user=(await db.orm.public.User.where({clerkId:userId}).first());
 return String(user?.role)==="ADMIN";
}
export async function GET(){
 if(!await admin())return NextResponse.json({error:"No autorizado"},{status:403});
 return NextResponse.json({balance:await readBalance()});
}
export async function PUT(req:Request){
 if(!await admin())return NextResponse.json({error:"No autorizado"},{status:403});
 try{const body=await req.json();await writeBalance(body.balance);return NextResponse.json({balance:await readBalance()});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Configuración inválida"},{status:400});}
}
