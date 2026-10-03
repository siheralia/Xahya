import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse("Unauthorized", { status: 401 });

  const result = await db.transaction(async (tx) => {
    const Maze = tx.orm.public.Maze;
    const Room = tx.orm.public.MazeRoom;
    const Encounter = (tx.orm.public as any).MazeRoomEnemy;
    const Exit = (tx.orm.public as any).MazeExit;

    const mazes = await Maze.where({ status: "ACTIVE" }).all();
    const allEncounters = await Encounter.all();
    const moved: Array<{ encounterId:number; mazeId:number; fromRoomId:number; toRoomId:number }> = [];
    let skipped = 0;

    for (const encounter of allEncounters.filter((entry:any) => Boolean(entry.isMobile) && String(entry.status) === "ACTIVE")) {
      const currentRoom = await Room.where({ id: Number(encounter.roomId) }).first();
      if (!currentRoom || !mazes.some((maze:any) => Number(maze.id) === Number(currentRoom.mazeId))) {
        skipped++;
        continue;
      }

      const exits = await Exit.where({ mazeId: Number(currentRoom.mazeId), fromRoomId: Number(currentRoom.id) }).all();
      const destinations = [];
      for (const exit of exits) {
        if (exit.toRoomId == null) continue;
        const destination = await Room.where({ id: Number(exit.toRoomId), mazeId: Number(currentRoom.mazeId) }).first();
        if (destination) destinations.push(destination);
      }

      if (destinations.length === 0) {
        skipped++;
        continue;
      }

      const destination = destinations[Math.floor(Math.random() * destinations.length)];
      const conflict = await Encounter.where({
        roomId: Number(destination.id),
        enemyId: Number(encounter.enemyId),
        isMobile: true,
      }).all();

      if (conflict.some((entry:any) => Number(entry.id) !== Number(encounter.id))) {
        skipped++;
        continue;
      }

      await Encounter.where({ id: Number(encounter.id) }).update({ roomId: Number(destination.id) });

      const remainingActive = await Encounter.where({ roomId: Number(currentRoom.id), status: "ACTIVE" }).all();
      if (remainingActive.length === 0 && ["ENEMY", "MOBILE_ENEMY", "BOSS"].includes(String(currentRoom.roomType))) {
        await Room.where({ id: Number(currentRoom.id) }).update({ status: "OPEN" });
      }

      await Room.where({ id: Number(destination.id) }).update({
        status: "BLOCKED",
        roomType: "MOBILE_ENEMY",
      });

      moved.push({
        encounterId: Number(encounter.id),
        mazeId: Number(currentRoom.mazeId),
        fromRoomId: Number(currentRoom.id),
        toRoomId: Number(destination.id),
      });
    }

    return { moved: moved.length, skipped, movements: moved };
  });

  return NextResponse.json({ ok: true, ...result });
}
