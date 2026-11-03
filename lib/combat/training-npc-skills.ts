import {compileCombatSkill,type CombatSkillPlan} from "./skill-casting.ts";
import {genericTemplateChain,resolveGenericSkill,type GenericSkillTemplateRow} from "../skills/generic-catalog.ts";
import type {CombatAttackType} from "./ticks.ts";

/** Published generic templates, not another independently priced or scripted skill system. */
export function compileTrainingNpcSkills(rows:readonly GenericSkillTemplateRow[],npcAttackType:CombatAttackType):CombatSkillPlan[] {
 const result:CombatSkillPlan[]=[];
 for(const row of rows) {
  if(!row.enabled||row.elementChoice)continue;
  try{
   const chain=genericTemplateChain(rows,row.id);
   if(chain.some(t=>!t.enabled||t.elementChoice))continue;
   const resolved=resolveGenericSkill(rows,row.id).skill;
   if(Array.isArray(resolved.effectRequirements)&&resolved.effectRequirements.length)continue;
   const magic=Array.isArray(resolved.effect)&&resolved.effect.some((e:any)=>
     e?.type==="DAMAGE_MULTIPLIER"&&["MAGIC_ATK","MAGIC_ATTACK"].includes(String(e.target)));
   const physical=Array.isArray(resolved.effect)&&resolved.effect.some((e:any)=>
     e?.type==="DAMAGE_MULTIPLIER"&&["PHYS_ATK","PHYSICAL_ATTACK"].includes(String(e.target)));
   const range=Number(resolved.maxRangeMeters);
   if(!Number.isSafeInteger(range)||range<0||range>100)continue;
   // Generic templates do not store attackType. Use the NPC's physical stance
   // for strikes and the piercing projectile type for directed magical spells.
   // Contact at zero meters remains contact: no hidden range upgrades.
   const attackType=resolved.attackType??(magic?"PIERCE":physical?npcAttackType:undefined);
   const plan=compileCombatSkill({
    ...resolved,id:1_000_000_000+row.id,status:"APPROVED",
    name:row.name,attackType,
    areaOfEffect:String(resolved.areaOfEffect??"Objetivo único")+" | Alcance máximo: "+range+" m",
   });
   if(plan.category==="CONSTRUCTION"||plan.requiredParentSkillId||plan.rangeMeters===0&&plan.category==="OFFENSE")continue;
   result.push(plan);
  }catch {
   // Unsupported template stays published in the catalog, but NPC never casts
   // an effect that this combat resolver cannot execute completely.
  }
 }
 return result;
}

/** Variety without extra ability creation or PCH: take up to three compatible public spells. */
export function selectTrainingNpcSkills(plans:readonly CombatSkillPlan[],random:()=>number,limit=3):CombatSkillPlan[] {
 const selected:CombatSkillPlan[]=[];
 const take=(candidates:readonly CombatSkillPlan[])=>{
  const eligible=candidates.filter(p=>!selected.some(s=>s.id===p.id));
  if(!eligible.length||selected.length>=limit)return;
  const choice=Math.min(eligible.length-1,Math.floor(Math.max(0,Math.min(0.999999,random()))*eligible.length));
  selected.push(eligible[choice]);
 };
 take(plans.filter(p=>p.category==="OFFENSE"));
 take(plans.filter(p=>p.category==="SUPPORT"));
 while(selected.length<Math.min(limit,plans.length))take(plans);
 return selected;
}
