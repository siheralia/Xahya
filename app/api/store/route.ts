import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calculateStorePrice, loadStorePromotions } from "@/lib/store-pricing";

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const Item = (db.orm.public as any).Item;
  const [items, promotions] = await Promise.all([
    Item.where({ acquisitionType: "PURCHASABLE" }).all(),
    loadStorePromotions(),
  ]);

  return NextResponse.json({
    items: items.filter((item: any) => String(item.itemType) !== "PROPERTY").map((item: any) => {
      const pricing = calculateStorePrice(item, promotions);
      return {
        id: Number(item.id),
        name: String(item.name),
        description: item.description == null ? null : String(item.description),
        itemType: String(item.itemType),
        itemSubtype: item.itemSubtype == null ? null : String(item.itemSubtype),
        acquisitionType: String(item.acquisitionType),
        basePrice: pricing.basePrice,
        price: pricing.price,
        appliedPromotions: pricing.appliedPromotions.map((promotion) => ({
          id: promotion.id,
          name: promotion.name,
          adjustmentType: promotion.adjustmentType,
          adjustmentValue: promotion.adjustmentValue,
        })),
        effects: Array.isArray(item.effects) ? item.effects : [],
        allowedSlots: Array.isArray(item.allowedSlots) ? item.allowedSlots : [],
      };
    }),
  });
}
