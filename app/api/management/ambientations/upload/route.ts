import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";

export async function POST(request:Request) {
 const {userId} = await auth();
 if (!userId) return NextResponse.json({error:"Forbidden"},{status:403});
 const users = await db.orm.public.User.all();
 if (!users.some(u=>u.clerkId===userId && ["GM","ADMIN"].includes(String(u.role)))) return NextResponse.json({error:"Forbidden"},{status:403});
 const form = await request.formData().catch(()=>null);
 const file = form?.get("file");
 if (!(file instanceof File) || file.size>5*1024*1024 || file.size===0 || !["image/png","image/jpeg","image/webp","image/gif"].includes(file.type)) return NextResponse.json({error:"Imagen inválida (máximo 5 MB)"},{status:400});
 const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if (!url || !key) return NextResponse.json({error:"Almacenamiento no configurado"},{status:503});
 const ext=({ "image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/gif":"gif" } as Record<string,string>)[file.type];
 const path=randomUUID()+"."+ext;
 const response=await fetch(url+"/storage/v1/object/seasonal-ambientations/"+path,{method:"POST",headers:{Authorization:"Bearer "+key,apikey:key,"Content-Type":file.type,"x-upsert":"false"},body:await file.arrayBuffer()});
 if (!response.ok) return NextResponse.json({error:"No se pudo subir la imagen"},{status:502});
 return NextResponse.json({imageUrl:url+"/storage/v1/object/public/seasonal-ambientations/"+path});
}
