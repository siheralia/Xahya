import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { DIRECTION_LABELS, OPPOSITE_DIRECTION, pickRandomDirections, pickRoomType, pickWeighted, depthMultiplier, pickEnemyFocus, pickEnemyBehavior, scaleEnemyStats, enemyMatchesMazeThemes, registerMazeEncounterRelationships } from "@/lib/maze";
import { applyDerivedItemEffects, calculateDerivedStats } from "@/lib/stats/derived";
import { getDefaultEnemyImageUrl, getEnemyImagePaths, getEnemyImageUrl } from "@/lib/enemy-image";

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




async function getMazeThemeSlugs(tx:any, mazeId:number) {
  const MazeTheme=(tx.orm.public as any).MazeTheme;
  const Theme=(tx.orm.public as any).Theme;
  if(!MazeTheme||!Theme) return [];
  const links=await MazeTheme.where({mazeId}).all();
  const themes=await Theme.all();
  return links.map((link:any)=>themes.find((theme:any)=>Number(theme.id)===Number(link.themeId))?.slug).filter(Boolean);
}

async function getCharacterLuck(tx: any, characterId: number) {
  const stat = await (tx.orm.public as any).CharacterStat.where({ characterId }).first();
  return Math.max(0, Number(stat?.luck ?? 0));
}

const STAT_KEYS = ["strength","agility","constitution","intelligence","wisdom","charisma","spirit","luck"] as const;
const STAT_CODES: Record<(typeof STAT_KEYS)[number], string> = {
  strength:"STR", agility:"AGI", constitution:"CON", intelligence:"INT",
  wisdom:"WIS", charisma:"CHA", spirit:"SPI", luck:"LCK",
};

async function getEffectiveCombatStats(tx: any, characterId: number) {
  const stats = await (tx.orm.public as any).CharacterStat.where({ characterId }).first();
  if (!stats) return null;
  const modifiers = await (tx.orm.public as any).CharacterModifier.where({ characterId }).all();
  const now = Date.now();
  const activeModifiers = modifiers.filter((modifier:any) =>
    !modifier.expiresAt || new Date(String(modifier.expiresAt)).getTime() > now
  );
  const CharacterItem = (tx.orm.public as any).CharacterItem;
  const Item = (tx.orm.public as any).Item;
  const ownedItems = CharacterItem ? await CharacterItem.where({ characterId }).all() : [];
  const itemDefinitions = Item ? await Item.all() : [];
  const equippedEffects = ownedItems
    .filter((owned:any) => Boolean(owned.equipped))
    .flatMap((owned:any) => {
      const item = itemDefinitions.find((candidate:any) => Number(candidate.id) === Number(owned.itemId));
      return (Array.isArray(item?.effects) ? item.effects : []).map((effect:any) => ({
        type:String(effect.type), stat:String(effect.stat ?? ""), value:Number(effect.value),
      }));
    });

  const effectiveStats = Object.fromEntries(STAT_KEYS.map((key) => {
    const base = Number(stats[key] ?? 0);
    const flat = activeModifiers.filter((m:any) => String(m.stat) === key && String(m.source) !== "KARMA_BOOST")
      .reduce((sum:number,m:any) => sum + Number(m.amount),0);
    const karma = activeModifiers.filter((m:any) => String(m.stat) === key && String(m.source) === "KARMA_BOOST")
      .reduce((sum:number,m:any) => sum + Number(m.amount),0);
    const multiplier = activeModifiers.filter((m:any) => String(m.stat) === key + "_multiplier")
      .reduce((sum:number,m:any) => sum + Number(m.amount) / 100,0);
    const itemBonus = equippedEffects.filter((e:any) => e.type === "stat_bonus" && e.stat === STAT_CODES[key])
      .reduce((sum:number,e:any) => sum + Number(e.value),0);
    const itemMultiplier = equippedEffects.filter((e:any) => e.type === "stat_multiplier" && e.stat === STAT_CODES[key])
      .reduce((sum:number,e:any) => sum + Number(e.value) / 100,0);
    return [key, base * (1 + multiplier + itemMultiplier) + flat + itemBonus + karma];
  })) as Record<(typeof STAT_KEYS)[number], number>;

  let derived = calculateDerivedStats(effectiveStats);
  derived = applyDerivedItemEffects(
    derived,
    equippedEffects.filter((e:any) => e.type === "stat_bonus" || e.type === "stat_multiplier"),
  );
  const attackMultiplier = 1 + equippedEffects
    .filter((e:any) => e.type === "stat_multiplier" && e.stat === "ATTACK_TOTAL")
    .reduce((sum:number,e:any) => sum + Number(e.value) / 100, 0);
  derived.physicalAttack *= attackMultiplier;
  derived.magicAttack *= attackMultiplier;

  return { effectiveStats, derived };
}

