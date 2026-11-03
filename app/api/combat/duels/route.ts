import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { getEffectiveCharacterStats } from "@/lib/stats/effective";
import { calculateConfiguredDerivedStats } from "@/lib/stats/engine";
import { readMechanics } from "@/lib/stats/mechanics";
import { canAct, massDefaultKg, newCombatState, weaponIntegrityDefault, type CombatFighter } from "@/lib/combat/turn-engine";
import { progressTrainingNpc } from "@/lib/combat/npc-policy";
import { varyTrainingNpcStats } from "@/lib/combat/training-npc";
import { hasRolePermission } from "@/lib/role-permissions";

const numeric = (n:unknown, fallback=0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
async function currentUser() {
  const {userId}=await auth();
  if(!userId)return null;
  return (await db.orm.public.User.all()).find(u=>u.clerkId===userId)??null;
}
async function canApproveCombat(user:{id:number;role:string}) {
 return ["ADMIN","GM"].includes(String(user.role))
  || await hasRolePermission(user,"management.combat","approve");
}
export async function GET() {
 const user=await currentUser();
 if(!user)return NextResponse.json({error:"Sin sesión."},{status:401});
 const canApprovePvP=await canApproveCombat(user);
 const all=await db.orm.public.Character.all();
 const own=all.filter(c=>Number(c.userId)===Number(user.id));
 const chars=canApprovePvP?all:own;
 const characters=chars.map(c=>({id:Number(c.id),name:String(c.name),mine:Number(c.userId)===Number(user.id)}));
 return NextResponse.json({characters,canApprovePvP});
}
function buildFighter(name:string, characterId:number|null, base:Record<string,number>,
 derived:Record<string,number>, weaponType:unknown="CUT", defenseType:unknown="SOLID"):CombatFighter {
  const aType=["CUT","BLUNT","PIERCE"].includes(String(weaponType)) ? weaponType as CombatFighter["attackType"]:"CUT";
  const dType=["CONCENTRATED","DISPERSED","SOLID"].includes(String(defenseType)) ? defenseType as CombatFighter["defenseType"]:"SOLID";
  return {
    characterId,name,hp:Math.max(1,Math.floor(numeric(derived.maxHp,10))),
    maxHp:Math.max(1,Math.floor(numeric(derived.maxHp,10))),
    agility:Math.max(1,numeric(base.agility,1)),strength:numeric(base.strength),
    constitution:numeric(base.constitution),precision:numeric(derived.precision),
    dodge:numeric(derived.dodge),physicalAttack:numeric(derived.physicalAttack),
    physicalDefense:numeric(derived.physicalDefense),magicAttack:numeric(derived.magicAttack),
    magicDefense:numeric(derived.magicDefense),critical:numeric(derived.critical),
    luck:numeric(base.luck),race:numeric(derived.race),
    massKg:massDefaultKg,positionMeters:characterId===null?1.5:0,attackType:aType,defenseType:dType,
    weaponIntegrity:weaponIntegrityDefault,spentTicks:0,spentAp:0,
  };
}
export async function POST(req:Request) {
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Sin sesión."},{status:401});
  const body=await req.json().catch(()=>null);
  const characterId=Number(body?.characterId);
  if(!Number.isSafeInteger(characterId)||characterId<1)
    return NextResponse.json({error:"Personaje inválido."},{status:400});
  const character=await db.orm.public.Character.where({id:characterId}).first();
  const gm=await canApproveCombat(user);
  if(!character || (!gm && Number(character.userId)!==Number(user.id)))
    return NextResponse.json({error:"Sin permiso sobre este personaje."},{status:403});
  const first=await getEffectiveCharacterStats(characterId);
  if(!first)return NextResponse.json({error:"Faltan estadísticas del personaje."},{status:400});
  const mechanics=await readMechanics();
  const player=buildFighter(String(character.name),characterId,first.effectiveStats,first.derived,
    (character as any).magicAttackType,(character as any).blockDefenseType);
  player.speedValue=numeric(first.effectiveStats[mechanics.combatSpeed]??first.derived[mechanics.combatSpeed],player.agility);
  const opponentId=Number(body?.opponentCharacterId??0);
  let opponent:CombatFighter;
  if(Number.isSafeInteger(opponentId) && opponentId>0) {
    // A GM must initiate PvP. Both owners may act afterward.
    if(!gm)return NextResponse.json({error:"El PvP requiere que un GM inicie el encuentro."},{status:403});
    if(opponentId===characterId)return NextResponse.json({error:"Un personaje no puede enfrentarse consigo mismo."},{status:400});
    const rival=await db.orm.public.Character.where({id:opponentId}).first();
    const stats=await getEffectiveCharacterStats(opponentId);
    if(!rival||!stats)return NextResponse.json({error:"Oponente no encontrado."},{status:404});
    opponent=buildFighter(String(rival.name),opponentId,stats.effectiveStats,stats.derived,
      (rival as any).magicAttackType,(rival as any).blockDefenseType);
    opponent.positionMeters=1.5;
    opponent.speedValue=numeric(stats.effectiveStats[mechanics.combatSpeed]??stats.derived[mechanics.combatSpeed],opponent.agility);
  } else {
    // Fair sparring partner: mirror the challenger's effective base stats,
    // then let a GM override specific values for a scripted NPC.
    const base={
      strength:Math.max(1,numeric(first.effectiveStats.strength,10)),
      agility:Math.max(1,numeric(first.effectiveStats.agility,10)),
      constitution:Math.max(1,numeric(first.effectiveStats.constitution,10)),
      intelligence:Math.max(1,numeric(first.effectiveStats.intelligence,10)),
      wisdom:Math.max(1,numeric(first.effectiveStats.wisdom,10)),
      charisma:Math.max(1,numeric(first.effectiveStats.charisma,10)),
      spirit:Math.max(1,numeric(first.effectiveStats.spirit,10)),
      luck:Math.max(1,numeric(first.effectiveStats.luck,10)),
    };
    if(gm && body?.npcStats && typeof body.npcStats==="object") {
      for(const key of Object.keys(base) as Array<keyof typeof base>) {
        const supplied=Number(body.npcStats[key]);
        if(Number.isFinite(supplied))base[key]=Math.max(0,Math.min(10000,supplied));
      }
    }
    // A small, server-generated variation makes each training opponent unique.
    // Preserve mirrored AGI/speed so equal-speed initiative can still be tested.
    const npcBase=gm&&body?.npcStats&&typeof body.npcStats==="object"
      ? base:varyTrainingNpcStats(base,()=>randomInt(1_000_000)/1_000_000);
    const derived=await calculateConfiguredDerivedStats(npcBase);
    opponent=buildFighter(String(body?.npcName||"Oponente de entrenamiento").slice(0,80),
      null,npcBase,derived);
    opponent.massKg=massDefaultKg;
    opponent.speedValue=numeric((npcBase as Record<string,number>)[mechanics.combatSpeed]??(derived as Record<string,number>)[mechanics.combatSpeed],opponent.agility);
  }
  // Server-side random tie-break prevents a permanent first-mover advantage.
  // The next round opens with the other fighter, then alternates.
  const starter=randomInt(2)===0?"PLAYER":"NPC";
  const dice=()=>({hit:randomInt(1_000_000)/1_000_000,
    critical:randomInt(1_000_000)/1_000_000,defense:randomInt(1_000_000)/1_000_000});
  const state=progressTrainingNpc(newCombatState(player,opponent,starter),dice,
    ()=>randomInt(1_000_000)/1_000_000);
  const Session=(db.orm.public as any).CombatSession;
  const session=await Session.create({
    playerCharacterId:characterId,npcName:opponent.name,
    npcStats:{opponentCharacterId:opponent.characterId},
    currentTick:state.tick,turn:state.round,
    activeActor:state.pending?.against??(canAct(state,"PLAYER")?"PLAYER":"NPC"),
    status:state.status,lastAction:{combatV1:state},
    playerNextActionTick:state.actors.PLAYER.spentTicks,
    npcNextActionTick:state.actors.NPC.spentTicks,
  });
  return NextResponse.json({id:Number(session.id),state},{status:201});
}
