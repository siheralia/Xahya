import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import {
  applyCombatCommand, canAct, newCombatState, type CombatCommand, type CombatState, type Side,
} from "@/lib/combat/turn-engine";
import { advanceCombatMechanics } from "@/lib/skills/mechanics-runtime";

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
  const gm=["ADMIN","GM"].includes(String(user.role));
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
  return NextResponse.json({state:a.state,permissions:{PLAYER:a.canPlayer,
    NPC:a.canOpponent},canMove:{PLAYER:canAct(a.state,"PLAYER"),NPC:canAct(a.state,"NPC")}});
}
function npcRespond(state:CombatState):CombatState {
  // NPC-only automated actions. Never auto-respond for another human player.
  if(state.actors.NPC.characterId!==null || state.status!=="ACTIVE")return state;
  let next=state;
  if(next.pending?.against==="NPC") {
    const npc=next.actors.NPC;
    const defense=npc.constitution>npc.agility?"BLOCK":"DODGE";
    next=applyCombatCommand(next,"NPC",{kind:"DEFEND",defense},dice());
  }
  // After the player's movement or resolved attack, NPC may submit one action,
  // generating a player-facing reaction. It never spams an unbounded loop.
  if(!next.pending && canAct(next,"NPC") && next.actors.NPC.spentTicks<=next.actors.PLAYER.spentTicks) {
    next=applyCombatCommand(next,"NPC",{kind:"ATTACK",attackType:next.actors.NPC.attackType},dice());
  }
  return next;
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
  const command=body.command as CombatCommand;
  if(command.kind==="ATTACK"&&command.usesMagic===true)
    return NextResponse.json({error:"Los ataques mágicos requieren integrar primero su coste de maná."},{status:400});
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
      let next=applyCombatCommand(state,side,command,dice());
      if(side==="PLAYER" && next.status==="ACTIVE")next=npcRespond(next);
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
        updatedAt:new Date(),
      });
      return next;
    });
    return NextResponse.json({state:result});
  }catch(e) {
    return NextResponse.json({error:e instanceof Error?e.message:"No se pudo ejecutar la acción."},{status:400});
  }
}
