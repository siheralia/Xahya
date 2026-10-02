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

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  const user = await getManager();
  if (!user) return NextResponse.json({error:"Forbidden"},{status:403});
  const id = Number((await params).id);
  const Theme = (db.orm.public as any).Theme;
  const existing = await Theme.where({id}).first();
  if (!existing) return NextResponse.json({error:"Temática no encontrada."},{status:404});
  const body = await request.json().catch(()=>null);
  const updated = await Theme.where({id}).update({
    name:String(body?.name??existing.name).trim(),
    slug:slugify(String(body?.slug??existing.slug)),
    description:body?.description==null?existing.description:String(body.description).trim()||null,
    active:body?.active==null?Boolean(existing.active):Boolean(body.active),
  });
  return NextResponse.json(updated);
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}) {
  const user = await getManager();
  if (!user) return NextResponse.json({error:"Forbidden"},{status:403});
  const id = Number((await params).id);
  const Theme = (db.orm.public as any).Theme;
  const existing = await Theme.where({id}).first();
  if (!existing) return NextResponse.json({error:"Temática no encontrada."},{status:404});
  if (["GENERAL","TODAS"].includes(String(existing.slug))) return NextResponse.json({error:"Las temáticas General y Todas son del sistema y no se pueden borrar."},{status:400});
  await Theme.where({id}).delete();
  return NextResponse.json({success:true});
}
