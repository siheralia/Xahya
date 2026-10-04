export async function moveMobileEnemies(tx: any, mazeId?: number) {
  const Maze = tx.orm.public.Maze;
  const Room = tx.orm.public.MazeRoom;
  const Encounter = (tx.orm.public as any).MazeRoomEnemy;
  const Exit = (tx.orm.public as any).MazeExit;

  if (!Encounter || !Exit) return { moved: 0, skipped: 0, movements: [] };

  const mazes = mazeId != null
    ? await Maze.where({ id: Number(mazeId), status: "ACTIVE" }).all()
    : await Maze.where({ status: "ACTIVE" }).all();
  const allowedMazeIds = new Set(mazes.map((maze: any) => Number(maze.id)));
  const allEncounters = await Encounter.all();
  const moved: Array<{ encounterId:number; mazeId:number; fromRoomId:number; toRoomId:number }> = [];
  let skipped = 0;

  for (const encounter of allEncounters.filter((entry:any) =>
    Boolean(entry.isMobile) && String(entry.status) === "ACTIVE"
  )) {
    const currentRoom = await Room.where({ id: Number(encounter.roomId) }).first();
    if (!currentRoom || !allowedMazeIds.has(Number(currentRoom.mazeId))) {
      skipped++;
      continue;
    }

    const exits = await Exit.where({
      mazeId: Number(currentRoom.mazeId),
      fromRoomId: Number(currentRoom.id),
    }).all();

    const destinations: any[] = [];
    for (const exit of exits) {
      if (exit.toRoomId == null) continue;
      const destination = await Room.where({
        id: Number(exit.toRoomId),
        mazeId: Number(currentRoom.mazeId),
      }).first();
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

    await Encounter.where({ id: Number(encounter.id) }).update({
      roomId: Number(destination.id),
    });

    const remainingActive = await Encounter.where({
      roomId: Number(currentRoom.id),
      status: "ACTIVE",
    }).all();

    if (
      remainingActive.length === 0 &&
      ["ENEMY", "MOBILE_ENEMY", "BOSS"].includes(String(currentRoom.roomType))
    ) {
      await Room.where({ id: Number(currentRoom.id) }).update({ status: "OPEN" });
    }

    await Room.where({ id: Number(destination.id) }).update({ status: "BLOCKED" });

    moved.push({
      encounterId: Number(encounter.id),
      mazeId: Number(currentRoom.mazeId),
      fromRoomId: Number(currentRoom.id),
      toRoomId: Number(destination.id),
    });
  }

  return { moved: moved.length, skipped, movements: moved };
}
