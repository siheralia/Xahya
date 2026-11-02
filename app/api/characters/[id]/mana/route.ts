import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {readMaxMana} from "@/lib/skills/mechanics-runtime";

async function authorize(id:string) {
 const characterId=Number(id);
 if(!Number.isSafeInteger(characterId)||characterId<=0)return null;
 const {userId}=await auth();
 if(!userId)return null;
 const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
 const character=await db.orm.public.Character.where({id:characterId}).first();
 if(!user||!character||(Number(character.userId)!==Number(user.id) && !["ADMIN","GM"].includes(String(user.role))))return null;
 return {characterId};
}

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const access=await authorize((await params).id);
 if(!access)return NextResponse.json({error:"Sin permiso."},{status:403});
 const maximum=await readMaxMana(access.characterId);
 const resource=await db.orm.public.CharacterResource.where({characterId:access.characterId}).first();
 return NextResponse.json({currentMana:resource?.currentMana??maximum,maxMana:maximum});
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
 const access=await authorize((await params).id);
 if(!access)return NextResponse.json({error:"Sin permiso."},{status:403});
 const body=await request.json().catch(()=>null);
 const maximum=await readMaxMana(access.characterId);
 const value=Number(body?.currentMana);
 if(!Number.isSafeInteger(value)||value<0||value>maximum)
  return NextResponse.json({error:"Maná fuera de rango."},{status:400});
 const resource=await db.orm.public.CharacterResource.where({characterId:access.characterId}).first();
 if(!resource)return NextResponse.json({error:"Recursos no encontrados."},{status:404});
 await db.orm.public.CharacterResource.where({characterId:access.characterId}).update({currentMana:value});
 return NextResponse.json({currentMana:value,maxMana:maximum});
}
