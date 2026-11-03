import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/db";
import {
  applyCombatCommand, applyResolvedCombatSkill, canAct, type CombatCommand, type CombatState, type Side,
} from "@/lib/combat/turn-engine";
import { advanceCombatMechanics } from "@/lib/skills/mechanics-runtime";
import { progressTrainingNpc } from "@/lib/combat/npc-policy";
import { combatClientView } from "@/lib/combat/magic-area";
import { canApproveCombat } from "@/lib/combat/permissions";
import { compileCombatSkill } from "@/lib/combat/skill-casting";
import { meetsEffectRequirements } from "@/lib/skills/effect-requirements";

const dice=()=>({hit:randomInt(1_000_000)/1_000_000,
  critical:randomInt(1_000_000)/1_000_000,defense:randomInt(1_000_000)/1_000_000});
async function access(id:string) {
  const {userId}=await auth();
  if(!userId)return null;
  const user=(await db.orm.public.User.all()).find(u=>u.clerkId===userId);
  const encounterId=Number(id);
  if(!user||!Number.isSafeInteger(encounterId)||encounterId<1)return null;
  const Session=(db.orm.public as any).CombatSession;
  const session=await Session.where({id:encounterId}).first();
  if(!session)return null;
  const state=(session.lastAction as any)?.combatV1 as CombatState|undefined;
  if(!state||state.version!==1)return null;
  const player=await db.orm.public.Character.where({id:Number(session.playerCharacterId)}).first();
  const gm=await canApproveCombat(user);
  const opponentId=Number(state.actors.NPC.characterId??0);
  const opponent=opponentId?await db.orm.public.Character.where({id:opponentId}).first():null;
  const canPlayer=gm||Number(player?.userId)===Number(user.id);
  const canOpponent=gm||(opponent!==null&&Number(opponent.userId)===Number(user.id));
  if(!canPlayer&&!canOpponent)return null;
  return {user,session,gm,canPlayer,canOpponent,state,encounterId};
}
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
  const a=await access((await params).id);
  if(!a)return NextResponse.json({error:"Combate no encontrado o sin permiso."},{status:403});
  return NextResponse.json({state:combatClientView(a.state),permissions:{PLAYER:a.canPlayer,
    NPC:a.canOpponent},canMove:{PLAYER:canAct(a.state,"PLAYER"),NPC:canAct(a.state,"NPC")}});
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {
  const a=await access((await params).id);
  if(!a)return NextResponse.json({error:"Combate no encontrado o sin permiso."},{status:403});
  const body=await req.json().catch(()=>null);
  const side=body?.side as Side;
  if(!["PLAYER","NPC"].includes(side)||!body?.command||typeof body.command!=="object")
    return NextResponse.json({error:"Acción inválida."},{status:400});
  if(side==="PLAYER"&&!a.canPlayer || side==="NPC"&&!a.canOpponent)
    return NextResponse.json({error:"No controlas a este combatiente."},{status:403});
  const advanceNpcOnly=body.command.kind==="ADVANCE";
  const command=body.command as CombatCommand;
  try {
    const result=await db.transaction(async tx=>{
      // Serialize both players and NPC replies to prevent lost update/double spending.
      const lock=db.raw.sql`UPDATE public."combatSession" SET id=id WHERE id=${a.encounterId}`.affectedCount().build();
      if((await tx.execute(lock)).affectedRows!==1)throw new Error("COMBAT_NOT_FOUND");
      const Session=(tx.orm.public as any).CombatSession;
      const fresh=await Session.where({id:a.encounterId}).first();
      const state=(fresh?.lastAction as any)?.combatV1 as CombatState|undefined;
      if(!state||state.version!==1||String(fresh?.status)!=="ACTIVE")
        throw new Error("El combate ya terminó o no admite estas acciones.");
      let next: CombatState;
      if(advanceNpcOnly) {
        if(side!=="PLAYER" || state.actors.NPC.characterId!==null)
          throw new Error("Solo puedes avanzar la IA de un oponente de entrenamiento.");
        next=progressTrainingNpc(state,dice,()=>randomInt(1_000_000)/1_000_000);
        if(JSON.stringify(next)===JSON.stringify(state))
          throw new Error("No hay ninguna acción automática pendiente del NPC.");
      } else if(command.kind==="CAST_SKILL") {
        // The client supplies ONLY a skill id and aim. Its effects, cost and
        // cooldown are compiled exclusively from the approved DB row here,
        // inside the same serialized session transaction.
        const characterId=state.actors[side].characterId;
        if(characterId===null)throw new Error("El NPC de entrenamiento no posee habilidades personales.");
        const skillId=Number(command.skillId);
        if(!Number.isSafeInteger(skillId)||skillId<=0)throw new Error("Habilidad inválida.");
        const requestId=String(command.requestId??"");
        if(state.processedSkillRequests?.includes(requestId)){
          next=state; // Same request retransmitted: no extra mana, PA or NPC action.
        }else{
          const Skill=(tx.orm.public as any).Skill;
          const skill=await Skill.where({id:skillId,characterId,status:"APPROVED"}).first();
          if(!skill)throw new Error("Esta habilidad no está aprobada para tu personaje.");
          const stolen=db.raw.sql`
            SELECT 1 AS "taken" FROM public."skillTheft"
            WHERE "victimCharacterId"=${characterId}
             AND "sourceSkillId"=${skillId} AND status='ACTIVE' LIMIT 1
          `.returnsRow({taken:"pg/int4@1"}).build();
          if((await tx.execute(stolen)).rows.length>0)
            throw new Error("No puedes lanzar una habilidad que te han robado temporalmente.");
          const available=await Skill.where({characterId,status:"APPROVED"}).all();
          const others=available.filter((s:any)=>Number(s.id)!==skillId);
          const requirements=Array.isArray(skill.effectRequirements)?skill.effectRequirements:[];
          if(!meetsEffectRequirements(requirements,others))
            throw new Error("No se cumplen los requisitos por efecto de esta habilidad.");
          const plan=compileCombatSkill(skill);
          next=applyResolvedCombatSkill(state,side,plan,command,dice());
          if(side==="PLAYER"&&next.status==="ACTIVE")
            next=progressTrainingNpc(next,dice,()=>randomInt(1_000_000)/1_000_000);
        }
      } else {
        next=applyCombatCommand(state,side,command,dice());
        // In particular, progress after PLAYER's DEFEND; previously this was
        // skipped and forced GM to control the training NPC manually.
        if(side==="PLAYER" && next.status==="ACTIVE")
          next=progressTrainingNpc(next,dice,()=>randomInt(1_000_000)/1_000_000);
      }
      let mechanics=fresh.mechanicsState;
      if(next.round>state.round) {
        const Skill=(tx.orm.public as any).Skill;
        const SkillState=(tx.orm.public as any).CharacterSkillState;
        const approved=Skill?await Skill.where({characterId:Number(fresh.playerCharacterId)}).all():[];
        const active=SkillState?await SkillState.where({characterId:Number(fresh.playerCharacterId),active:true}).all():[];
        mechanics=advanceCombatMechanics(mechanics,Number(fresh.playerCharacterId),
          approved,active.map((x:any)=>Number(x.skillId)));
      }
      await Session.where({id:a.encounterId}).update({
        lastAction:{combatV1:next},mechanicsState:mechanics,
        currentTick:next.tick,turn:next.round,status:next.status,
        activeActor:next.pending?.against??(canAct(next,"PLAYER")?"PLAYER":"NPC"),
        playerNextActionTick:next.actors.PLAYER.spentTicks,
        npcNextActionTick:next.actors.NPC.spentTicks,
        updatedAt:Temporal.Now.instant(),
      });
      return next;
    });
    return NextResponse.json({state:combatClientView(result)});
  }catch(e) {
    return NextResponse.json({error:e instanceof Error?e.message:"No se pudo ejecutar la acción."},{status:400});
  }
}
