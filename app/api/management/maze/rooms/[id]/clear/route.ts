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

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const manager=await getManager();
  if(!manager) return NextResponse.json({error:"Forbidden"},{status:403});
  const roomId=Number((await params).id);
  const body=await request.json().catch(()=>null);
  const room=await db.orm.public.MazeRoom.where({id:roomId}).first();
  if(!room) return NextResponse.json({error:"Habitación no encontrada."},{status:404});
  const Enemy=(db.orm.public as any).MazeRoomEnemy;
  const active=await Enemy.where({roomId,status:"ACTIVE"}).all();
  for(const row of active) await Enemy.where({id:Number(row.id)}).update({status:"DEFEATED"});
  await db.orm.public.MazeRoom.where({id:roomId}).update({status:"CLEARED"});
  if(String(room.roomType)==="BOSS") {
    await db.orm.public.Maze.where({id:Number(room.mazeId)}).update({status:"COMPLETED"});
  }
  await recordAuditEvent({actorUserId:manager.id,action:"MAZE_ROOM_CLEARED",entityType:"MAZE_ROOM",entityId:roomId,details:{mazeId:room.mazeId}});
  return NextResponse.json({ok:true});
}
