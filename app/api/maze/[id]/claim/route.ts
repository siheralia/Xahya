import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

async function getUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id:string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  const mazeId = Number((await params).id);
  const body = await request.json().catch(() => null);
  const characterId = Number(body?.characterId);
  const roomId = Number(body?.roomId);
  const character = await db.orm.public.Character.where({ id:characterId }).first();
  if (!character) return NextResponse.json({ error:"Personaje no encontrado." }, { status:404 });
  const privileged = ["GM","ADMIN"].includes(String(user.role));
  if (!privileged && Number(character.userId) !== Number(user.id)) return NextResponse.json({ error:"Forbidden" }, { status:403 });

  const result = await db.transaction(async (tx) => {
    const Room = tx.orm.public.MazeRoom;
    const room = await Room.where({ id:roomId, mazeId }).first();
    if (!room) throw new Error("ROOM_NOT_FOUND");
    if (String(room.roomType) !== "TREASURE") throw new Error("NOT_TREASURE");
    if (Boolean(room.treasureClaimed)) throw new Error("CLAIMED");
    const Position = (tx.orm.public as any).MazeCharacterPosition;
    const position = await Position.where({ mazeId, characterId }).first();
    if (!position || Number(position.roomId) !== roomId) throw new Error("NOT_PRESENT");

    const rewards = typeof room.treasureRewards === "string" ? JSON.parse(room.treasureRewards) : (room.treasureRewards ?? {});
    const resources = await tx.orm.public.CharacterResource.where({ characterId }).first();
    if (!resources) throw new Error("RESOURCE_NOT_FOUND");
    const money = Number(rewards.money ?? 0);
    if (money) await tx.orm.public.CharacterResource.where({ id:resources.id }).update({ money:Number(resources.money)+money });

    if (Number(rewards.itemId) > 0) {
      const CharacterItem = (tx.orm.public as any).CharacterItem;
      const existing = await CharacterItem.where({ characterId, itemId:Number(rewards.itemId) }).all();
      const matching = existing.find((entry:any) => !Boolean(entry.equipped));
      if (matching) await CharacterItem.where({ id:Number(matching.id) }).update({ quantity:Number(matching.quantity)+Math.max(1,Number(rewards.quantity ?? 1)) });
      else await CharacterItem.create({ characterId, itemId:Number(rewards.itemId), quantity:Math.max(1,Number(rewards.quantity ?? 1)), equipped:false, equippedSlot:null, flair:null });
    }

    await Room.where({ id:roomId }).update({ treasureClaimed:true, status:"COMPLETED" });
    return { money, itemId:Number(rewards.itemId ?? 0), quantity:Math.max(0,Number(rewards.quantity ?? 0)) };
  }).catch((error) => ({ error:error instanceof Error ? error.message : "UNKNOWN" }));

  if ("error" in result) {
    const messages:Record<string,string> = { ROOM_NOT_FOUND:"Habitación no encontrada.", NOT_TREASURE:"Esta habitación no contiene un tesoro.", CLAIMED:"El tesoro ya fue reclamado.", NOT_PRESENT:"Tu personaje no está en esa habitación.", RESOURCE_NOT_FOUND:"El personaje no tiene recursos." };
    return NextResponse.json({ error:messages[result.error] ?? "No se pudo reclamar el tesoro." }, { status:400 });
  }

  await recordAuditEvent({ actorUserId:user.id, action:"MAZE_TREASURE_CLAIM", entityType:"MAZE_ROOM", entityId:roomId, characterId, details:{ mazeId, ...result } });
  return NextResponse.json(result);
}
