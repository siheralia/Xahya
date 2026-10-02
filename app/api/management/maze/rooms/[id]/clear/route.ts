import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";

async function getManager() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  const user = users.find((candidate) => candidate.clerkId === clerkId);
  return user && ["GM","ADMIN"].includes(String(user.role)) ? user : null;
}

function normalizedLoot(enemy:any) {
  const raw = Array.isArray(enemy?.loot) ? enemy.loot : [];
  return raw.flatMap((entry:any) => {
    if (!entry || typeof entry !== "object") return [];
    const type = String(entry.type ?? entry.kind ?? "").toLowerCase();
    const amount = Number(entry.amount ?? entry.quantity ?? entry.value ?? 0);
    if (["money","coins","gold"].includes(type) && amount > 0) return [{ type:"money", amount }];
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

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const manager=await getManager();
  if(!manager) return NextResponse.json({error:"Forbidden"},{status:403});
  const roomId=Number((await params).id);
  await request.json().catch(()=>null);
  const room=await db.orm.public.MazeRoom.where({id:roomId}).first();
  if(!room) return NextResponse.json({error:"Habitación no encontrada."},{status:404});

  const result = await db.transaction(async (tx) => {
    const Enemy=(tx.orm.public as any).MazeRoomEnemy;
    const encounters=await Enemy.where({roomId}).all();
    if(encounters.length===0) return {alreadyCleared:true,incomplete:false,remaining:0,rewards:[]};
    const active=encounters.filter((row:any)=>String(row.status)==="ACTIVE");
    const defeated=encounters.filter((row:any)=>String(row.status)==="DEFEATED");
    if(active.length>0) return {alreadyCleared:false,incomplete:true,remaining:active.length,rewards:[]};
    if(defeated.length===0) return {alreadyCleared:true,incomplete:false,remaining:0,rewards:[]};

    const positions=await (tx.orm.public as any).MazeCharacterPosition.where({roomId}).all();
    const participants=positions;
    const characters=await tx.orm.public.Character.all();
    const CharacterResource=(tx.orm.public as any).CharacterResource;
    const CharacterItem=(tx.orm.public as any).CharacterItem;
    const Item=(tx.orm.public as any).Item;
    const definitions=await (tx.orm.public as any).Enemy.all();
    const distributions:any[] = [];

    if(participants.length>0) {
      const totals={money:0,karma:0,items:new Map<number,number>()};
      for(const encounter of defeated) {
        const definition=definitions.find((enemy:any)=>Number(enemy.id)===Number(encounter.enemyId));
        const multiplier=Math.max(1,Number(encounter.quantity)||1);
        for(const loot of normalizedLoot(definition)) {
          if(loot.type==="money") totals.money += loot.amount * multiplier;
          else if(loot.type==="karma") totals.karma += loot.amount * multiplier;
          else totals.items.set(loot.itemId,(totals.items.get(loot.itemId)??0)+(loot.quantity*multiplier));
        }
      }

      for(let index=0;index<participants.length;index++) {
        const characterId=Number(participants[index].characterId);
        const character=characters.find((candidate:any)=>Number(candidate.id)===characterId);
        if(!character) continue;
        const money=splitAmount(totals.money,participants.length,index);
        const karma=splitAmount(totals.karma,participants.length,index);
        if(money>0 || karma>0) {
          const existing=await CharacterResource.where({characterId}).first();
          if(existing) await CharacterResource.where({id:Number(existing.id)}).update({money:Number(existing.money??0)+money,karma:Number(existing.karma??0)+karma});
          else await CharacterResource.create({characterId,money,karma});
        }

        const itemRewards:any[]=[];
        for(const [itemId,total] of totals.items.entries()) {
          const quantity=splitAmount(total,participants.length,index);
          if(quantity<=0) continue;
          const existing=CharacterItem ? await CharacterItem.where({characterId,itemId}).first() : null;
          if(existing) await CharacterItem.where({id:Number(existing.id)}).update({quantity:Number(existing.quantity??0)+quantity});
          else if(CharacterItem) await CharacterItem.create({characterId,itemId,quantity,equipped:false,equippedSlot:null});
          itemRewards.push({itemId,quantity});
        }

        distributions.push({
          characterId,
          name:String(character.name),
          money,
          karma,
          items:itemRewards,
        });
      }
    }

    await tx.orm.public.MazeRoom.where({id:roomId}).update({status:"CLEARED"});
    if(String(room.roomType)==="BOSS") {
      await tx.orm.public.Maze.where({id:Number(room.mazeId)}).update({status:"COMPLETED"});
    }
    return {alreadyCleared:false,incomplete:false,remaining:0,rewards:distributions};
  });

  if(result.incomplete) return NextResponse.json({error:`Aún quedan ${result.remaining} enemigo(s) activos.`},{status:400});
  if(result.alreadyCleared) return NextResponse.json({ok:true,alreadyCleared:true,rewards:[]});

  await recordAuditEvent({
    actorUserId:manager.id,
    action:"MAZE_ROOM_CLEARED",
    entityType:"MAZE_ROOM",
    entityId:roomId,
    details:{mazeId:room.mazeId,rewards:result.rewards},
  });
  return NextResponse.json({ok:true,rewards:result.rewards});
}
