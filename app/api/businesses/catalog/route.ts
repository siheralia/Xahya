import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

async function user() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((u) => u.clerkId === clerkId) ?? null;
}

async function imageUrl(path: unknown) {
  if (!path || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const r = await fetch(
    process.env.SUPABASE_URL + "/storage/v1/object/sign/item-images/" + String(path),
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 3600 }),
      cache: "no-store",
    },
  );
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  return d?.signedURL ? process.env.SUPABASE_URL + "/storage/v1" + d.signedURL : null;
}

export async function GET() {
  const current = await user();
  if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const Business = (db.orm.public as any).Business;
  const Product = (db.orm.public as any).BusinessProduct;
  const Plan = (db.orm.public as any).BusinessSubscriptionPlan;
  const Item = (db.orm.public as any).Item;
  const Subscription = (db.orm.public as any).BusinessSubscription;
  const Character = db.orm.public.Character;

  const [businesses, products, plans, items, characters, subscriptions] = await Promise.all([
    Business.all(),
    Product.all(),
    Plan.all(),
    Item.all(),
    Character.all(),
    Subscription.all(),
  ]);

  const myCharacters = characters.filter((c: any) => Number(c.userId) === Number(current.id));
  const myCharacterIds = new Set(myCharacters.map((c: any) => Number(c.id)));
  const myActiveSubscriptions = subscriptions
    .filter((s: any) => s.active && myCharacterIds.has(Number(s.characterId)))
    .map((s: any) => {
      const plan = plans.find((p: any) => Number(p.id) === Number(s.planId));
      const business = plan ? businesses.find((b: any) => Number(b.id) === Number(plan.businessId)) : null;
      const character = myCharacters.find((c: any) => Number(c.id) === Number(s.characterId));
      return {
        id: Number(s.id),
        characterId: Number(s.characterId),
        characterName: character?.name ?? "Personaje",
        planId: Number(s.planId),
        planName: plan?.name ?? "Suscripción",
        businessName: business?.name ?? "Negocio",
        price: plan ? Number(plan.price) : 0,
        intervalValue: plan ? Number(plan.intervalValue) : 0,
        intervalUnit: plan ? String(plan.intervalUnit) : "",
        nextChargeAt: s.nextChargeAt == null ? null : String(s.nextChargeAt),
      };
    });

  const activeBusinesses = businesses.filter((b: any) => b.active);

  const catalogBusinesses = await Promise.all(
    activeBusinesses.map(async (b: any) => {
      const businessId = Number(b.id);

      const businessProducts = products.filter(
        (p: any) =>
          Number(p.businessId) === businessId &&
          p.active &&
          Number(p.stock) > 0,
      );

      const visibleProducts = (
        await Promise.all(
          businessProducts.map(async (p: any) => {
            const item = items.find((i: any) => Number(i.id) === Number(p.itemId));
            if (
              item &&
              item.propertyBusinessId != null &&
              Number(item.propertyBusinessId) !== businessId
            ) {
              return null;
            }

            return {
              id: Number(p.id),
              itemId: Number(p.itemId),
              purchasePrice: Number(p.purchasePrice),
              salePrice: Number(p.salePrice),
              stock: Number(p.stock),
              item: item
                ? {
                    id: Number(item.id),
                    name: String(item.name),
                    description: item.description ?? null,
                    imageUrl: await imageUrl(item.imagePath),
                  }
                : null,
            };
          }),
        )
      ).filter(Boolean);

      return {
        id: businessId,
        name: String(b.name),
        description: b.description ?? null,
        ownerCharacterId: Number(b.ownerCharacterId),
        products: visibleProducts,
        subscriptionPlans: plans
          .filter(
            (p: any) =>
              Number(p.businessId) === businessId && p.active,
          )
          .map((p: any) => ({
            id: Number(p.id),
            name: String(p.name),
            description: p.description ?? null,
            price: Number(p.price),
            intervalValue: Number(p.intervalValue),
            intervalUnit: String(p.intervalUnit),
          })),
      };
    }),
  );

  return NextResponse.json({ businesses: catalogBusinesses, subscriptions: myActiveSubscriptions });
}
