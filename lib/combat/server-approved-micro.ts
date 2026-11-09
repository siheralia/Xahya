import {db} from "@/lib/db";
import {installEncounterMicroEffects,type CombatState,type Side} from "./turn-engine.ts";
import {approvedPassiveMicroSnapshot} from "./approved-passive-micro.ts";

/**
 * Encounter-creation-only, authenticated server database lookup.
 * Never accepts a skill graph from a request body or an encounter action.
 * Existing encounters keep their immutable module snapshot across edits.
 */
export async function snapshotApprovedEncounterPassives(
 original:CombatState,
):Promise<CombatState>{
 const Skill=(db.orm.public as any).Skill;
 const State=(db.orm.public as any).CharacterSkillState;
 if(!Skill)return original;
 let state=original;
 for(const side of ["PLAYER","NPC"] as Side[]){
  const characterId=state.actors[side].characterId;
  if(!Number.isSafeInteger(characterId)||!characterId||characterId<=0)continue;
  // Fetch only this combatant's own approved skills and explicit activation
  // state. A stolen skill has no authority even if its Skill row remains.
  const [rows,activations,stolen]=await Promise.all([
   Skill.where({characterId,status:"APPROVED"}).all(),
   State?State.where({characterId}).all():Promise.resolve([]),
   (async()=>{
    // The ORM query returns an awaitable AsyncIterableResult, not Promise<T[]>.
    const theft=db.raw.sql`
      SELECT "sourceSkillId" AS id FROM public."skillTheft"
      WHERE "victimCharacterId"=${characterId} AND status='ACTIVE'
    `.returnsRow({id:"pg/int4@1"}).build();
    const stolen=await db.runtime().query(theft) as Array<{id:number}>;
    return new Set(stolen.map(x=>Number(x.id)));
   })(),
  ]);
  const stolenIds=stolen;
  const selection=approvedPassiveMicroSnapshot(characterId,rows,activations,stolenIds);
  if(!selection.definitions.length)continue;
  // This helper may reject unsupported/invalid historical graphs; do not
  // freeze duels or execute an unvalidated fallback if that occurs.
  try{
   state=installEncounterMicroEffects(state,side,selection.definitions);
  }catch{
   // Fail closed for this side. A corrupt/unsupported recipe never grants
   // stats or a free heal.
  }
 }
 return state;
}
