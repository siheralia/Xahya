import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const BUCKET="maze-themes";
const MAX_BYTES=8*1024*1024;

async function getManager(){const {userId:clerkId}=await auth();if(!clerkId)return null;const users=await db.orm.public.User.all();const user=users.find((u)=>u.clerkId===clerkId);return user&&["GM","ADMIN"].includes(String(user.role))?user:null;}
function config(){if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error("Faltan credenciales de Supabase.");return {url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};}
export async function POST(request:Request){
  const user=await getManager();if(!user)return NextResponse.json({error:"Forbidden"},{status:403});
  const form=await request.formData();const file=form.get("file");const themeId=Number(form.get("themeId"));
  if(!(file instanceof File)||!Number.isInteger(themeId))return NextResponse.json({error:"Archivo o temática inválidos."},{status:400});
  if(file.size<=0||file.size>MAX_BYTES)return NextResponse.json({error:"La imagen debe pesar entre 1 B y 8 MB."},{status:400});
  if(!String(file.type).startsWith("image/"))return NextResponse.json({error:"Solo se permiten imágenes."},{status:400});
  const Theme=(db.orm.public as any).Theme;const theme=await Theme.where({id:themeId}).first();if(!theme)return NextResponse.json({error:"Temática no encontrada."},{status:404});
  const path=String(theme.slug).toLowerCase()+".webp";const {url,key}=config();
  const upload=await fetch(url+"/storage/v1/object/"+BUCKET+"/"+path,{method:"POST",headers:{Authorization:"Bearer "+key,apikey:key,"Content-Type":"image/webp","x-upsert":"true","cache-control":"31536000"},body:Buffer.from(await file.arrayBuffer()),cache:"no-store"});
  if(!upload.ok)return NextResponse.json({error:"Supabase Storage rechazó la imagen ("+upload.status+")."},{status:502});
  const updated=await Theme.where({id:themeId}).update({imagePath:path});
  return NextResponse.json(updated);
}
