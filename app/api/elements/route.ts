import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export async function GET(){try{const row=await db.orm.public.AppSetting.where({key:"world.elements.v1"}).first();const parsed=row?.value?JSON.parse(String(row.value)):[];return NextResponse.json({elements:Array.isArray(parsed)?parsed:[]},{headers:{"Cache-Control":"no-store"}});}catch{return NextResponse.json({error:"No se pudieron cargar los elementos"},{status:500});}}
