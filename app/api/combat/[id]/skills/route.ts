import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canApproveCombat } from "@/lib/combat/permissions";
import { projectApprovedCombatSkills, type CombatSkillPreview } from "@/lib/combat/skill-preview";
import { meetsEffectRequirements } from "@/lib/skills/effect-requirements";
import type { CombatState } from "@/lib/combat/turn-engine";

type Side="PLAYER"|"NPC";
type Payload={skills:Record<Side,CombatSkillPreview[]>};

/** A read-only phase-2.1 catalog. Never exposes unapproved or stolen
 * abilities and never reveals the opponent's private skill list. A player
 * can load only their own roster; moderators can review both. */
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
 const encounterId=Number((await params).id);
 if(!Number.isSafeInteger(encounterId)||encounterId<=0)
  return NextResponse.json({error:"Combate inválido."},{status:400});
 const {userId}=await auth();
 if(!userId)return NextResponse.json({error:"Sin sesión."},{status:401});
 const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
 if(!user)return NextResponse.json({error:"Sin usuario."},{status:403});
 const Session=(db.orm.public as any).CombatSession;
 const session=await Session.where({id:encounterId}).first();
 const combat=(session?.lastAction as any)?.combatV1 as CombatState|undefined;
 if(!session||!combat||combat.version!==1)
  return NextResponse.json({error:"Combate no encontrado."},{status:404});
 const firstId=Number(combat.actors.PLAYER.characterId??0);
 const secondId=Number(combat.actors.NPC.characterId??0);
 const first=firstId>0?await db.orm.public.Character.where({id:firstId}).first():null;
 const second=secondId>0?await db.orm.public.Character.where({id:secondId}).first():null;
 const moderator=await canApproveCombat(user);
 const canPlayer=first!==null&&(moderator||Number(first.userId)===Number(user.id));
 const canOpponent=second!==null&&(moderator||Number(second.userId)===Number(user.id));
 if(!canPlayer&&!canOpponent)
  return NextResponse.json({error:"No tienes permiso para consultar este combate."},{status:403});
 const Skill=(db.orm.public as any).Skill;
 const State=(db.orm.public as any).CharacterSkillState;
 async function roster(characterId:number):Promise<CombatSkillPreview[]> {
  if(!Skill)return [];
  const rows=await Skill.where({characterId}).all();
  const states=State?await State.where({characterId}).all():[];
  // Identical theft suppression to the character-sheet skill endpoint.
  const theft=db.raw.sql`
    SELECT "sourceSkillId" AS id FROM public."skillTheft"
    WHERE "victimCharacterId"=${characterId} AND status='ACTIVE'
  `.returnsRow({id:"pg/int4@1"}).build();
  const stolen=new Set((await db.runtime().query(theft) as Array<{id:number}>)
   .map(r=>Number(r.id)));
  return projectApprovedCombatSkills(rows,states,stolen,(skill,other)=>
    meetsEffectRequirements(
      Array.isArray(skill.effectRequirements)?skill.effectRequirements as any:[],
      other as any[]
    ));
 }
 const response:Payload={skills:{PLAYER:[],NPC:[]}};
 if(canPlayer)response.skills.PLAYER=await roster(firstId);
 if(canOpponent)response.skills.NPC=await roster(secondId);
 return NextResponse.json(response,{headers:{"Cache-Control":"private, no-store"}});
}
