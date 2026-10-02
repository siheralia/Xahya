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
  return NextResponse.json(themes.sort((a:any,b:any)=>String(a.name).localeCompare(String(b.name))));
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
