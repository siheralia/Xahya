import { db } from "@/lib/db";
import { getEffectiveCharacterStats } from "@/lib/stats/effective";
import {
  activeStatMultipliers, advanceEnvironmentTurn, applyMechanicEvent, conditionsMet,
  parseEnvironment, type EnvironmentState, type MechanicsContext, type SkillMechanics,
  validateSkillMechanics,
} from "@/lib/skills/interaction-engine";

/** An elemental effect imbues its owner while the skill is active; damage typing is resolved elsewhere. */
export function syncSkillImbuements(input:EnvironmentState,skill:any):EnvironmentState {
  const id=Number(skill.id);
  const effects=Array.isArray(skill.effect)?skill.effect:[];
  const imbues=effects.filter((e:any)=>e?.type==="ELEMENTAL_IMBUE" && typeof e.element==="string" &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(e.element) && e.element!=="NEUTRAL");
  if(!imbues.length)return input;
  return {...input,statuses:[
    ...input.statuses.filter(s=>!(s.sourceSkillId===id&&s.status==="ELEMENTAL_IMBUE"&&s.actor==="PLAYER")),
    ...imbues.map((e:any)=>({sourceSkillId:id,status:"ELEMENTAL_IMBUE",actor:"PLAYER" as const,
      element:e.element,imbueTarget:String(e.target??"SELF"),remainingTurns:2})),
  ]};
}
export async function stopSkillMechanics(tx:any,characterId:number,skillId:number){
  const location=await locateSkillEnvironment(tx,characterId);
  const filtered=location.state.statuses.filter(s=>!(s.sourceSkillId===skillId && s.status==="ELEMENTAL_IMBUE"));
  if(filtered.length!==location.state.statuses.length)
    await saveSkillEnvironment(tx,location,{...location.state,statuses:filtered});
}

type EnvironmentLocation = { kind: "COMBAT" | "MAZE" | "PERSONAL"; id: number; state: EnvironmentState };

export async function locateSkillEnvironment(tx: any, characterId: number): Promise<EnvironmentLocation> {
  const Combat = (tx.orm.public as any).CombatSession;
  if (Combat) {
    const matches = await Combat.where({ playerCharacterId: characterId, status: "ACTIVE" }).all();
    const encounter = matches.sort((a:any,b:any)=>Number(b.id)-Number(a.id))[0];
    if (encounter) return {kind:"COMBAT",id:Number(encounter.id),state:parseEnvironment(encounter.mechanicsState)};
  }
  const Positions = (tx.orm.public as any).MazeCharacterPosition;
  const position = Positions ? await Positions.where({characterId,status:"ACTIVE"}).first() : null;
  if (position) {
    const room = await (tx.orm.public as any).MazeRoom.where({id:Number(position.roomId)}).first();
    if (room) return {kind:"MAZE",id:Number(room.id),state:parseEnvironment(room.mechanicsState)};
  }
  const character = await tx.orm.public.Character.where({id:characterId}).first();
  if (!character) throw new Error("CHARACTER_NOT_FOUND");
  return {kind:"PERSONAL",id:characterId,state:parseEnvironment(character.mechanicsState)};
}

export async function saveSkillEnvironment(tx:any, location:EnvironmentLocation, state:EnvironmentState) {
  switch(location.kind){
    case "COMBAT": return (tx.orm.public as any).CombatSession.where({id:location.id}).update({mechanicsState:state});
    case "MAZE": return (tx.orm.public as any).MazeRoom.where({id:location.id}).update({mechanicsState:state});
    case "PERSONAL": return tx.orm.public.Character.where({id:location.id}).update({mechanicsState:state});
  }
}

/** Debit the persisted mana pool. A null balance initializes to the current maximum once. */
export async function debitCharacterMana(tx:any, characterId:number, amount:number, maxMana:number) {
  if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isSafeInteger(maxMana) || maxMana < 0)
    throw new Error("MANA_INVALID");
  const resource = await tx.orm.public.CharacterResource.where({characterId}).first();
  if (!resource) throw new Error("MANA_RESOURCE_MISSING");
  const old = resource.currentMana == null ? null : Number(resource.currentMana);
  const balance = Math.max(0, Math.min(maxMana, old??maxMana));
  if (balance < amount) throw new Error("MANA_INSUFFICIENT");
  const after = balance - amount;
  // Optimistic update ensures simultaneous requests cannot both spend the same mana.
  const sql = old === null
    ? db.raw.sql`UPDATE public."characterResource" SET "currentMana"=${after} WHERE "characterId"=${characterId} AND "currentMana" IS NULL`
    : db.raw.sql`UPDATE public."characterResource" SET "currentMana"=${after} WHERE "characterId"=${characterId} AND "currentMana"=${old}`;
  const result = await tx.execute(sql.affectedCount().build());
  if (result.affectedRows !== 1) throw new Error("MANA_CHANGED");
  return after;
}

