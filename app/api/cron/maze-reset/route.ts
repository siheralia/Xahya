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
    const Position = (tx.orm.public as any).MazeCharacterPosition;
    const Exit = (tx.orm.public as any).MazeExit;

    const mazes = await Maze.where({ mazeType: "FINITE", resettable: true }).all();
    const reset = [];

    for (const maze of mazes) {
      const rooms = await Room.where({ mazeId: Number(maze.id) }).all();
      const roomIds = rooms.map((room:any) => Number(room.id));

      await Position.where({ mazeId: Number(maze.id) }).delete();
      if (roomIds.length > 0) {
        const encounters = await Encounter.all();
        for (const encounter of encounters.filter((entry:any) => roomIds.includes(Number(entry.roomId)))) {
          await Encounter.where({ id: Number(encounter.id) }).delete();
        }
      }
      await Exit.where({ mazeId: Number(maze.id) }).delete();

      const rootRoom = await Room.where({ mazeId: Number(maze.id), roomNumber: 1 }).first();
      const otherRooms = rooms.filter((room:any) => Number(room.roomNumber) !== 1);
      for (const room of otherRooms) {
        await Room.where({ id: Number(room.id) }).delete();
      }

      let root = rootRoom;
      if (!root) {
        root = await Room.create({
          mazeId: Number(maze.id),
          roomNumber: 1,
          roomType: "SAFE",
          status: "OPEN",
          description: "El ambiente es extrañamente tranquilo. Por primera vez no parece haber peligro.",
          contentName: null,
          contentDescription: null,
          treasureClaimed: false,
          treasureRewards: {},
          trapActive: false,
        });
      }
      if (root) {
        await Room.where({ id: Number(root.id) }).update({
          roomType: "SAFE",
          status: "OPEN",
          description: "El ambiente es extrañamente tranquilo. Por primera vez no parece haber peligro.",
          contentName: null,
          contentDescription: null,
          treasureClaimed: false,
          treasureRewards: {},
          trapActive: false,
        });
        root = await Room.where({ id: Number(root.id) }).first();
      }

      await Maze.where({ id: Number(maze.id) }).update({ status: "ACTIVE" });

      reset.push({
        mazeId: Number(maze.id),
        name: String(maze.name),
        removedRooms: otherRooms.length,
        hadRoot: Boolean(root),
      });
    }

    return { reset: reset.length, mazes: reset };
  });

  return NextResponse.json({ ok: true, ...result });
}
