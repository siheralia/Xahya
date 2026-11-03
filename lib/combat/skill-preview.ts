/**
 * Phase 2.1 read-only adapter from the existing approved Skill rows to
 * combat presentation. Do not infer an executable action from a narrative
 * effect, nor confuse PCH construction cost with mana expenditure.
 *
 * Execution remains disabled until each effect is implemented in the
 * authoritative encounter transaction (phase 2.2).
 */
import {previewSkillExecution} from "./skill-casting.ts";
import {parseConfiguredSkillRange} from "./skill-range.ts";
export {parseConfiguredSkillRange} from "./skill-range.ts";
export type CombatSkillPreview = {
 id: number;
 name: string;
 category: string;
 description: string;
 manaCost: number;
 maintenanceCost: number;
 accumulationCost: number;
 attackType: "CUT" | "BLUNT" | "PIERCE" | null;
 defenseType: "CONCENTRATED" | "DISPERSED" | "SOLID" | null;
 area: string;
 rangeMeters: number | null;
 speed: string;
 duration: string | null;
 cooldown: string | null;
 effectTypes: string[];
 mechanicActions: string[];
 active: boolean;
 requirementsSatisfied: boolean;
 /** Only a strict set of implemented effects may be cast. */
 executable: boolean;
 skillKind?: "OFFENSE"|"SUPPORT"|null;
 needsAim?: boolean;
 usesMagic?: boolean;
 disabledReason?:string|null;
};

type SkillRecord = Record<string, unknown>;
type SkillStateRecord = {skillId?:unknown;active?:unknown};
const types=new Set(["CUT","BLUNT","PIERCE"]);
const defenses=new Set(["CONCENTRATED","DISPERSED","SOLID"]);


const nonnegativeInt=(x:unknown):number=>{
 const value=Number(x);
 return Number.isSafeInteger(value)&&value>=0?value:0;
};
const nonempty=(x:unknown,fallback=""):string=>
 typeof x==="string"&&x.trim()?x.trim():fallback;

export function combatSkillPreview(
 skill:SkillRecord,active=false,requirementsSatisfied=true,
):CombatSkillPreview|null {
 const id=Number(skill.id);
 if(String(skill.status)!=="APPROVED"||!Number.isSafeInteger(id)||id<=0)return null;
 const range=parseConfiguredSkillRange(skill.areaOfEffect);
 const attack=nonempty(skill.attackType);
 const defense=nonempty(skill.defenseType);
 const effects=Array.isArray(skill.effect)?skill.effect:[];
 const mechanics=skill.mechanics && typeof skill.mechanics==="object" && !Array.isArray(skill.mechanics)
   ? skill.mechanics as {rules?:unknown} : {};
 const rules=Array.isArray(mechanics.rules)?mechanics.rules:[];
 const effectTypes=[...new Set(effects
   .filter(e=>e&&typeof e==="object"&&typeof e.type==="string")
   .map(e=>(e as {type:string}).type))].slice(0,20);
 const mechanicActions=[...new Set(rules.flatMap(rule=>{
   if(!rule||typeof rule!=="object")return [];
   const actions=(rule as {actions?:unknown}).actions;
   if(!Array.isArray(actions))return [];
   return actions.filter(a=>a&&typeof a.kind==="string").map(a=>a.kind as string);
 }))].slice(0,30);
 return {
  id,name:nonempty(skill.name,"Habilidad "+id),
  category:nonempty(skill.category,"UTILITY"),
  description:nonempty(skill.description),
  manaCost:nonnegativeInt(skill.cost),
  maintenanceCost:nonnegativeInt(skill.maintenanceCost),
  accumulationCost:nonnegativeInt(skill.accumulationCost),
  attackType:types.has(attack)?attack as CombatSkillPreview["attackType"]:null,
  defenseType:defenses.has(defense)?defense as CombatSkillPreview["defenseType"]:null,
  area:range.area,rangeMeters:range.rangeMeters,
  speed:nonempty(skill.speed,"DEFAULT"),
  duration:nonempty(skill.duration)||null,
  cooldown:nonempty(skill.cooldown)||null,
  effectTypes,mechanicActions,
  active,requirementsSatisfied,
  ...previewSkillExecution(skill),
  executable:requirementsSatisfied&&previewSkillExecution(skill).executable,
  disabledReason:requirementsSatisfied?previewSkillExecution(skill).disabledReason:
    "Faltan requisitos por efecto para lanzar esta habilidad.",
 };
}

export function projectApprovedCombatSkills(
 rows:readonly SkillRecord[],states:readonly SkillStateRecord[],
 stolenIds:ReadonlySet<number>,
 meetsRequirements:(skill:SkillRecord,otherApproved:readonly SkillRecord[])=>boolean,
):CombatSkillPreview[] {
 const allowed=rows.filter(row=>String(row.status)==="APPROVED"
   && !stolenIds.has(Number(row.id)));
 const activeIds=new Set(states.filter(s=>s.active===true).map(s=>Number(s.skillId)));
 return allowed.map(skill=>combatSkillPreview(
   skill,activeIds.has(Number(skill.id)),
   meetsRequirements(skill,allowed.filter(s=>Number(s.id)!==Number(skill.id))),
 )).filter((s):s is CombatSkillPreview=>s!==null);
}
