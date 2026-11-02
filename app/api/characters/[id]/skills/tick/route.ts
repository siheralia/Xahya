import { validEffectRequirements, effectRequirementDiscount, meetsEffectRequirements } from "@/lib/skills/effect-requirements";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { advanceCharacterSkillTicks } from "@/lib/combat/ticks";
import { activateSkillMechanics, readMaxMana, locateSkillEnvironment, saveSkillEnvironment, stopSkillMechanics } from "@/lib/skills/mechanics-runtime";
import {cooldownTurns} from "@/lib/skills/cooldown";
import {cooldownAvailability,recordSkillCooldown} from "@/lib/skills/cooldown-runtime";

async function getUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const users = await db.orm.public.User.all();
  return users.find((user) => user.clerkId === clerkId) ?? null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const characterId = Number((await params).id);
  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });
  const management = ["GM", "ADMIN"].includes(String(user.role));
  if (!management && Number(character.userId) !== Number(user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action ?? "tick");
  const Skill = (db.orm.public as any).Skill;
  const State = (db.orm.public as any).CharacterSkillState;
  if (!Skill || !State) return NextResponse.json({ error: "El sistema de ticks aún no está disponible." }, { status: 500 });

  if (action === "start" || action === "stop") {
    const skillId = Number(body?.skillId);
    const skill = await Skill.where({ id: skillId, characterId }).first();
    if (!skill || String(skill.status) !== "APPROVED") return NextResponse.json({ error: "Habilidad no encontrada o no aprobada." }, { status: 404 });
    if (action === "start") {
      const theftCheck=db.raw.sql`
        SELECT id FROM public."skillTheft"
        WHERE "victimCharacterId"=${characterId} AND "sourceSkillId"=${skillId} AND status='ACTIVE'
        LIMIT 1
      `.returnsRow({id:"pg/int4@1"}).build();
      if((await db.runtime().query(theftCheck)).length)
        return NextResponse.json({error:"Esta habilidad fue robada temporalmente y no se puede activar."},{status:409});
      const approvedSkills = await Skill.where({characterId,status:"APPROVED"}).all();
      if (!meetsEffectRequirements(Array.isArray(skill.effectRequirements)?skill.effectRequirements:[],approvedSkills.filter((s:{id:number})=>Number(s.id)!==skillId))) return NextResponse.json({error:"Faltan los efectos o elementos requeridos."},{status:400});
    }
    const now = new Date();
    if (action === "stop") await db.transaction((tx) => advanceCharacterSkillTicks(tx, characterId, now));
    const maxMana = action === "start" ? await readMaxMana(characterId) : 0;
    try {
      const result = await db.transaction(async (tx) => {
        // Serialize two concurrent activations, including the first activation
        // before a CharacterSkillState exists. Prevent duplicate cooldown/mana uses.
        if(action==="start"){
          const lock=db.raw.sql`UPDATE public."character" SET id=id WHERE id=${characterId}`.affectedCount().build();
          if((await tx.execute(lock)).affectedRows!==1)throw new Error("CHARACTER_NOT_FOUND");
        }
        const TxState=(tx.orm.public as any).CharacterSkillState;
        const existing=await TxState.where({characterId,skillId}).first();
        // Starting twice must not duplicate an effect or charge mana twice.
        if(action==="start" && existing?.active) return {state:existing,alreadyActive:true,manaBalance:null,environment:null};
        if(action==="start"){
          const location=await locateSkillEnvironment(tx,characterId);
          const gate=cooldownAvailability(skill.cooldown,skill.duration,skill.category,
            location.state.cooldowns?.[String(skillId)],location.kind,location.state.turn,Date.now());
          if(!gate.allowed){
            if(gate.reason==="COOLDOWN_COMBAT_ONLY")throw new Error("COOLDOWN_COMBAT_ONLY");
            throw new Error("COOLDOWN_ACTIVE:"+gate.remainingTurns);
          }
        }
        const mechanics=action==="start"
          ? await activateSkillMechanics(tx,skill,characterId,maxMana)
          : null;
        if(action==="stop")await stopSkillMechanics(tx,characterId,skillId);
        if(action==="start" && skill.category!=="PASSIVE" &&
           (skill.cooldown==="Una vez por combate"||cooldownTurns(skill.cooldown,skill.duration)>0)){
          // Mechanics may have rewritten the environment; reread before stamping
          // so the cooldown remains persisted alongside field/status effects.
          const location=await locateSkillEnvironment(tx,characterId);
          await saveSkillEnvironment(tx,location,{...location.state,
            cooldowns:recordSkillCooldown(location.state.cooldowns,skillId,location.state.turn,Date.now()),
          });
        }
        const state=existing
          ? await TxState.where({id:Number(existing.id)}).update({
              active:action==="start",lastTickAt:action==="start"?now:existing.lastTickAt,updatedAt:now,
            })
          : await TxState.create({
              characterId,skillId,active:action==="start",accumulations:0,totalTicks:0,
              lastTickAt:action==="start"?now:null,
            });
        return {state,alreadyActive:false,manaBalance:mechanics?.manaBalance??null,environment:mechanics?.environment??null};
      });
      return NextResponse.json(result);
    } catch(error) {
      const code=error instanceof Error?error.message:"SKILL_START_FAILED";
      const messages:Record<string,string>={
        MANA_INSUFFICIENT:"Maná insuficiente para activar la habilidad.",
        MANA_CHANGED:"El saldo de maná cambió; vuelve a intentar.",
        MANA_RESOURCE_MISSING:"El personaje no tiene recursos de maná inicializados.",
        MISSING_PARENT_SKILL:"Debes conocer la habilidad madre.",
        MECHANIC_CONDITION_FAILED:"No se cumplen las condiciones mecánicas.",
        COOLDOWN_COMBAT_ONLY:"Esta habilidad solo puede utilizarse durante un combate.",

      };
      if(code.startsWith("COOLDOWN_ACTIVE:")){
        const remaining=Number(code.split(":")[1])||0;
        return NextResponse.json({error:remaining>0?"Habilidad en cooldown. Faltan "+remaining+" turno(s).":"Esta habilidad ya se utilizó en este combate.",remainingTurns:remaining},{status:409});
      }
      if(messages[code])return NextResponse.json({error:messages[code]},{status:409});
      console.error("[skills/tick] Activation error",error);
      return NextResponse.json({error:code},{status:400});
    }
  }

  const result = await db.transaction((tx) => advanceCharacterSkillTicks(tx, characterId));
  const states = await State.where({ characterId }).all();
  return NextResponse.json({ states, advanced: result });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const characterId = Number((await params).id);
  const character = await db.orm.public.Character.where({ id: characterId }).first();
  if (!character) return NextResponse.json({ error: "Personaje no encontrado." }, { status: 404 });
  const management = ["GM", "ADMIN"].includes(String(user.role));
  if (!management && Number(character.userId) !== Number(user.id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const State = (db.orm.public as any).CharacterSkillState;
  const states = State ? await State.where({ characterId }).all() : [];
  const location=await locateSkillEnvironment(db,characterId);
  const resource=await db.orm.public.CharacterResource.where({characterId}).first();
  return NextResponse.json({ states,environment:location.state,environmentKind:location.kind,currentMana:resource?.currentMana??null });
}
