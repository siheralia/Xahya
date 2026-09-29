import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

async function getAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  return user && String(user.role) === "ADMIN" ? user : null;
}

export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const characterId = Number(body?.characterId);
  const perkId = Number(body?.perkId);
  if (!Number.isInteger(characterId) || !Number.isInteger(perkId)) return NextResponse.json({ error: "Personaje o perk inválido." }, { status: 400 });
  const Character = db.orm.public.Character;
  const character = await Character.where({ id: characterId }).first();
  const Perk = (db.orm.public as any).Perk;
  const CharacterPerk = (db.orm.public as any).CharacterPerk;
  const perk = await Perk.where({ id: perkId }).first();
  if (!character || !perk) return NextResponse.json({ error: "Personaje o perk no encontrado." }, { status: 404 });
  const existing = await CharacterPerk.where({ characterId, perkId }).all();
  if (!Boolean(perk.stackable) && existing.length >= Number(perk.maxStacks ?? 1)) return NextResponse.json({ error: "Este perk no puede acumularse más en este personaje." }, { status: 409 });
  if (perk.maxStacks != null && existing.length >= Number(perk.maxStacks)) return NextResponse.json({ error: "Este personaje alcanzó el máximo de este perk." }, { status: 409 });
  const entry = await CharacterPerk.create({ characterId, perkId, source: "MANUAL" });
  const effects = Array.isArray(perk.effects) ? perk.effects : [];
  const bonuses = effects.filter((effect:any) => String(effect.type) === "RESOURCE_BONUS").reduce((out:any,effect:any) => {
    const target=String(effect.target??""); const value=Number(effect.value??0);
    if(target==="KARMA") out.karma+=value;
    if(target==="MONEY") out.money+=value;
    if(target==="LEVEL_UP_POINTS") out.levelUpPoints+=value;
    return out;
  },{karma:0,money:0,levelUpPoints:0});
  if (bonuses.karma || bonuses.money || bonuses.levelUpPoints) {
    const resource = await db.orm.public.CharacterResource.where({ characterId }).first();
    if (resource) await db.orm.public.CharacterResource.where({ characterId }).update({
      karma:Number(resource.karma)+bonuses.karma, money:Number(resource.money)+bonuses.money, levelUpPoints:Number(resource.levelUpPoints)+bonuses.levelUpPoints,
    });
  }
  await recordAuditEvent({ actorUserId:admin.id, action:"PERK_GRANTED", entityType:"PERK", entityId:perkId, characterId, details:{ perkId, perkName:perk.name, source:"MANUAL" } });
  return NextResponse.json({ success:true, entry });
}
