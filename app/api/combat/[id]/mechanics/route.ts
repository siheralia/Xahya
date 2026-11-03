import {auth} from "@clerk/nextjs/server";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {setActorDistance} from "@/lib/skills/mechanics-runtime";
import {canApproveCombat} from "@/lib/combat/permissions";
import {applyMechanicEvent,parseEnvironment,validateSkillMechanics,type MechanicEvent} from "@/lib/skills/interaction-engine";

async function access(id:string) {
 const encounterId=Number(id);
 if(!Number.isSafeInteger(encounterId)||encounterId<=0)return null;
 const {userId}=await auth();
 if(!userId)return null;
 const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
 const session=await (db.orm.public as any).CombatSession.where({id:encounterId}).first();
 if(!session||!user)return null;
 const character=await db.orm.public.Character.where({id:Number(session.playerCharacterId)}).first();
 if(!character)return null;
 const gm=await canApproveCombat(user);
 if(!gm&&Number(character.userId)!==Number(user.id))return null;
 return {session,gm,characterId:Number(character.id),encounterId};
}

export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
 const a=await access((await params).id);
 if(!a)return NextResponse.json({error:"Sin permiso."},{status:403});
 return NextResponse.json({environment:parseEnvironment(a.session.mechanicsState)});
}

/** Distances are established by a GM, not by an unverified player claim. */
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}) {
 const a=await access((await params).id);
 if(!a||!a.gm)return NextResponse.json({error:"Requiere GM."},{status:403});
 const b=await req.json().catch(()=>null);
 const actor=b?.actor;
 if(actor!=="PLAYER"&&actor!=="NPC")return NextResponse.json({error:"Actor inválido."},{status:400});
 const distance=Number(b?.distanceMeters);
 try {
  const state=await db.transaction(async tx=>{
   const Session=(tx.orm.public as any).CombatSession;
   const fresh=await Session.where({id:a.encounterId,status:"ACTIVE"}).first();
   if(!fresh)throw new Error("COMBAT_NOT_ACTIVE");
   const next=setActorDistance(fresh.mechanicsState,actor,distance);
   await Session.where({id:a.encounterId}).update({mechanicsState:next});
   return next;
  });
  return NextResponse.json({environment:state});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Error."},{status:400});}
}

/** Explicit hit/entry resolution for GMs until the combat engine has spatial hits. */
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {
 const a=await access((await params).id);
 if(!a||!a.gm)return NextResponse.json({error:"Requiere GM."},{status:403});
 const b=await req.json().catch(()=>null);
 const event=String(b?.event??"") as MechanicEvent;
 const skillId=Number(b?.skillId);
 if(!["HIT","ENTER_FIELD"].includes(event)||!Number.isSafeInteger(skillId)||skillId<=0)
  return NextResponse.json({error:"Evento o habilidad inválidos."},{status:400});
 try {
  const state=await db.transaction(async tx=>{
   const Session=(tx.orm.public as any).CombatSession;
   const Skill=(tx.orm.public as any).Skill;
   const fresh=await Session.where({id:a.encounterId,status:"ACTIVE"}).first();
   if(!fresh)throw new Error("COMBAT_NOT_ACTIVE");
   const skill=await Skill.where({id:skillId,characterId:a.characterId,status:"APPROVED"}).first();
   if(!skill)throw new Error("SKILL_NOT_APPROVED");
   const states=await (tx.orm.public as any).CharacterSkillState.where({characterId:a.characterId,active:true}).all();
   const activeIds=states.map((s:any)=>Number(s.skillId));
   if(!activeIds.includes(skillId)&&skill.category!=="PASSIVE")throw new Error("SKILL_NOT_ACTIVE");
   const approved=await Skill.where({characterId:a.characterId,status:"APPROVED"}).all();
   const mechanics=skill.mechanics??{};
   const validation=validateSkillMechanics(mechanics,skillId);
   if(validation)throw new Error(validation);
   const current=parseEnvironment(fresh.mechanicsState);
   const next=applyMechanicEvent(current,mechanics,{
     actor:"PLAYER",event,sourceSkillId:skillId,ownerCharacterId:a.characterId,
     approvedSkillIds:approved.map((s:any)=>Number(s.id)),activeSkillIds:activeIds,distances:current.distances,
   }).state;
   await Session.where({id:a.encounterId}).update({mechanicsState:next});
   return next;
  });
  return NextResponse.json({environment:state});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Error."},{status:400});}
}
