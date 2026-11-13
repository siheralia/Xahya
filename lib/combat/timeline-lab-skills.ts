/**
 * Server-only skill gateway for opt-in V2 training.
 *
 * Never accept a client-authored plan, damage multiplier, micro graph,
 * caster identity or spell cost. Only the same staff-approved, currently
 * available combat skills that V1 would authorize may enter the V2 clock.
 */
import {db} from "../db";
import {compileCombatSkill,type CombatSkillPlan} from "./skill-casting.ts";
import {readModularCutover} from "../effects/modular-cutover-registry";
import {meetsEffectRequirements} from "../skills/effect-requirements";

export type LabSkillSummary={
 id:number;name:string;cost:number;
 category:"OFFENSE"|"SUPPORT"|"SUMMON"|"CONSTRUCTION";usesMagic:boolean;
 requiresPath:boolean;needsCenter:boolean;
};
const eligible=(plan:CombatSkillPlan)=>
 plan.category==="OFFENSE"||
 plan.category==="SUPPORT"&&!!plan.approvedActivation||
 plan.category==="SUMMON"&&!!plan.summons?.length||
 plan.category==="CONSTRUCTION"&&!!plan.construction;

async function stolenSkillIds(characterId:number):Promise<Set<number>>{
 const q=db.raw.sql`
   SELECT "sourceSkillId" AS "id" FROM public."skillTheft"
   WHERE "victimCharacterId"=${characterId} AND status='ACTIVE'
 `.returnsRow({id:"pg/int4@1"}).build();
 const records=await db.runtime().query(q) as Array<{id:number}>;
 return new Set(records.map(x=>Number(x.id)));
}

/**
 * Read and validate the user's own approved skill catalog. Does not
 * mutate the DB. The actual CAST uses this again INSIDE the session lock,
 * preventing stale approval or activation from authorizing a new action.
 */
async function skillPlans(characterId:number,tx:any):Promise<Map<number,CombatSkillPlan>>{
 if(!Number.isSafeInteger(characterId)||characterId<1)
   throw new Error("El personaje de combate no es válido.");
 const Skill=tx.orm.public.Skill;
 const SkillState=(tx.orm.public as any).CharacterSkillState;
 const [available,stolen,cutover,activations]=await Promise.all([
   Skill.where({characterId,status:"APPROVED"}).all(),
   stolenSkillIds(characterId),readModularCutover(),
   SkillState?SkillState.where({characterId}).all():Promise.resolve([]),
 ]);
 const disabled=new Set((activations as any[])
   .filter(x=>x.active===false).map(x=>Number(x.skillId)));
 const result=new Map<number,CombatSkillPlan>();
 for(const row of available){
   const skillId=Number(row.id);
   if(stolen.has(skillId))continue;
   const others=available.filter((x:any)=>Number(x.id)!==skillId&&
     !stolen.has(Number(x.id)));
   if(!meetsEffectRequirements(
      Array.isArray(row.effectRequirements)?row.effectRequirements:[],
      others))continue;
   let plan:CombatSkillPlan;
   try{plan=compileCombatSkill(row as Record<string,unknown>,cutover.mode);}
   catch{continue;}
   if(!eligible(plan))continue;
   if(plan.requiredParentSkillId&&!others.some((x:any)=>
     Number(x.id)===plan.requiredParentSkillId))continue;
   if((plan.approvedActivation||plan.approvedHostileStatus||
       plan.approvedHybridContact)&&disabled.has(skillId))continue;
   result.set(skillId,plan);
 }
 return result;
}
export async function approvedLabSkillPlan(
 characterId:number,skillId:number,tx:any,
):Promise<CombatSkillPlan>{
 if(!Number.isSafeInteger(skillId)||skillId<1)
   throw new Error("Habilidad inválida.");
 const plan=(await skillPlans(characterId,tx)).get(skillId);
 if(!plan)throw new Error("Esta habilidad no está aprobada, disponible o soportada en V2.");
 return plan;
}
export async function listApprovedLabSkills(
 characterId:number,tx:any=db,
):Promise<LabSkillSummary[]>{
 const plans=await skillPlans(characterId,tx);
 return [...plans.values()].map(plan=>({
   id:plan.id,name:plan.name,cost:plan.cost,
   category:plan.category as "OFFENSE"|"SUPPORT"|"SUMMON"|"CONSTRUCTION",
   usesMagic:plan.usesMagic===true,
   requiresPath:plan.category==="OFFENSE"&&
     plan.usesMagic!==true&&plan.attackArea?.shape!=="SELF_FIELD",
   needsCenter:plan.category==="CONSTRUCTION"||
     plan.category==="OFFENSE"&&
       (plan.usesMagic===true||Boolean(plan.attackArea&&
         plan.attackArea.shape!=="SELF_FIELD")),
 })).sort((a,b)=>a.name.localeCompare(b.name,"es"));
}
