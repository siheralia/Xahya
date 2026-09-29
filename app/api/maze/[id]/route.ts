import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { DIRECTION_LABELS, OPPOSITE_DIRECTION, pickRandomDirections, pickRoomType, pickWeighted, depthMultiplier, pickEnemyFocus, pickEnemyBehavior, scaleEnemyStats } from "@/lib/maze";

async function getUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

function roomDescription(type: string) {
  return ({
    ENEMY:"Una habitación desconocida. Algo se mueve entre las sombras.",
    TRAP:"El lugar parece tranquilo, pero hay señales de que algo no está bien.",
    BOSS:"La presencia que domina esta habitación hace imposible ignorar el peligro.",
    TREASURE:"Hay un objeto valioso en algún lugar de la habitación.",
    SAFE:"El ambiente es extrañamente tranquilo. Por primera vez no parece haber peligro.",
    DEATH:"La habitación transmite una sensación de peligro mortal.",
    MOBILE_ENEMY:"Hay señales recientes de una criatura que no permanece en un solo lugar.",
    NPC:"Alguien parece habitar esta habitación.",
  } as Record<string,string>)[type] ?? "Una habitación del laberinto.";
}



async function getGroupPower(tx: any, mazeId: number) {
  const positions = await (tx.orm.public as any).MazeCharacterPosition.where({ mazeId }).all();
  if (positions.length === 0) return 0;
  const stats = await Promise.all(positions.map(async (position: any) =>
    (tx.orm.public as any).CharacterStat.where({ characterId: Number(position.characterId) }).first()
  ));
  const totals = stats.map((stat:any) => stat
    ? ["strength","agility","constitution","intelligence","wisdom","charisma","spirit","luck"]
      .reduce((sum,key) => sum + Number(stat[key] ?? 0), 0)
    : 0
  );
  return totals.reduce((sum,n) => sum + n, 0) / totals.length;
}

async function scaleEncounter(tx: any, maze: any, room: any, encounter: any, enemy: any) {
  const groupPower = await getGroupPower(tx, Number(maze.id));
  if (groupPower <= 0 || !enemy) return;
  const isBoss = Boolean(enemy.isBoss) || String(enemy.rank) === "BOSS";
  const focus = String(encounter.focus || pickEnemyFocus(isBoss)) as any;
  const behavior = String(encounter.behavior || pickEnemyBehavior(isBoss));
  const scaled = scaleEnemyStats((enemy.stats ?? {}) as any, groupPower, Number(room.roomNumber), focus);
  await tx.orm.public.MazeRoomEnemy.where({ id: Number(encounter.id) }).update({
    generatedStats: scaled.stats,
    focus,
    behavior,
    targetPower: scaled.targetPower,
    depthMultiplier: depthMultiplier(Number(room.roomNumber)),
  });
  return { ...scaled, focus, behavior };
}

function hasActiveEnemies(room: any, enemies: any[]) {
  return enemies.some((enemy: any) => Number(enemy.roomId) === Number(room.id) && String(enemy.status) === "ACTIVE");
}