function normalizeEnemyStats(enemyStats:any) {
  return {
    strength:Number(enemyStats?.strength ?? enemyStats?.STR ?? 0),
    agility:Number(enemyStats?.agility ?? enemyStats?.AGI ?? 0),
    constitution:Number(enemyStats?.constitution ?? enemyStats?.CON ?? 0),
    intelligence:Number(enemyStats?.intelligence ?? enemyStats?.INT ?? 0),
    wisdom:Number(enemyStats?.wisdom ?? enemyStats?.WIS ?? 0),
    charisma:Number(enemyStats?.charisma ?? enemyStats?.CHA ?? 0),
    spirit:Number(enemyStats?.spirit ?? enemyStats?.SPI ?? 0),
    luck:Number(enemyStats?.luck ?? enemyStats?.LCK ?? 0),
  };
}

function normalizedLoot(enemy:any) {
  const raw = Array.isArray(enemy?.loot) ? enemy.loot : [];
  return raw.flatMap((entry:any) => {
    if (!entry || typeof entry !== "object") return [];
    const type = String(entry.type ?? entry.kind ?? "").toLowerCase();
    const amount = Number(entry.amount ?? entry.quantity ?? entry.value ?? 0);
    if (["money","coins","gold"].includes(type) && amount > 0) {
      const min = Number(entry.min ?? entry.minimum ?? amount);
      const max = Number(entry.max ?? entry.maximum ?? amount);
      const low = Math.min(min, max, amount);
      const high = Math.max(min, max, amount);
      const rolledAmount = high > low ? Math.floor(Math.random() * (high - low + 1)) + low : amount;
      return [{ type:"money", amount:rolledAmount }];
    }
    if (type === "karma" && amount > 0) return [{ type:"karma", amount }];
    if (["item","equipment","consumable"].includes(type)) {
      const itemId = Number(entry.itemId ?? entry.item_id ?? entry.id);
      const quantity = Number(entry.quantity ?? entry.amount ?? 1);
      if (Number.isInteger(itemId) && itemId > 0 && quantity > 0) return [{ type:"item", itemId, quantity }];
    }
    return [];
  });
}

function splitAmount(total:number, count:number, index:number) {
  const base = Math.floor(total / count);
  return base + (index < total % count ? 1 : 0);
}

