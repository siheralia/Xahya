import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

async function getManager() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((u) => u.clerkId === clerkId);
  return user && ["GM","ADMIN"].includes(String(user.role)) ? user : null;
}

function slugify(value:string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim()
    .replace(/[^A-Z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,50);
}

export async function GET() {
  const user = await getManager();
  if (!user) return NextResponse.json({error:"Forbidden"},{status:403});
  const Theme = (db.orm.public as any).Theme;
  const themes = await Theme.all();
  const {url,key}=process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY?{url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY}:{url:null,key:null};
  const enriched=await Promise.all(themes.map(async (theme:any)=>{if(!theme.imagePath||!url||!key)return theme;const response=await fetch(url+"/storage/v1/object/sign/maze-themes/"+theme.imagePath,{method:"POST",headers:{Authorization:"Bearer "+key,apikey:key,"Content-Type":"application/json"},body:JSON.stringify({expiresIn:3600}),cache:"no-store"});if(!response.ok)return theme;const data=await response.json();return {...theme,imageUrl:data.signedURL?url+"/storage/v1"+data.signedURL:null};}));
  return NextResponse.json(enriched.sort((a:any,b:any)=>String(a.name).localeCompare(String(b.name))));
}

export async function POST(request:Request) {
  const user = await getManager();
  if (!user) return NextResponse.json({error:"Forbidden"},{status:403});
  const body = await request.json().catch(()=>null);
  const name = String(body?.name??"").trim();
  if (!name) return NextResponse.json({error:"La temática necesita un nombre."},{status:400});
  const slug = slugify(String(body?.slug??name));
  if (!slug) return NextResponse.json({error:"La temática necesita un identificador válido."},{status:400});
  const Theme = (db.orm.public as any).Theme;
  try {
    const theme = await Theme.create({
      name,
      slug,
      description:String(body?.description??"").trim()||null,
      active:body?.active!==false,
    });
    return NextResponse.json(theme,{status:201});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"No se pudo crear la temática."},{status:400});
  }
}