async function generateRoom(tx: any, maze: any, roomNumber: number, forceBoss = false) {
  let roomType = forceBoss ? "BOSS" : pickRoomType();
  if (maze.mazeType === "FINITE" && Number(maze.maxRooms) === roomNumber) roomType = "BOSS";

  let contentName: string | null = null;
  let contentDescription: string | null = null;
  let treasureRewards: any = {};

  const Enemy = (tx.orm.public as any).Enemy;
  const MazeRoomEnemy = (tx.orm.public as any).MazeRoomEnemy;

  if (roomType === "TREASURE") {
    const items = await tx.orm.public.Item.all();
    const item = items.length && Math.random() < 0.35 ? items[Math.floor(Math.random() * items.length)] : null;
    treasureRewards = { money: Math.floor(Math.random() * 901) + 100, itemId: item ? Number(item.id) : null, quantity: item ? 1 : 0 };
    contentName = "Tesoro";
    contentDescription = item ? `Un tesoro contiene dinero y ${item.name}.` : "Un tesoro contiene una cantidad de dinero.";
  }

  let selectedEnemy: any = null;
  if (roomType === "ENEMY" || roomType === "MOBILE_ENEMY" || roomType === "BOSS") {
    const allEnemies = Enemy ? await Enemy.where({ active:true }).all() : [];
    const candidates = roomType === "BOSS"
      ? allEnemies.filter((enemy:any) => Boolean(enemy.isBoss) || String(enemy.rank) === "BOSS")
      : allEnemies.filter((enemy:any) => !Boolean(enemy.isBoss));
    selectedEnemy = pickWeighted<any>(candidates as any[]);
    if (selectedEnemy) {
      contentName = selectedEnemy.name;
      contentDescription = selectedEnemy.description ?? "Una criatura desconocida.";
    }
  }

  const room = await tx.orm.public.MazeRoom.create({
    mazeId: maze.id, roomNumber, roomType,
    status: ["ENEMY","MOBILE_ENEMY","BOSS"].includes(roomType) ? "BLOCKED" : "OPEN",
    description: roomDescription(roomType), contentName, contentDescription,
    treasureClaimed:false, treasureRewards,
  });

  if ((roomType === "ENEMY" || roomType === "MOBILE_ENEMY" || roomType === "BOSS") && Enemy && MazeRoomEnemy) {
    if (selectedEnemy) {
      const encounter = await MazeRoomEnemy.create({ roomId: room.id, enemyId: selectedEnemy.id, quantity: roomType === "BOSS" ? 1 : Math.floor(Math.random()*3)+1, status:"ACTIVE", isMobile:roomType === "MOBILE_ENEMY", generatedStats:{}, focus:null, behavior:null, targetPower:null, depthMultiplier:null });
    } else {
      await tx.orm.public.MazeRoom.where({ id:room.id }).update({ status:"OPEN" });
    }
  }

  for (const direction of pickRandomDirections()) {
    await tx.orm.public.MazeExit.create({ mazeId:maze.id, fromRoomId:room.id, direction, toRoomId:null });
  }
  return await tx.orm.public.MazeRoom.where({ id:room.id }).first();
}