/** Run exactly once when a skill transitions from inactive to active. */
export async function activateSkillMechanics(tx:any, skill:any, characterId:number, maxMana:number) {
  const mechanics = (skill.mechanics??{}) as SkillMechanics;
  const error = validateSkillMechanics(mechanics,Number(skill.id));
  if (error) throw new Error(error);
  const approved = await (tx.orm.public as any).Skill.where({characterId,status:"APPROVED"}).all();
  if (mechanics.parentSkillId && !approved.some((s:any)=>Number(s.id)===mechanics.parentSkillId))
    throw new Error("MISSING_PARENT_SKILL");
  const states = await (tx.orm.public as any).CharacterSkillState.where({characterId,active:true}).all();
  const activeSkillIds = states.map((s:any)=>Number(s.skillId));
  const location = await locateSkillEnvironment(tx,characterId);
  const ctx:MechanicsContext = {
    actor:"PLAYER",event:"ACTIVATE",sourceSkillId:Number(skill.id),ownerCharacterId:characterId,
    approvedSkillIds:approved.map((s:any)=>Number(s.id)),activeSkillIds,
    distances:location.state.distances,
  };
  if (!conditionsMet(mechanics.activationConditions??[],location.state,ctx))
    throw new Error("MECHANIC_CONDITION_FAILED");
  const result = applyMechanicEvent(location.state,mechanics,ctx);
  // Legacy skill ticking is only an accumulation toggle: do not retroactively
  // charge existing skills until they explicitly opt in to the mechanics engine.
  const hasExecutableRules=(Array.isArray(mechanics.rules) && mechanics.rules.length>0) || (Array.isArray(skill.effect) && skill.effect.some((e:any)=>e?.type==="ELEMENTAL_IMBUE"));
  const cost = hasExecutableRules ? Math.max(0,Number(skill.cost??0)) + result.manaInvestment : 0;
  const manaBalance = hasExecutableRules ? await debitCharacterMana(tx,characterId,cost,maxMana) : null;
  const environment=syncSkillImbuements(result.state,skill);
  if(hasExecutableRules) await saveSkillEnvironment(tx,location,environment);
  return {manaBalance,environment,environmentKind:location.kind};
}

/** Advance fields and apply approved passive or currently active turn rules. */
export function advanceCombatMechanics(
  existing:unknown, ownerCharacterId:number,
  skills:readonly any[], activeIds:readonly number[],
): EnvironmentState {
  let state = advanceEnvironmentTurn(parseEnvironment(existing));
  const approved=skills.filter(s=>String(s.status)==="APPROVED");
  const approvedIds=approved.map(s=>Number(s.id));
  for(const skill of approved) {
    if (String(skill.category)!=="PASSIVE" && !activeIds.includes(Number(skill.id))) continue;
    const mechanics=(skill.mechanics??{}) as SkillMechanics;
    if(validateSkillMechanics(mechanics,Number(skill.id))) continue;
    if(mechanics.parentSkillId && !approvedIds.includes(mechanics.parentSkillId)) continue;
    const ctx:MechanicsContext={
      actor:"PLAYER",event:"TURN",sourceSkillId:Number(skill.id),ownerCharacterId,
      approvedSkillIds:approvedIds,activeSkillIds:activeIds,distances:state.distances,
    };
    state=syncSkillImbuements(applyMechanicEvent(state,mechanics,ctx).state,skill);
  }
  return state;
}

export function encounterAgilityMultiplier(value:unknown, actor:"PLAYER"|"NPC"):number {
  return activeStatMultipliers(parseEnvironment(value),actor).AGI??1;
}

export function setActorDistance(existing:unknown, actor:"PLAYER"|"NPC", distance:number):EnvironmentState {
  if (!Number.isFinite(distance)||distance<0||distance>1000) throw new Error("DISTANCE_INVALID");
  const state=parseEnvironment(existing);
  return {...state,distances:{...state.distances,[actor]:distance}};
}

export async function readMaxMana(characterId:number):Promise<number> {
  const stats=await getEffectiveCharacterStats(characterId);
  return Math.max(0,Math.floor(Number(stats?.derived?.maxMana??0)));
}
