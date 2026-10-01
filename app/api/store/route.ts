import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const Item = (db.orm.public as any).Item;
  const items = await Item.where({ acquisitionType: "PURCHASABLE" }).all();
  return NextResponse.json({ items: items.map((item: any) => ({
    id: Number(item.id), name: String(item.name),
    description: item.description == null ? null : String(item.description),
    itemType: String(item.itemType), itemSubtype: item.itemSubtype == null ? null : String(item.itemSubtype), acquisitionType: String(item.acquisitionType), price: Number(item.price),
    effects: Array.isArray(item.effects) ? item.effects : [],
  })) });
}