export async function GET(_request: Request, { params }: { params: Promise<{ id:string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  const mazeId = Number((await params).id);
  const maze = await db.orm.public.Maze.where({ id:mazeId }).first();
  if (!maze) return NextResponse.json({ error:"Laberinto no encontrado." }, { status:404 });
  const rooms = await db.orm.public.MazeRoom.where({ mazeId }).all();
  const exits = await (db.orm.public as any).MazeExit.where({ mazeId }).all();
  const enemies = await (db.orm.public as any).MazeRoomEnemy.all();
  const definitions = await (db.orm.public as any).Enemy.all();
  const characterId = Number(new URL(_request.url).searchParams.get("characterId"));
  const position = Number.isInteger(characterId) && characterId > 0
    ? await (db.orm.public as any).MazeCharacterPosition.where({ mazeId, characterId }).first()
    : null;
  return NextResponse.json({
    maze,
    position: position ? Number(position.roomId) : null,
    rooms: rooms.map((room:any) => ({
      ...room,
      treasureRewards: undefined,
      enemies: enemies.filter((enemy:any) => Number(enemy.roomId) === Number(room.id)).map((enemy:any) => ({
        ...enemy,
        enemy: definitions.find((definition:any) => Number(definition.id) === Number(enemy.enemyId)) ?? null,
      })),
    })),
    exits,
    directionLabels:DIRECTION_LABELS,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id:string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  const body = await request.json().catch(() => null);
  if (body?.action === "deleteMaze" || body?.action === "resetMaze") {
    if (String(user.role) !== "ADMIN") return NextResponse.json({ error:"Solo ADMIN puede borrar o resetear laberintos." }, { status:403 });
    const mazeId = Number((await params).id);
    const maze = await db.orm.public.Maze.where({ id:mazeId }).first();
    if (!maze) return NextResponse.json({ error:"Laberinto no encontrado." }, { status:404 });

    if (body.action === "deleteMaze") {
      await db.transaction(async (tx) => {
        await tx.orm.public.Maze.where({ id:mazeId }).delete();
      });
      await recordAuditEvent({
        actorUserId:user.id,
        action:"MAZE_DELETED",
        entityType:"MAZE",
        entityId:mazeId,
        details:{ name:maze.name, mazeType:maze.mazeType },
      });
      return NextResponse.json({ success:true, action:"deleteMaze" });
    }

    const result = await db.transaction(async (tx) => {
      await (tx.orm.public as any).MazeCharacterPosition.where({ mazeId }).delete();
      await (tx.orm.public as any).MazeExit.where({ mazeId }).delete();
      await tx.orm.public.MazeRoom.where({ mazeId }).delete();
      const freshMaze = await tx.orm.public.Maze.where({ id:mazeId }).update({
        status:"ACTIVE",
      });
      const room = await generateRoom(tx, freshMaze, 1);
      return { room };
    });

    await recordAuditEvent({
      actorUserId:user.id,
      action:"MAZE_RESET",
      entityType:"MAZE",
      entityId:mazeId,
      details:{ name:maze.name, mazeType:maze.mazeType },
    });
    return NextResponse.json({ success:true, action:"resetMaze", room:result.room });
  }

  if (body?.action === "reloadEnemies") {
    if (!["GM","ADMIN"].includes(String(user.role))) return NextResponse.json({ error:"Forbidden" }, { status:403 });
    const mazeId = Number((await params).id);
    const maze = await db.orm.public.Maze.where({ id:mazeId }).first();
    if (!maze) return NextResponse.json({ error:"Laberinto no encontrado." }, { status:404 });
    const Enemy = (db.orm.public as any).Enemy;
    const MazeRoomEnemy = (db.orm.public as any).MazeRoomEnemy;
    const Room = db.orm.public.MazeRoom;
    if (!Enemy || !MazeRoomEnemy) return NextResponse.json({ error:"El catálogo de enemigos no está disponible." }, { status:500 });
    const result = await db.transaction(async (tx) => {
      const rooms = await Room.where({ mazeId }).all();
      let loaded = 0;
      for (const room of rooms.filter((r:any) => ["ENEMY","MOBILE_ENEMY","BOSS"].includes(String(r.roomType)))) {
        const active = await MazeRoomEnemy.where({ roomId:room.id, status:"ACTIVE" }).all();
        if (active.length > 0) continue;
        const allEnemies = await Enemy.where({ active:true }).all();
        const candidates = String(room.roomType) === "BOSS"
          ? allEnemies.filter((enemy:any) => Boolean(enemy.isBoss) || String(enemy.rank) === "BOSS")
          : allEnemies.filter((enemy:any) => !Boolean(enemy.isBoss));
        const enemy:any = pickWeighted<any>(candidates as any[]);
        if (!enemy) continue;
        const encounter = await MazeRoomEnemy.create({ roomId:room.id, enemyId:enemy.id, quantity:String(room.roomType)==="BOSS"?1:Math.floor(Math.random()*3)+1, status:"ACTIVE", isMobile:String(room.roomType)==="MOBILE_ENEMY", generatedStats:{}, focus:null, behavior:null, targetPower:null, depthMultiplier:null });
        await Room.where({ id:room.id }).update({ status:"BLOCKED", contentName:enemy.name, contentDescription:enemy.description ?? "Una criatura desconocida." });
        await scaleEncounter(tx, maze, room, encounter, enemy);
        loaded++;
      }
      return { loaded };
    });
    return NextResponse.json(result);
  }

  const mazeId = Number((await params).id);
  const characterId = Number(body?.characterId);
  const direction = String(body?.direction ?? "");

  const Character = db.orm.public.Character;
  const character = await Character.where({ id:characterId }).first();
  const maze = await db.orm.public.Maze.where({ id:mazeId }).first();
  if (!character || !maze) return NextResponse.json({ error:"Personaje o laberinto no encontrado." }, { status:404 });

  const privileged = ["GM","ADMIN"].includes(String(user.role));
  if (!privileged && Number(character.userId) !== Number(user.id)) return NextResponse.json({ error:"Forbidden" }, { status:403 });
  if (!Object.prototype.hasOwnProperty.call(DIRECTION_LABELS, direction)) return NextResponse.json({ error:"Dirección inválida." }, { status:400 });
  if (String(maze.status) === "COMPLETED") return NextResponse.json({ error:"Este laberinto ya está completado." }, { status:400 });

  const Position = (db.orm.public as any).MazeCharacterPosition;
  const Room = db.orm.public.MazeRoom;
  const Exit = (db.orm.public as any).MazeExit;
  const MazeRoomEnemy = (db.orm.public as any).MazeRoomEnemy;

  const result = await db.transaction(async (tx) => {
    const position = await Position.where({ mazeId, characterId }).first();
    let currentRoom:any = position ? await Room.where({ id:Number(position.roomId) }).first() : await Room.where({ mazeId, roomNumber:1 }).first();
    if (!currentRoom) throw new Error("ROOT_NOT_FOUND");

    if (!position) {
      await Position.create({ mazeId, characterId, roomId:currentRoom.id });
    }

    const currentEncounters = MazeRoomEnemy ? await MazeRoomEnemy.where({ roomId:currentRoom.id, status:"ACTIVE" }).all() : [];
    if (currentEncounters.length > 0) {
      const definitions = await (tx.orm.public as any).Enemy.all();
      for (const encounter of currentEncounters) {
        const definition = definitions.find((enemy:any) => Number(enemy.id) === Number(encounter.enemyId));
        if (!encounter.generatedStats || Object.keys(encounter.generatedStats as any).length === 0) {
          await scaleEncounter(tx, maze, currentRoom, encounter, definition);
        }
      }
    }

    const activeEnemies = MazeRoomEnemy ? await MazeRoomEnemy.where({ roomId:currentRoom.id, status:"ACTIVE" }).all() : [];
    const requestedExit = await Exit.where({ fromRoomId:currentRoom.id, direction }).first();
    if (!requestedExit) throw new Error("EXIT_NOT_FOUND");

    if (activeEnemies.length > 0 && Number(requestedExit.toRoomId) !== Number(position?.previousRoomId ?? -1)) throw new Error("ROOM_BLOCKED");
    if (requestedExit.toRoomId != null) {
      const destination = await Room.where({ id:Number(requestedExit.toRoomId) }).first();
      if (!destination) throw new Error("DESTINATION_NOT_FOUND");
      await Position.where({ id:position?.id ?? (await Position.where({ mazeId, characterId }).first())?.id }).update({ roomId:destination.id, previousRoomId:currentRoom.id });
      const encounters = MazeRoomEnemy ? await MazeRoomEnemy.where({ roomId:destination.id, status:"ACTIVE" }).all() : [];
      if (encounters.length > 0) {
        const definitions = await (tx.orm.public as any).Enemy.all();
        for (const encounter of encounters) {
          const definition = definitions.find((enemy:any) => Number(enemy.id) === Number(encounter.enemyId));
          if (!encounter.generatedStats || Object.keys(encounter.generatedStats as any).length === 0) {
            await scaleEncounter(tx, maze, destination, encounter, definition);
          }
        }
      }
      return { room:destination, generated:false };
    }

    const roomCount = (await Room.where({ mazeId }).all()).length;
    if (String(maze.mazeType) === "FINITE" && roomCount >= Number(maze.maxRooms)) throw new Error("MAZE_LIMIT");
    const nextNumber = roomCount + 1;
    const destination = await generateRoom(tx, maze, nextNumber, String(maze.mazeType) === "FINITE" && nextNumber === Number(maze.maxRooms));

    await Exit.where({ id:requestedExit.id }).update({ toRoomId:destination.id });
    await Exit.create({ mazeId, fromRoomId:destination.id, direction:OPPOSITE_DIRECTION[direction as keyof typeof OPPOSITE_DIRECTION], toRoomId:currentRoom.id });

    const updatedPosition = await Position.where({ mazeId, characterId }).first();
    await Position.where({ id:updatedPosition.id }).update({ roomId:destination.id, previousRoomId:currentRoom.id });

    const destinationEncounters = MazeRoomEnemy ? await MazeRoomEnemy.where({ roomId:destination.id, status:"ACTIVE" }).all() : [];
    if (destinationEncounters.length > 0) {
      const definitions = await (tx.orm.public as any).Enemy.all();
      for (const encounter of destinationEncounters) {
        const definition = definitions.find((enemy:any) => Number(enemy.id) === Number(encounter.enemyId));
        await scaleEncounter(tx, maze, destination, encounter, definition);
      }
    }

    if (String(maze.mazeType) === "FINITE" && nextNumber === Number(maze.maxRooms)) {
      await tx.orm.public.Maze.where({ id:mazeId }).update({ status:"BOSS_ACTIVE" });
    }

    return { room:destination, generated:true };
  }).catch((error) => ({ error:error instanceof Error ? error.message : "UNKNOWN" }));

  if ("error" in result) {
    const messages:Record<string,string> = {
      ROOT_NOT_FOUND:"El laberinto no tiene habitación inicial.",
      EXIT_NOT_FOUND:"No existe esa salida desde la habitación actual.",
      ROOM_BLOCKED:"Hay enemigos activos. Solo puedes regresar por una salida ya descubierta.",
      DESTINATION_NOT_FOUND:"La habitación de destino no existe.",
      MAZE_LIMIT:"Este laberinto ya alcanzó su límite de habitaciones.",
    };
    return NextResponse.json({ error:messages[result.error] ?? "No se pudo avanzar." }, { status:400 });
  }

  await recordAuditEvent({
    actorUserId:user.id,
    action:"MAZE_EXPLORE",
    entityType:"MAZE_ROOM",
    entityId:result.room.id,
    characterId,
    details:{ mazeId, direction, generated:result.generated },
  });

  return NextResponse.json(result);
}
