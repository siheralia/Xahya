import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { pickRandomDirections, pickRoomType, pickWeighted } from "@/lib/maze";

async function getUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

function roomDescription(type: string) {
  const descriptions: Record<string, string> = {
    ENEMY:"Una habitación desconocida. Algo se mueve entre las sombras.",
    TRAP:"El lugar parece tranquilo, pero hay señales de que algo no está bien.",
    BOSS:"La presencia que domina esta habitación hace imposible ignorar el peligro.",
    TREASURE:"Hay un objeto valioso en algún lugar de la habitación.",
    SAFE:"El ambiente es extrañamente tranquilo. Por primera vez no parece haber peligro.",
    DEATH:"La habitación transmite una sensación de peligro mortal.",
    MOBILE_ENEMY:"Hay señales recientes de una criatura que no permanece en un solo lugar.",
    NPC:"Alguien parece habitar esta habitación.",
  };
  return descriptions[type] ?? "Una habitación del laberinto.";
}

async function createRoom(tx: any, maze: any, roomNumber: number, forcedType?: string) {
  let type = forcedType ?? pickRoomType();
  if (maze.mazeType === "FINITE" && maze.maxRooms === roomNumber) type = "BOSS";

  let contentName: string | null = null;
  let contentDescription: string | null = null;
  let treasureRewards: any = {};

  if (type === "TREASURE") {
    const items = await tx.orm.public.Item.all();
    const item = items.length && Math.random() < 0.35 ? items[Math.floor(Math.random() * items.length)] : null;
    treasureRewards = {
      money: Math.floor(Math.random() * 901) + 100,
      itemId: item ? Number(item.id) : null,
      quantity: item ? 1 : 0,
    };
    contentName = "Tesoro";
    contentDescription = item
      ? `Un tesoro contiene dinero y ${item.name}.`
      : "Un tesoro contiene una cantidad de dinero.";
  }

  if (type === "ENEMY" || type === "MOBILE_ENEMY" || type === "BOSS") {
    const Enemy = (tx.orm.public as any).Enemy;
    const enemies = Enemy ? await Enemy.where({ active: true }).all() : [];
    const candidates = type === "BOSS"
      ? enemies.filter((enemy: any) => Boolean(enemy.isBoss) || String(enemy.rank) === "BOSS")
      : enemies.filter((enemy: any) => !Boolean(enemy.isBoss));
    const enemy: any = pickWeighted<any>(candidates as any[]);
    if (enemy) {
      contentName = enemy.name;
      contentDescription = enemy.description ?? "Una criatura desconocida.";
    } else {
      contentName = type === "BOSS" ? "Jefe sin definir" : "Enemigo sin definir";
      contentDescription = "No hay todavía una criatura configurada en el catálogo.";
    }
  }

  const room = await tx.orm.public.MazeRoom.create({
    mazeId: maze.id,
    roomNumber,
    roomType: type,
    status: ["ENEMY","MOBILE_ENEMY","BOSS"].includes(type) ? "BLOCKED" : "OPEN",
    description: roomDescription(type),
    contentName,
    contentDescription,
    treasureClaimed: false,
    treasureRewards,
  });

  if (type === "ENEMY" || type === "MOBILE_ENEMY" || type === "BOSS") {
    const Enemy = (tx.orm.public as any).Enemy;
    if (Enemy) {
      const enemies = await Enemy.where({ active: true }).all();
      const candidates = type === "BOSS"
        ? enemies.filter((enemy: any) => Boolean(enemy.isBoss) || String(enemy.rank) === "BOSS")
        : enemies.filter((enemy: any) => !Boolean(enemy.isBoss));
      const enemy: any = pickWeighted<any>(candidates as any[]);
      if (enemy) {
        const MazeRoomEnemy = (tx.orm.public as any).MazeRoomEnemy;
        await MazeRoomEnemy.create({
          roomId: room.id,
          enemyId: enemy.id,
          quantity: type === "BOSS" ? 1 : Math.floor(Math.random() * 3) + 1,
          status: "ACTIVE",
          isMobile: type === "MOBILE_ENEMY",
        });
      } else if (type !== "BOSS") {
        await tx.orm.public.MazeRoom.where({ id: room.id }).update({ status: "OPEN" });
      }
    }
  }

  return room;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const mazes = await db.orm.public.Maze.all();
  const rooms = await db.orm.public.MazeRoom.all();
  return NextResponse.json(mazes.map((maze: any) => ({
    ...maze,
    roomCount: rooms.filter((room: any) => Number(room.mazeId) === Number(maze.id)).length,
  })));
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user || !["GM","ADMIN"].includes(String(user.role))) return NextResponse.json({ error: "Solo GM y ADMIN pueden crear laberintos." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const description = String(body?.description ?? "").trim() || null;
  const mazeType = body?.mazeType === "FINITE" ? "FINITE" : "INFINITE";
  const maxRooms = mazeType === "FINITE" ? Number(body?.maxRooms) : null;

  if (!name) return NextResponse.json({ error: "El laberinto necesita un nombre." }, { status: 400 });
  if (mazeType === "FINITE" && (!Number.isInteger(maxRooms) || maxRooms < 2)) return NextResponse.json({ error: "Un laberinto finito necesita al menos 2 habitaciones." }, { status: 400 });

  const result = await db.transaction(async (tx) => {
    const maze = await tx.orm.public.Maze.create({ name, description, mazeType, maxRooms, status:"ACTIVE" });
    const room = await createRoom(tx, maze, 1);
    for (const direction of pickRandomDirections()) {
      await tx.orm.public.MazeExit.create({ mazeId: maze.id, fromRoomId: room.id, direction, toRoomId: null });
    }
    return { maze, room };
  });

  await recordAuditEvent({
    actorUserId: user.id,
    action: "MAZE_CREATED",
    entityType: "MAZE",
    entityId: result.maze.id,
    details: { name, mazeType, maxRooms },
  });

  return NextResponse.json(result, { status: 201 });
}