function canAutoDefeat(combat:any, enemyStats:any, quantity:number) {
  if (!combat || !enemyStats) return false;
  const enemyDerived = calculateDerivedStats(normalizeEnemyStats(enemyStats));
  const physicalDamageCheck = Number(combat.derived.physicalAttack) > Number(enemyDerived.physicalDefense);
  const magicDamageCheck = Number(combat.derived.magicAttack) > Number(enemyDerived.magicDefense);
  return quantity > 0 && (physicalDamageCheck || magicDamageCheck);
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

async function generateRoom(tx: any, maze: any, roomNumber: number, forceBoss = false, reservedDirection?: string, luck = 0) {
  const disabledTypes = [
    !Boolean(maze.allowTraps) ? "TRAP" : null,
    !Boolean(maze.allowDeath) ? "DEATH" : null,
    !Boolean(maze.allowTreasures) ? "TREASURE" : null,
  ].filter(Boolean) as string[];
  let roomType = forceBoss ? "BOSS" : pickRoomType(luck, disabledTypes);
  if (maze.mazeType === "FINITE" && Number(maze.maxRooms) === roomNumber) roomType = "BOSS";

  let contentName: string | null = null;
  let contentDescription: string | null = null;
  let treasureRewards: any = {};

  const Enemy = (tx.orm.public as any).Enemy;
  const MazeRoomEnemy = (tx.orm.public as any).MazeRoomEnemy;

  if (roomType === "TREASURE") {
    const items = await tx.orm.public.Item.all();
    const normalizedLuck = Math.max(0, Number(luck) || 0);
    const itemChance = Math.min(0.75, 0.35 + normalizedLuck * 0.004);
    const item = items.length && Math.random() < itemChance ? items[Math.floor(Math.random() * items.length)] : null;
    const baseMoney = (Math.floor(Math.random() * 901) + 100) * 10;
    const moneyMultiplier = 1 + Math.min(1, normalizedLuck / 100);
    const money = Math.round(baseMoney * moneyMultiplier);
    treasureRewards = { money, itemId: item ? Number(item.id) : null, quantity: item ? 1 : 0 };
    contentName = "Tesoro";
    contentDescription = item ? `Contiene ${money.toLocaleString("es-MX")} monedas y 1× ${item.name}.` : `Contiene ${money.toLocaleString("es-MX")} monedas.`;
  }

  let selectedEnemy: any = null;
  if (roomType === "ENEMY" || roomType === "MOBILE_ENEMY" || roomType === "BOSS") {
    const allEnemies = Enemy ? await Enemy.where({ active:true }).all() : [];
    const mazeThemes = await getMazeThemeSlugs(tx, Number(maze.id));
    const EnemyTheme=(tx.orm.public as any).EnemyTheme;
    const Theme=(tx.orm.public as any).Theme;
    const links=EnemyTheme?await EnemyTheme.all():[];
    const themes=Theme?await Theme.all():[];
    const candidates = (roomType === "BOSS"
      ? allEnemies.filter((enemy:any) => Boolean(enemy.isBoss) || String(enemy.rank) === "BOSS")
      : allEnemies.filter((enemy:any) => !Boolean(enemy.isBoss)))
      .filter((enemy:any)=>enemyMatchesMazeThemes(mazeThemes,links.filter((link:any)=>Number(link.enemyId)===Number(enemy.id)).map((link:any)=>themes.find((theme:any)=>Number(theme.id)===Number(link.themeId))?.slug)));
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

  const generationMode = String(maze.generationMode ?? "FREE_3D");
  const directions = pickRandomDirections(
    generationMode === "LINEAR" || generationMode === "SPIRAL_TOWER" ? 1 : 2,
    generationMode as any,
    roomNumber,
  );
  // La salida de regreso se crea por separado al conectar la nueva habitación.
  // Evitamos generar la misma dirección aquí para no provocar una colisión de
  // unicidad cuando la salida de regreso ya tenga que ocupar ese espacio.
  const availableDirections = reservedDirection
    ? directions.filter((direction) => direction !== reservedDirection)
    : directions;
  for (const direction of availableDirections) {
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

  // Compatibilidad con laberintos creados antes de las opciones de contenido:
  // null conserva el comportamiento histórico (todo permitido).
  const MazeTheme=(db.orm.public as any).MazeTheme;
  const Theme=(db.orm.public as any).Theme;
  const themeLinks=MazeTheme?await MazeTheme.where({mazeId}).all():[];
  const themeRows=Theme?await Theme.all():[];
  const mazeThemes=themeLinks.map((link:any)=>themeRows.find((theme:any)=>Number(theme.id)===Number(link.themeId))).filter(Boolean);

  const themeImages=await Promise.all(mazeThemes.map(async(theme:any)=>{if(!theme.imagePath||!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return theme;const response=await fetch(process.env.SUPABASE_URL+"/storage/v1/object/sign/maze-themes/"+theme.imagePath,{method:"POST",headers:{Authorization:"Bearer "+process.env.SUPABASE_SERVICE_ROLE_KEY,apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json"},body:JSON.stringify({expiresIn:3600}),cache:"no-store"});if(!response.ok)return theme;const data=await response.json();return {...theme,imageUrl:data.signedURL?process.env.SUPABASE_URL+"/storage/v1"+data.signedURL:null};}));

  const normalizedMaze = {
    ...maze,
    themeIds:themeImages.map((theme:any)=>Number(theme.id)),
    themes:themeImages,
    allowTraps: maze.allowTraps == null ? true : Boolean(maze.allowTraps),
    allowDeath: maze.allowDeath == null ? true : Boolean(maze.allowDeath),
    allowTreasures: maze.allowTreasures == null ? true : Boolean(maze.allowTreasures),
  };

  // Repara los registros antiguos al cargarlos para que no vuelvan a quedar en null.
  if (maze.allowTraps == null || maze.allowDeath == null || maze.allowTreasures == null) {
    await (db.orm.public as any).Maze.where({ id:mazeId }).update({
      allowTraps: normalizedMaze.allowTraps,
      allowDeath: normalizedMaze.allowDeath,
      allowTreasures: normalizedMaze.allowTreasures,
    });
  }

  const characterId = Number(new URL(_request.url).searchParams.get("characterId"));
  if (Number.isInteger(characterId) && characterId > 0) {
    const character = await db.orm.public.Character.where({ id: characterId }).first();
    const privileged = ["GM","ADMIN"].includes(String(user.role));
    if (!character || (!privileged && Number(character.userId) !== Number(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  const position = Number.isInteger(characterId) && characterId > 0
    ? await (db.orm.public as any).MazeCharacterPosition.where({ mazeId, characterId }).first()
    : null;

  const rooms = await db.orm.public.MazeRoom.where({ mazeId }).all();
  const exits = await (db.orm.public as any).MazeExit.where({ mazeId }).all();
  const currentExits = position
    ? await (db.orm.public as any).MazeExit.where({ mazeId, fromRoomId:Number(position.roomId) }).all()
    : [];
  const enemies = await (db.orm.public as any).MazeRoomEnemy.all();
  const definitions = await (db.orm.public as any).Enemy.all();
  const imagePaths = await getEnemyImagePaths(definitions.map((enemy:any)=>Number(enemy.id)));
  const defaultEnemyImageUrl = await getDefaultEnemyImageUrl();
  const definitionsWithImages = await Promise.all(definitions.map(async (enemy:any) => ({ ...enemy, imageUrl: await getEnemyImageUrl(imagePaths.get(Number(enemy.id))) })));

  let trapActions: Array<{ characterItemId:number; name:string; quantity:number; action:string }> = [];
  if (position) {
    const CharacterItem = (db.orm.public as any).CharacterItem;
    const Item = (db.orm.public as any).Item;
    if (CharacterItem && Item) {
      const ownedItems = await CharacterItem.where({ characterId }).all();
      const itemDefinitions = await Item.all();
      trapActions = ownedItems.flatMap((owned:any) => {
        const item = itemDefinitions.find((candidate:any) => Number(candidate.id) === Number(owned.itemId));
        if (!item || String(item.itemType) !== "CONSUMABLE") return [];
        const effects = Array.isArray(item.effects) ? item.effects : [];
        return effects
          .filter((effect:any) => effect?.type === "system_action" && ["DISARM_MAZE_TRAP", "RELEASE_MAZE_TRAPPED"].includes(String(effect.action)))
          .map((effect:any) => ({
            characterItemId: Number(owned.id),
            name: String(item.name),
            quantity: Number(owned.quantity ?? 0),
            action: String(effect.action),
          }));
      }).filter((entry:any) => entry.quantity > 0);
    }
  }

  // Los encuentros creados antes de escalar estadísticas pueden tener generatedStats vacío.
  // Escalarlos aquí garantiza que defensa mágica/física y el botón de derrota tengan datos.
  const activeMazeEnemies = enemies.filter((enemy:any) => String(enemy.status) === "ACTIVE");
  for (const encounter of activeMazeEnemies) {
    if (!encounter.generatedStats || Object.keys(encounter.generatedStats as any).length === 0) {
      const room = rooms.find((entry:any) => Number(entry.id) === Number(encounter.roomId));
      const definition = definitions.find((entry:any) => Number(entry.id) === Number(encounter.enemyId));
      if (room && definition) {
        await scaleEncounter(db, maze, room, encounter, definition);
        encounter.generatedStats = (await (db.orm.public as any).MazeRoomEnemy.where({ id:Number(encounter.id) }).first())?.generatedStats ?? {};
      }
    }
  }

  const characterCombat = Number.isInteger(characterId) && characterId > 0
    ? await getEffectiveCombatStats(db, characterId)
    : null;
  const positions = await (db.orm.public as any).MazeCharacterPosition.where({ mazeId }).all();
  const characters = await db.orm.public.Character.all();
  const occupants = await Promise.all(positions.map(async (entry:any) => {
    const character = characters.find((candidate:any) => Number(candidate.id) === Number(entry.characterId));
    if (!character) return null;
    let avatarUrl: string | null = null;
    const avatarPath = (character as any).avatarPath ? String((character as any).avatarPath) : null;
    if (avatarPath && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const signedResponse = await fetch(
        process.env.SUPABASE_URL + "/storage/v1/object/sign/character-avatars/" + avatarPath,
        {
          method:"POST",
          headers:{
            Authorization:"Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
            apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type":"application/json",
          },
          body:JSON.stringify({ expiresIn:3600 }),
          cache:"no-store",
        },
      );
      if (signedResponse.ok) {
        const signed = await signedResponse.json();
        avatarUrl = signed.signedURL ? process.env.SUPABASE_URL + "/storage/v1" + signed.signedURL : null;
      }
    }
    return {
      id: Number(character.id),
      name: String(character.name),
      flair: character.flair ?? null,
      avatarUrl,
      roomId: Number(entry.roomId),
      status: String(entry.status ?? "ACTIVE"),
      lockReason: entry.lockReason ?? null,
    };
  })).then((entries:any[]) => entries.filter(Boolean));
  return NextResponse.json({
    maze: normalizedMaze,
    position: position ? Number(position.roomId) : null,
    previousRoomId: position?.previousRoomId == null ? null : Number(position.previousRoomId),
    positionStatus: position ? String(position.status ?? "ACTIVE") : null,
    positionLockReason: position?.lockReason ?? null,
    rooms: rooms.map((room:any) => ({
      ...room,
      treasureRewards: undefined,
      enemies: enemies.filter((enemy:any) => Number(enemy.roomId) === Number(room.id)).map((enemy:any) => {
        const definition = definitionsWithImages.find((entry:any) => Number(entry.id) === Number(enemy.enemyId)) ?? null;
        const opponentPower = Number(enemy.targetPower ?? 0) * Math.max(1, Number(enemy.quantity ?? 1));
        const enemyStats = (enemy.generatedStats ?? {}) as any;
        const enemyDerived = calculateDerivedStats(normalizeEnemyStats(enemyStats));
        return {
          ...enemy,
          enemy: definition ? { ...definition, imageUrl: definition.imageUrl ?? defaultEnemyImageUrl } : null,
          characterPower: characterCombat ? Object.values(characterCombat.effectiveStats).reduce((sum:number,value:any)=>sum+Number(value),0) : 0,
          opponentPower,
          combatStats: characterCombat?.derived ?? null,
          opponentDerived: enemyDerived,
          canAutoDefeat: String(enemy.status) === "ACTIVE" && canAutoDefeat(characterCombat, enemyStats, Number(enemy.quantity ?? 1)),
        };
      }),
    })),
    exits,
    currentExits,
    occupants,
    trapActions,
    directionLabels:DIRECTION_LABELS,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id:string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  const body = await request.json().catch(() => null);

  if (body?.action === "defeatEnemy") {
    const mazeId = Number((await params).id);
    const characterId = Number(body?.characterId);
    const enemyInstanceId = Number(body?.enemyId);
    const character = await db.orm.public.Character.where({ id:characterId }).first();
    const maze = await db.orm.public.Maze.where({ id:mazeId }).first();
    if (!character || !maze) return NextResponse.json({ error:"Personaje o laberinto no encontrado." }, { status:404 });
    const privileged = ["GM","ADMIN"].includes(String(user.role));
    if (!privileged && Number(character.userId) !== Number(user.id)) return NextResponse.json({ error:"Forbidden" }, { status:403 });

    const result = await db.transaction(async (tx) => {
      const Position = (tx.orm.public as any).MazeCharacterPosition;
      const Encounter = (tx.orm.public as any).MazeRoomEnemy;
      const position = await Position.where({ mazeId, characterId }).first();
      if (!position) throw new Error("NOT_IN_MAZE");
      const room = await tx.orm.public.MazeRoom.where({ id:Number(position.roomId), mazeId }).first();
      if (!room) throw new Error("ROOM_NOT_FOUND");
      const encounter = await Encounter.where({ id:enemyInstanceId, roomId:Number(room.id) }).first();
      if (!encounter || String(encounter.status) !== "ACTIVE") throw new Error("ENEMY_NOT_ACTIVE");

      const combat = await getEffectiveCombatStats(tx, characterId);
      const characterPower = combat ? Object.values(combat.effectiveStats).reduce((sum:number,value:any)=>sum+Number(value),0) : 0;
      const enemyStats = (encounter.generatedStats ?? {}) as any;
      const opponentPower = Number(encounter.targetPower ?? 0) * Math.max(1, Number(encounter.quantity ?? 1));
      if (!canAutoDefeat(combat, enemyStats, Number(encounter.quantity ?? 1))) throw new Error("NOT_STRONG_ENOUGH");

      await Encounter.where({ id:Number(encounter.id) }).update({ status:"DEFEATED" });

      const activeEnemies = await Encounter.where({ roomId:Number(room.id), status:"ACTIVE" }).all();
      // La derrota automática entrega el loot únicamente al personaje que la ejecutó.
      // El reparto entre participantes solo ocurre mediante la confirmación de Gestión.
      const definitions = await (tx.orm.public as any).Enemy.all();
      const defeatedDefinition = definitions.find((enemy:any) => Number(enemy.id) === Number(encounter.enemyId));
      const totals = { money:0, karma:0, items:new Map<number,number>() };

      for (const loot of normalizedLoot(defeatedDefinition)) {
        const multiplier = Math.max(1, Number(encounter.quantity) || 1);
        if (loot.type === "money") totals.money += loot.amount * multiplier;
        else if (loot.type === "karma") totals.karma += loot.amount * multiplier;
        else totals.items.set(loot.itemId, (totals.items.get(loot.itemId) ?? 0) + loot.quantity * multiplier);
      }

      const CharacterResource = (tx.orm.public as any).CharacterResource;
      const CharacterItem = (tx.orm.public as any).CharacterItem;
      const money = totals.money;
      const karma = totals.karma;
      if (money > 0 || karma > 0) {
        const resources = await CharacterResource.where({ characterId }).first();
        if (resources) await CharacterResource.where({ id:Number(resources.id) }).update({
          money:Number(resources.money ?? 0) + money,
          karma:Number(resources.karma ?? 0) + karma,
        });
        else await CharacterResource.create({ characterId, money, karma });
      }

      const items:any[] = [];
      for (const [itemId,total] of totals.items.entries()) {
        if (total <= 0) continue;
        const existing = CharacterItem ? await CharacterItem.where({ characterId, itemId }).first() : null;
        if (existing) await CharacterItem.where({ id:Number(existing.id) }).update({ quantity:Number(existing.quantity ?? 0) + total });
        else if (CharacterItem) await CharacterItem.create({ characterId, itemId, quantity:total, equipped:false, equippedSlot:null });
        items.push({ itemId, quantity:total });
      }
      const rewards:any[] = [{ characterId, name:String(character.name), money, karma, items }];

      const roomCleared = activeEnemies.length === 0;
      if (roomCleared) {
        await tx.orm.public.MazeRoom.where({ id:Number(room.id) }).update({ status:"CLEARED" });
        if (String(room.roomType)==="BOSS") {
          await tx.orm.public.Maze.where({ id:mazeId }).update({ status:"COMPLETED" });
        }
      }

      return {
        success:true,
        money:rewards.find((reward:any) => Number(reward.characterId) === characterId)?.money ?? 0,
        karma:rewards.find((reward:any) => Number(reward.characterId) === characterId)?.karma ?? 0,
        rewards,
        characterPower,
        opponentPower,
        physicalAttack:combat?.derived.physicalAttack ?? 0,
        magicAttack:combat?.derived.magicAttack ?? 0,
        roomCleared,
        enemiesRemaining:activeEnemies.length,
        rewardsPendingConfirmation:false,
      };
    }).catch((error) => ({ error:error instanceof Error ? error.message : "UNKNOWN" }));

    if ("error" in result) {
      const messages:Record<string,string> = {
        NOT_IN_MAZE:"El personaje no está dentro de este laberinto.",
        ROOM_NOT_FOUND:"Habitación no encontrada.",
        ENEMY_NOT_ACTIVE:"Ese enemigo ya fue derrotado.",
        NOT_STRONG_ENOUGH:"El ataque físico o mágico del personaje no supera la defensa correspondiente del oponente.",
      };
      return NextResponse.json({ error:messages[result.error] ?? "No se pudo derrotar al enemigo." }, { status:400 });
    }

    await recordAuditEvent({
      actorUserId:user.id,
      action:"MAZE_ENEMY_AUTO_DEFEATED",
      entityType:"MAZE_ROOM_ENEMY",
      entityId:enemyInstanceId,
      characterId,
      details:{ mazeId, money:result.money, karma:result.karma, rewards:result.rewards, characterPower:result.characterPower, opponentPower:result.opponentPower, physicalAttack:result.physicalAttack, magicAttack:result.magicAttack, roomCleared:result.roomCleared },
    });
    return NextResponse.json(result);
  }

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

    try {
      const result = await db.transaction(async (tx) => {
        await (tx.orm.public as any).MazeCharacterPosition.where({ mazeId }).delete();
        const mazeRooms = await tx.orm.public.MazeRoom.where({ mazeId }).all();
        const roomIds = mazeRooms.map((room:any) => Number(room.id));
        if (roomIds.length > 0) {
          const encounters = await (tx.orm.public as any).MazeRoomEnemy.all();
          for (const encounter of encounters.filter((entry:any) => roomIds.includes(Number(entry.roomId)))) {
            await (tx.orm.public as any).MazeRoomEnemy.where({ id:Number(encounter.id) }).delete();
          }
        }
        // Conservamos la habitación 1 en lugar de borrarla y volver a crearla.
        // Así evitamos conflictos con la restricción única (mazeId, roomNumber)
        // si el ORM mantiene la fila durante la transacción.
        await (tx.orm.public as any).MazeExit.where({ mazeId }).delete();

        const rootRoom = await tx.orm.public.MazeRoom.where({ mazeId, roomNumber:1 }).first();
        const otherRooms = (await tx.orm.public.MazeRoom.where({ mazeId }).all())
          .filter((room:any) => Number(room.roomNumber) !== 1);

        for (const room of otherRooms) {
          await tx.orm.public.MazeRoom.where({ id:Number(room.id) }).delete();
        }

        await tx.orm.public.Maze.where({ id:mazeId }).update({ status:"ACTIVE" });

        let room:any;
        if (rootRoom) {
          await tx.orm.public.MazeRoom.where({ id:Number(rootRoom.id) }).update({
            roomType:"SAFE",
            status:"OPEN",
            description:roomDescription("SAFE"),
            contentName:null,
            contentDescription:null,
            treasureClaimed:false,
            treasureRewards:{},
            trapActive:false,
          });
          room = await tx.orm.public.MazeRoom.where({ id:Number(rootRoom.id) }).first();
        } else {
          room = await generateRoom(tx, maze, 1);
        }

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
    } catch (error) {
      console.error("[MAZE_RESET_ERROR]", error);
      return NextResponse.json({
        error: error instanceof Error ? error.message : "No se pudo resetear el laberinto.",
      }, { status:500 });
    }
  }

  if (body?.action === "releasePlayer" || body?.action === "deactivateTrap") {
    if (!["GM","ADMIN"].includes(String(user.role))) return NextResponse.json({ error:"Solo GM o ADMIN puede liberar jugadores o desactivar trampas." }, { status:403 });
    const mazeId = Number((await params).id);
    const roomId = Number(body?.roomId);
    const characterId = Number(body?.characterId);
    const maze = await db.orm.public.Maze.where({ id:mazeId }).first();
    const room = await db.orm.public.MazeRoom.where({ id:roomId, mazeId }).first();
    if (!maze || !room) return NextResponse.json({ error:"Laberinto o habitación no encontrados." }, { status:404 });

    if (body.action === "releasePlayer") {
      const position = await (db.orm.public as any).MazeCharacterPosition.where({ mazeId, characterId }).first();
      if (!position || Number(position.roomId) !== roomId) return NextResponse.json({ error:"Ese personaje no está atrapado en esta habitación." }, { status:400 });
      await (db.orm.public as any).MazeCharacterPosition.where({ id:Number(position.id) }).update({ status:"ACTIVE", lockReason:null });
      await recordAuditEvent({ actorUserId:user.id, action:"MAZE_RELEASE_PLAYER", entityType:"MAZE_ROOM", entityId:roomId, characterId, details:{ mazeId, roomId } });
      return NextResponse.json({ success:true, action:"releasePlayer" });
    }

    if (String(room.roomType) !== "TRAP") return NextResponse.json({ error:"Solo las trampas pueden desactivarse." }, { status:400 });
    await db.transaction(async (tx) => {
      await tx.orm.public.MazeRoom.where({ id:roomId }).update({ trapActive:false, status:"CLEARED" });
      const positions = await (tx.orm.public as any).MazeCharacterPosition.where({ mazeId, roomId }).all();
      for (const position of positions) {
        if (String(position.status) === "TRAPPED") {
          await (tx.orm.public as any).MazeCharacterPosition.where({ id:Number(position.id) }).update({ status:"ACTIVE", lockReason:null });
        }
      }
    });
    await recordAuditEvent({ actorUserId:user.id, action:"MAZE_DEACTIVATE_TRAP", entityType:"MAZE_ROOM", entityId:roomId, details:{ mazeId, roomId } });
    return NextResponse.json({ success:true, action:"deactivateTrap" });
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
      const TxRoom = tx.orm.public.MazeRoom;
      const TxMazeRoomEnemy = (tx.orm.public as any).MazeRoomEnemy;
      const rooms = await TxRoom.where({ mazeId }).all();
      let loaded = 0;
      for (const room of rooms.filter((r:any) => ["ENEMY","MOBILE_ENEMY","BOSS"].includes(String(r.roomType)))) {
        const active = await TxMazeRoomEnemy.where({ roomId:room.id, status:"ACTIVE" }).all();
        if (active.length > 0) continue;
        const allEnemies = await Enemy.where({ active:true }).all();
        const mazeThemes = await getMazeThemeSlugs(tx, Number(maze.id));
        const EnemyTheme=(tx.orm.public as any).EnemyTheme;
        const Theme=(tx.orm.public as any).Theme;
        const links=EnemyTheme?await EnemyTheme.all():[];
        const themes=Theme?await Theme.all():[];
        const candidates = (String(room.roomType) === "BOSS"
          ? allEnemies.filter((enemy:any) => Boolean(enemy.isBoss) || String(enemy.rank) === "BOSS")
          : allEnemies.filter((enemy:any) => !Boolean(enemy.isBoss)))
          .filter((enemy:any)=>enemyMatchesMazeThemes(mazeThemes,links.filter((link:any)=>Number(link.enemyId)===Number(enemy.id)).map((link:any)=>themes.find((theme:any)=>Number(theme.id)===Number(link.themeId))?.slug)));
        const enemy:any = pickWeighted<any>(candidates as any[]);
        if (!enemy) continue;
        const encounter = await MazeRoomEnemy.create({ roomId:room.id, enemyId:enemy.id, quantity:String(room.roomType)==="BOSS"?1:Math.floor(Math.random()*3)+1, status:"ACTIVE", isMobile:String(room.roomType)==="MOBILE_ENEMY", generatedStats:{}, focus:null, behavior:null, targetPower:null, depthMultiplier:null });
        await TxRoom.where({ id:room.id }).update({ status:"BLOCKED", contentName:enemy.name, contentDescription:enemy.description ?? "Una criatura desconocida." });
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

  // Salir del laberinto no es un movimiento: no requiere ni dirección ni una MazeExit.
  if (body?.action === "leave") {
    const Position = (db.orm.public as any).MazeCharacterPosition;
    const position = await Position.where({ mazeId, characterId }).first();
    if (!position) return NextResponse.json({ error:"El personaje no está dentro de este laberinto." }, { status:400 });
    const root = await db.orm.public.MazeRoom.where({ id:Number(position.roomId), mazeId }).first();
    if (!root || Number(root.roomNumber) !== 1) return NextResponse.json({ error:"Solo puedes salir del laberinto desde la habitación 1." }, { status:400 });
    await Position.where({ id:Number(position.id) }).delete();
    await recordAuditEvent({ actorUserId:user.id, action:"MAZE_LEAVE", entityType:"MAZE", entityId:mazeId, characterId, details:{ mazeId } });
    return NextResponse.json({ success:true });
  }

  if (!Object.prototype.hasOwnProperty.call(DIRECTION_LABELS, direction)) return NextResponse.json({ error:"Dirección inválida." }, { status:400 });
  if (String(maze.status) === "COMPLETED") return NextResponse.json({ error:"Este laberinto ya está completado." }, { status:400 });

  const existingPosition = await (db.orm.public as any).MazeCharacterPosition.where({ mazeId, characterId }).first();
  if (existingPosition && String(existingPosition.status ?? "ACTIVE") !== "ACTIVE") {
    const lockMessage = String(existingPosition.status) === "DEAD_LOCKED"
      ? "☠️ Estás atrapado en una habitación de muerte. Un GM debe liberarte para poder continuar."
      : "⚠️ Estás atrapado por una trampa. Un GM debe liberarte o desactivar la trampa.";
    return NextResponse.json({ error:lockMessage, blocked:true, status:String(existingPosition.status), lockReason:existingPosition.lockReason ?? null }, { status:423 });
  }

  const Position = (db.orm.public as any).MazeCharacterPosition;
  const Room = db.orm.public.MazeRoom;
  const Exit = (db.orm.public as any).MazeExit;
  const MazeRoomEnemy = (db.orm.public as any).MazeRoomEnemy;

  const result = await db.transaction(async (tx) => {
    // Todas las consultas de esta operación deben usar la misma transacción.
    // Usar los modelos de db fuera de tx aquí hace que una habitación recién
    // creada todavía no sea visible al intentar conectar su salida.
    const TxPosition = (tx.orm.public as any).MazeCharacterPosition;
    const TxRoom = tx.orm.public.MazeRoom;
    const TxExit = (tx.orm.public as any).MazeExit;
    const TxMazeRoomEnemy = (tx.orm.public as any).MazeRoomEnemy;

    const position = await TxPosition.where({ mazeId, characterId }).first();
    let currentRoom:any = position ? await TxRoom.where({ id:Number(position.roomId) }).first() : await TxRoom.where({ mazeId, roomNumber:1 }).first();
    if (!currentRoom) throw new Error("ROOT_NOT_FOUND");

    if (!position) {
      await TxPosition.create({ mazeId, characterId, roomId:currentRoom.id });
    }

    const currentEncounters = TxMazeRoomEnemy ? await TxMazeRoomEnemy.where({ roomId:currentRoom.id, status:"ACTIVE" }).all() : [];
    if (currentEncounters.length > 0) {
      const definitions = await (tx.orm.public as any).Enemy.all();
      for (const encounter of currentEncounters) {
        const definition = definitions.find((enemy:any) => Number(enemy.id) === Number(encounter.enemyId));
        if (!encounter.generatedStats || Object.keys(encounter.generatedStats as any).length === 0) {
          await scaleEncounter(tx, maze, currentRoom, encounter, definition);
        }
      }
    }

    const activeEnemies = TxMazeRoomEnemy ? await TxMazeRoomEnemy.where({ roomId:currentRoom.id, status:"ACTIVE" }).all() : [];
    const requestedExit = await TxExit.where({ fromRoomId:currentRoom.id, direction }).first();
    if (!requestedExit) throw new Error("EXIT_NOT_FOUND");

    if (activeEnemies.length > 0 && Number(requestedExit.toRoomId) !== Number(position?.previousRoomId ?? -1)) throw new Error("ROOM_BLOCKED");
    if (requestedExit.toRoomId != null) {
      const destination = await TxRoom.where({ id:Number(requestedExit.toRoomId) }).first();
      if (!destination) throw new Error("DESTINATION_NOT_FOUND");
      const destinationLock = String(destination.roomType) === "TRAP" && Boolean(destination.trapActive);
      await TxPosition.where({ id:position?.id ?? (await TxPosition.where({ mazeId, characterId }).first())?.id }).update({
        roomId:destination.id,
        previousRoomId:currentRoom.id,
        status:destinationLock ? "TRAPPED" : "ACTIVE",
        lockReason:destinationLock ? "TRAP" : null,
      });
      // Encontrar a otro personaje en la misma habitación hace que ambos se conozcan.
      await registerMazeEncounterRelationships(tx, Number(destination.id), characterId);
      const encounters = TxMazeRoomEnemy ? await TxMazeRoomEnemy.where({ roomId:destination.id, status:"ACTIVE" }).all() : [];
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

    const roomCount = (await TxRoom.where({ mazeId }).all()).length;
    if (String(maze.mazeType) === "FINITE" && roomCount >= Number(maze.maxRooms)) throw new Error("MAZE_LIMIT");
    const nextNumber = roomCount + 1;
    const returnDirection = OPPOSITE_DIRECTION[direction as keyof typeof OPPOSITE_DIRECTION];
    const characterLuck = await getCharacterLuck(tx, characterId);
    const destination = await generateRoom(tx, maze, nextNumber, String(maze.mazeType) === "FINITE" && nextNumber === Number(maze.maxRooms), returnDirection, characterLuck);

    await TxExit.where({ id:requestedExit.id }).update({ toRoomId:destination.id });

    // La conexión de regreso es obligatoria, pero no debemos intentar duplicarla
    // si la generación de la habitación ya la creó por alguna razón.
    const existingReturnExit = await TxExit.where({ fromRoomId:destination.id, direction:returnDirection }).first();
    if (existingReturnExit) {
      if (existingReturnExit.toRoomId == null) {
        await TxExit.where({ id:existingReturnExit.id }).update({ toRoomId:currentRoom.id });
      }
    } else {
      await TxExit.create({ mazeId, fromRoomId:destination.id, direction:returnDirection, toRoomId:currentRoom.id });
    }

    const updatedPosition = await TxPosition.where({ mazeId, characterId }).first();
    const destinationStatus = String(destination.roomType) === "DEATH"
      ? "DEAD_LOCKED"
      : (String(destination.roomType) === "TRAP" && Boolean(destination.trapActive) ? "TRAPPED" : "ACTIVE");
    const destinationLockReason = destinationStatus === "DEAD_LOCKED" ? "DEATH" : destinationStatus === "TRAPPED" ? "TRAP" : null;
    await TxPosition.where({ id:updatedPosition.id }).update({
      roomId:destination.id,
      previousRoomId:currentRoom.id,
      status:destinationStatus,
      lockReason:destinationLockReason,
    });

    // Encontrar a otro personaje en la misma habitación hace que ambos se conozcan.
    await registerMazeEncounterRelationships(tx, Number(destination.id), characterId);

    const destinationEncounters = TxMazeRoomEnemy ? await TxMazeRoomEnemy.where({ roomId:destination.id, status:"ACTIVE" }).all() : [];
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
    console.error("[MAZE_MOVE_ERROR]", result.error);
    const messages:Record<string,string> = {
      ROOT_NOT_FOUND:"El laberinto no tiene habitación inicial.",
      EXIT_NOT_FOUND:"No existe esa salida desde la habitación actual.",
      ROOM_BLOCKED:"Hay enemigos activos. Solo puedes regresar por una salida ya descubierta.",
      DESTINATION_NOT_FOUND:"La habitación de destino no existe.",
      MAZE_LIMIT:"Este laberinto ya alcanzó su límite de habitaciones.",
    };
    return NextResponse.json({ error:messages[result.error] ?? `No se pudo avanzar. (${result.error})` }, { status:400 });
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
