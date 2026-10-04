import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Temporal } from "@js-temporal/polyfill";

async function getUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((candidate) => candidate.clerkId === clerkId) ?? null;
}

async function getOwnedBusiness(user: any, businessId: number) {
  const Business = (db.orm.public as any).Business;
  const Character = db.orm.public.Character;
  const business = await Business.where({ id: businessId }).first();
  if (!business) return { error: NextResponse.json({ error: "Negocio no encontrado." }, { status: 404 }) };
  const owner = await Character.where({ id: Number(business.ownerCharacterId) }).first();
  if (!owner || Number(owner.userId) !== Number(user.id)) return { error: NextResponse.json({ error: "Solo el dueño puede administrar este negocio." }, { status: 403 }) };
  return { business, owner };
}

function validTime(value: unknown) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) && Number(value.slice(0, 2)) <= 23 && Number(value.slice(3, 5)) <= 59;
}

const frequencies = ["DAILY", "WEEKLY"];
const investmentTypes = ["SECURITY", "GROWTH"];
const investmentSources = ["BUSINESS", "OWNER"];
const subscriptionUnits = ["DAY", "WEEK", "MONTH"];

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const Character = db.orm.public.Character;
  const Business = (db.orm.public as any).Business;
  const Position = (db.orm.public as any).BusinessPosition;
  const Contract = (db.orm.public as any).EmploymentContract;
  const Relationship = (db.orm.public as any).CharacterRelationship;
  const Product = (db.orm.public as any).BusinessProduct;
  const Plan = (db.orm.public as any).BusinessSubscriptionPlan;
  const Investment = (db.orm.public as any).BusinessInvestment;
  const Item = (db.orm.public as any).Item;
  const [characters, businesses, positions, contracts, relationships, products, plans, investments, items] = await Promise.all([Character.all(), Business.all(), Position.all(), Contract.all(), Relationship.all(), Product.all(), Plan.all(), Investment.all(), Item.all()]);
  const owned = characters.filter((character: any) => Number(character.userId) === Number(user.id));
  const ownedIds = new Set(owned.map((character: any) => Number(character.id)));
  const ownedBusinesses = businesses.filter((business: any) => ownedIds.has(Number(business.ownerCharacterId)));

  async function signedItemImage(path: unknown) {
    if (!path || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
    const response = await fetch(process.env.SUPABASE_URL + "/storage/v1/object/sign/item-images/" + String(path), { method:"POST", headers:{Authorization:"Bearer "+process.env.SUPABASE_SERVICE_ROLE_KEY,apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json"}, body:JSON.stringify({expiresIn:3600}), cache:"no-store" });
    if (!response.ok) return null;
    const data=await response.json().catch(()=>null);
    return data?.signedURL ? process.env.SUPABASE_URL+"/storage/v1"+data.signedURL : null;
  }
  const propertyItems = await Promise.all(items.filter((item:any)=>String(item.itemType)==="PROPERTY").map(async (item:any)=>({id:Number(item.id),name:String(item.name),description:item.description??null,propertyBusinessId:item.propertyBusinessId==null?null:Number(item.propertyBusinessId),imageUrl:await signedItemImage(item.imagePath)})));
  const candidatesByBusiness = new Map<number, { id: number; name: string; flair: string | null }[]>();
  for (const business of ownedBusinesses) {
    const ownerId = Number(business.ownerCharacterId);
    const knownIds = new Set(
      relationships
        .filter((row: any) => Number(row.characterId) === ownerId)
        .map((row: any) => Number(row.knownCharacterId))
    );
    candidatesByBusiness.set(
      Number(business.id),
      characters
        .filter((c: any) => knownIds.has(Number(c.id)) && Number(c.id) !== ownerId)
        .map((c: any) => ({ id: Number(c.id), name: String(c.name), flair: c.flair ?? null }))
    );
  }

  return NextResponse.json({
    propertyItems,
    businesses: ownedBusinesses.map((business: any) => ({
      id: Number(business.id), name: String(business.name), description: business.description ?? null,
      ownerCharacterId: Number(business.ownerCharacterId),
      ownerCharacter: owned.find((character: any) => Number(character.id) === Number(business.ownerCharacterId)) ?? null,
      passiveIncome: Number(business.passiveIncome ?? 0), passiveFrequency: String(business.passiveFrequency ?? "WEEKLY"), balance: Number(business.balance ?? 0),
      securityInvestment: Number(business.securityInvestment ?? 0), growthInvestment: Number(business.growthInvestment ?? 0),
      products: products.filter((p:any)=>Number(p.businessId)===Number(business.id)&&p.active).map((p:any)=>({id:Number(p.id),itemId:Number(p.itemId),purchasePrice:Number(p.purchasePrice),salePrice:Number(p.salePrice),stock:Number(p.stock),item:(()=>{const item=items.find((i:any)=>Number(i.id)===Number(p.itemId)); return item?{id:Number(item.id),name:String(item.name),description:item.description??null,itemType:String(item.itemType),imagePath:item.imagePath??null}:null;})()})),
      subscriptionPlans: plans.filter((p:any)=>Number(p.businessId)===Number(business.id)&&p.active).map((p:any)=>({id:Number(p.id),name:String(p.name),description:p.description??null,price:Number(p.price),intervalValue:Number(p.intervalValue),intervalUnit:String(p.intervalUnit)})),
      propertyItems: propertyItems.filter((item:any)=>item.propertyBusinessId===null || item.propertyBusinessId===Number(business.id)),
      investments: investments.filter((i:any)=>Number(i.businessId)===Number(business.id)).map((i:any)=>({id:Number(i.id),type:String(i.type),sourceType:String(i.sourceType),sourceCharacterId:i.sourceCharacterId==null?null:Number(i.sourceCharacterId),amount:Number(i.amount),frequency:String(i.frequency ?? "ONCE"),active:Boolean(i.active),createdAt:String(i.createdAt)})),
      positions: positions.filter((p: any) => Number(p.businessId) === Number(business.id) && p.active).map((p: any) => ({
        id: Number(p.id), title: String(p.title), description: p.description ?? null, startTime: String(p.startTime), endTime: String(p.endTime),
        salary: Number(p.salary), salaryFrequency: String(p.salaryFrequency), salaryDayOfWeek: Number(p.salaryDayOfWeek ?? 0),
        payerType: String(p.payerType ?? "SYSTEM"), payerCharacterId: p.payerCharacterId == null ? null : Number(p.payerCharacterId),
        contracts: contracts.filter((c: any) => Number(c.positionId) === Number(p.id) && c.active).map((c: any) => ({ id: Number(c.id), character: characters.find((ch: any) => Number(ch.id) === Number(c.characterId)) ?? null })),
      })),
      candidates: candidatesByBusiness.get(Number(business.id)) ?? [],
    })),
  });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const action = String(body?.action ?? "");
  const Business = (db.orm.public as any).Business;
  const Position = (db.orm.public as any).BusinessPosition;
  const Contract = (db.orm.public as any).EmploymentContract;
  const Character = db.orm.public.Character;
  const Relationship = (db.orm.public as any).CharacterRelationship;

  if (["invest","stockProperty","createPlan","updatePlan","deletePlan"].includes(action)) {
    const businessId = Number(body?.businessId);
    const owned = await getOwnedBusiness(user, businessId);
    if (owned.error) return owned.error;
    const business = owned.business;
    const Investment = (db.orm.public as any).BusinessInvestment;
    const Product = (db.orm.public as any).BusinessProduct;
    const Plan = (db.orm.public as any).BusinessSubscriptionPlan;
    const Resource = db.orm.public.CharacterResource;
    if (action === "oneTimeInvest" || action === "scheduleInvestment" || action === "cancelInvestment") {
      const Investment = (db.orm.public as any).BusinessInvestment;
      const Resource = db.orm.public.CharacterResource;

      if (action === "cancelInvestment") {
        const investmentId = Number(body?.investmentId);
        const investment = await Investment.where({ id: investmentId }).first();
        if (!investment || Number(investment.businessId) !== businessId || String(investment.frequency) !== "WEEKLY") {
          return NextResponse.json({ error: "Reinversión no encontrada." }, { status: 404 });
        }
        await Investment.where({ id: investmentId }).update({ active: false });
        return NextResponse.json({ success: true });
      }

      const type = String(body?.type ?? "");
      const amount = Math.trunc(Number(body?.amount ?? 0));
      if (!investmentTypes.includes(type) || amount <= 0) {
        return NextResponse.json({ error: "Inversión inválida." }, { status: 400 });
      }

      if (action === "scheduleInvestment") {
        const investment = await Investment.create({
          businessId,
          type,
          sourceType: "BUSINESS",
          sourceCharacterId: null,
          amount,
          frequency: "WEEKLY",
          active: true,
        });
        return NextResponse.json({ success: true, investment });
      }

      const ownerResource = await Resource.where({ characterId: Number(owned.owner.id) }).first();
      if (!ownerResource || Number(ownerResource.money) < amount) {
        return NextResponse.json({ error: "El dueño no tiene suficiente dinero." }, { status: 400 });
      }

      const field = type === "SECURITY" ? "securityInvestment" : "growthInvestment";
      await db.transaction(async (tx) => {
        const R = tx.orm.public.CharacterResource;
        const B = (tx.orm.public as any).Business;
        const I = (tx.orm.public as any).BusinessInvestment;
        const ownerR = await R.where({ characterId: Number(owned.owner.id) }).first();
        const currentB = await B.where({ id: businessId }).first();
        if (!ownerR || !currentB) throw new Error("No se encontraron los recursos del dueño o el negocio.");
        await R.where({ id: ownerR.id }).update({ money: Number(ownerR.money) - amount });
        await B.where({ id: businessId }).update({ [field]: Number(currentB[field] ?? 0) + amount });
        await I.create({
          businessId,
          type,
          sourceType: "OWNER",
          sourceCharacterId: Number(owned.owner.id),
          amount,
          frequency: "ONCE",
          active: false,
        });
      });
      return NextResponse.json({ success: true });
    }
    if (action === "stockProperty") {
      const itemId = Number(body?.itemId); const quantity = Math.trunc(Number(body?.quantity ?? 0)); const purchasePrice = Math.trunc(Number(body?.purchasePrice ?? 0)); const salePrice = Math.trunc(Number(body?.salePrice ?? 0));
      if (!Number.isInteger(itemId) || quantity <= 0 || purchasePrice < 0 || salePrice < 0 || salePrice < purchasePrice) return NextResponse.json({ error: "Datos de propiedad inválidos." }, { status: 400 });
      const Item = (db.orm.public as any).Item; const item = await Item.where({ id: itemId }).first();
      if (!item || String(item.itemType) !== "PROPERTY") return NextResponse.json({ error: "Solo puedes vender objetos de tipo Propiedad." }, { status: 400 });
      if (item.propertyBusinessId != null && Number(item.propertyBusinessId) !== businessId) return NextResponse.json({ error: "Esta propiedad está reservada para otro negocio." }, { status: 403 });
      const total = purchasePrice * quantity;
      const current = await Business.where({ id: businessId }).first();
      if (Number(current.balance ?? 0) < total) return NextResponse.json({ error: "El negocio no tiene suficiente dinero para comprar ese inventario." }, { status: 400 });
      await db.transaction(async (tx) => {
        const B=(tx.orm.public as any).Business; const P=(tx.orm.public as any).BusinessProduct; const currentB=await B.where({id:businessId}).first();
        const existing=await P.where({businessId,itemId}).first();
        await B.where({id:businessId}).update({balance:Number(currentB.balance)-total});
        if(existing) await P.where({id:existing.id}).update({purchasePrice,salePrice,stock:Number(existing.stock)+quantity,active:true});
        else await P.create({businessId,itemId,purchasePrice,salePrice,stock:quantity,active:true});
      });
      return NextResponse.json({ success: true });
    }
    const planId = Number(body?.planId);
    if (action === "deletePlan") {
      if (!Number.isInteger(planId) || planId <= 0) return NextResponse.json({ error: "Plan inválido." }, { status: 400 });
      const plan = await Plan.where({ id: planId }).first();
      if (!plan || Number(plan.businessId) !== businessId) return NextResponse.json({ error: "Plan no encontrado." }, { status: 404 });
      await Plan.where({ id: planId }).update({ active: false });
      return NextResponse.json({ success: true });
    }
    const name = String(body?.name ?? "").trim(); const description = typeof body?.description === "string" ? body.description.trim() || null : null;
    const price = Math.trunc(Number(body?.price ?? 0)); const intervalValue = Math.trunc(Number(body?.intervalValue ?? 1)); const intervalUnit = String(body?.intervalUnit ?? "MONTH");
    if (!name || name.length > 100 || price < 0 || intervalValue <= 0 || !subscriptionUnits.includes(intervalUnit)) return NextResponse.json({ error: "Plan de suscripción inválido." }, { status: 400 });
    if (action === "createPlan") {
      const plan = await Plan.create({ businessId, name, description, price, intervalValue, intervalUnit, active: true });
      return NextResponse.json({ plan }, { status: 201 });
    }
    const plan = await Plan.where({ id: planId }).first();
    if (!plan || Number(plan.businessId) !== businessId) return NextResponse.json({ error: "Plan no encontrado." }, { status: 404 });
    const updated = await Plan.where({ id: planId }).update({ name, description, price, intervalValue, intervalUnit });
    return NextResponse.json({ plan: updated });
  }

  if (action === "createPosition" || action === "updatePosition") {
    const businessId = Number(body?.businessId);
    if (!Number.isInteger(businessId) || businessId <= 0) return NextResponse.json({ error: "Negocio inválido." }, { status: 400 });
    const owned = await getOwnedBusiness(user, businessId);
    if (owned.error) return owned.error;

    const title = String(body?.title ?? "").trim();
    const startTime = String(body?.startTime ?? "");
    const endTime = String(body?.endTime ?? "");
    const salary = Math.trunc(Number(body?.salary ?? 0));
    const salaryFrequency = String(body?.salaryFrequency ?? "DAILY");
    const salaryDayOfWeek = Math.trunc(Number(body?.salaryDayOfWeek ?? 0));
    const payerType = String(body?.payerType ?? "SYSTEM");
    const payerCharacterId = payerType === "CHARACTER" ? Number(body?.payerCharacterId) : null;

    if (!title || title.length > 100 || !validTime(startTime) || !validTime(endTime) || salary < 0 || !frequencies.includes(salaryFrequency)) return NextResponse.json({ error: "Datos del puesto inválidos." }, { status: 400 });
    if (!["SYSTEM", "CHARACTER"].includes(payerType)) return NextResponse.json({ error: "Pagador inválido." }, { status: 400 });
    if (salaryFrequency === "WEEKLY" && (salaryDayOfWeek < 0 || salaryDayOfWeek > 6)) return NextResponse.json({ error: "Día de pago inválido." }, { status: 400 });

    if (payerType === "CHARACTER") {
      const payer = await Character.where({ id: payerCharacterId }).first();
      if (!payer) return NextResponse.json({ error: "El personaje pagador no existe." }, { status: 404 });
      if (Number(payer.id) !== Number(owned.owner.id)) {
        const known = await Relationship.where({ characterId: Number(owned.owner.id), knownCharacterId: payerCharacterId }).first();
        if (!known) return NextResponse.json({ error: "Solo puedes elegir como pagador al dueño o a un personaje que conozca." }, { status: 403 });
      }
    }

    if (action === "createPosition") {
      const position = await Position.create({ businessId, title, description: typeof body?.description === "string" ? body.description.trim() || null : null, startTime, endTime, salary, salaryFrequency, salaryDayOfWeek, payerType, payerCharacterId, active: true });
      return NextResponse.json({ position }, { status: 201 });
    }

    const positionId = Number(body?.positionId);
    const position = await Position.where({ id: positionId }).first();
    if (!position || Number(position.businessId) !== businessId) return NextResponse.json({ error: "El puesto no pertenece a este negocio." }, { status: 403 });
    const updated = await Position.where({ id: positionId }).update({ title, description: typeof body?.description === "string" ? body.description.trim() || null : null, startTime, endTime, salary, salaryFrequency, salaryDayOfWeek, payerType, payerCharacterId });
    return NextResponse.json({ position: updated });
  }

  if (action !== "hire" && action !== "fire") return NextResponse.json({ error: "Acción inválida." }, { status: 400 });

  const businessId = Number(body?.businessId);
  const owned = await getOwnedBusiness(user, businessId);
  if (owned.error) return owned.error;
  const business = owned.business;

  if (action === "hire") {
    const positionId = Number(body?.positionId);
    const characterId = Number(body?.characterId);
    const position = await Position.where({ id: positionId }).first();
    const character = await Character.where({ id: characterId }).first();
    if (!position || Number(position.businessId) !== businessId) return NextResponse.json({ error: "La plaza no pertenece a este negocio." }, { status: 400 });
    if (!position.active) return NextResponse.json({ error: "Esta plaza no está activa." }, { status: 400 });
    if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });
    const known = await Relationship.where({ characterId: Number(owned.owner.id), knownCharacterId: characterId }).first();
    if (!known) return NextResponse.json({ error: "Solo puedes contratar personajes que tu dueño conoce." }, { status: 403 });
    const current = (await Contract.where({ positionId }).all()).find((contract: any) => contract.active);
    if (current) return NextResponse.json({ error: "Ese turno ya tiene una persona contratada." }, { status: 400 });
    const characterEmployment = (await Contract.where({ characterId }).all()).find((contract: any) => contract.active);
    if (characterEmployment) return NextResponse.json({ error: "Ese personaje ya tiene un empleo activo." }, { status: 400 });
    const contract = await Contract.create({ positionId, characterId, startDate: Temporal.Instant.fromEpochMilliseconds(Date.now()), endDate: null, active: true });
    return NextResponse.json({ contract }, { status: 201 });
  }

  const contractId = Number(body?.contractId);
  const contract = await Contract.where({ id: contractId }).first();
  if (!contract) return NextResponse.json({ error: "Contrato no encontrado." }, { status: 404 });
  const position = await Position.where({ id: Number(contract.positionId) }).first();
  if (!position || Number(position.businessId) !== businessId) return NextResponse.json({ error: "Ese contrato no pertenece a este negocio." }, { status: 403 });
  await Contract.where({ id: contractId }).update({ active: false, endDate: Temporal.Instant.fromEpochMilliseconds(Date.now()) });
  return NextResponse.json({ success: true });
}
