import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registerMazeEncounterRelationships } from "@/lib/maze";

async function getUser(){const {userId:clerkId}=await auth();if(!clerkId)return null;const users=await db.orm.public.User.all();return users.find((u)=>u.clerkId===clerkId)??null;}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const mazeId=Number((await params).id); const body=await request.json().catch(()=>null); const characterId=Number(body?.characterId);
  const character=await db.orm.public.Character.where({id:characterId}).first(); const maze=await db.orm.public.Maze.where({id:mazeId}).first();
  if(!character||!maze)return NextResponse.json({error:"Personaje o laberinto no encontrado."},{status:404});
  if(!["GM","ADMIN"].includes(String(user.role))&&Number(character.userId)!==Number(user.id))return NextResponse.json({error:"Forbidden"},{status:403});
  const Position=(db.orm.public as any).MazeCharacterPosition;
  const existing=await Position.where({mazeId,characterId}).first();
  if(existing)return NextResponse.json({roomId:Number(existing.roomId)});
  const otherMazePosition=await Position.where({characterId}).first();
  if(otherMazePosition && Number(otherMazePosition.mazeId)!==mazeId){
    const otherMaze=await db.orm.public.Maze.where({id:Number(otherMazePosition.mazeId)}).first();
    return NextResponse.json({error:"Este personaje ya está dentro de otro laberinto." ,mazeId:Number(otherMazePosition.mazeId),mazeName:otherMaze?.name??null},{status:409});
  }
  const root=await db.orm.public.MazeRoom.where({mazeId,roomNumber:1}).first();
  if(!root)return NextResponse.json({error:"El laberinto no tiene habitación inicial."},{status:500});
  const position=await db.transaction(async (tx) => {
    const TxPosition=(tx.orm.public as any).MazeCharacterPosition;
    const created=await TxPosition.create({mazeId,characterId,roomId:root.id,previousRoomId:null});
    await registerMazeEncounterRelationships(tx, Number(root.id), characterId);
    return created;
  });
  return NextResponse.json({roomId:Number(position.roomId)},{status:201});
}
