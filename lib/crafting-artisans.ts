/** Artisan selection and deterministic material-efficiency for system-approved
 * recipes. No arbitrary item effects or output bonuses are created here.
 */
import type {CraftIngredient} from "./managed-crafting.ts";

type Position={id:number;businessId:number;active:boolean};
type Contract={id:number;positionId:number;characterId:number;active:boolean};
type Character={id:number;name:string};
export type CraftArtisan={characterId:number;name:string;source:"OWNER"|"EMPLOYEE"};
export type CraftQualityGrade="NORMAL"|"EXPERTO"|"MAESTRO";

export function eligibleCraftArtisans({
 ownerCharacterId,requiresEmployee,positions,contracts,characters
}:{
 ownerCharacterId:number;requiresEmployee:boolean;
 positions:readonly Position[];contracts:readonly Contract[];
 characters:readonly Character[];
}):CraftArtisan[]{
 const names=new Map(characters.map(c=>[c.id,c.name]));
 const list:CraftArtisan[]=[],seen=new Set<number>();
 const eligiblePositions=new Set(positions.filter(p=>p.active).map(p=>p.id));
 for(const contract of contracts){
  if(!contract.active||!eligiblePositions.has(contract.positionId)||
   !Number.isSafeInteger(contract.characterId)||contract.characterId<=0||
   seen.has(contract.characterId))continue;
  const name=names.get(contract.characterId);
  if(!name)continue;
  seen.add(contract.characterId);
  list.push({characterId:contract.characterId,name,source:"EMPLOYEE"});
 }
 if(!requiresEmployee&&!seen.has(ownerCharacterId)){
  const name=names.get(ownerCharacterId);
  if(name)list.unshift({characterId:ownerCharacterId,name,source:"OWNER"});
 }
 return list;
}

export type CraftQualityPlan={
 score:number;grade:CraftQualityGrade;efficiencyPercent:number;
 inputs:CraftIngredient[];savings:CraftIngredient[];
};
export function computeCraftQualityPlan(
 effective:Readonly<Record<string,number>>,ingredients:readonly CraftIngredient[]
):CraftQualityPlan{
 // Weighted stat use is fixed by the system and cannot come from the client:
 // intelligence is recipe understanding, wisdom is process control and agility
 // is manual handling. Values are capped to prevent multiplier explosions.
 const value=(key:string)=>{
  const n=effective[key];
  if(typeof n!=="number"||!Number.isFinite(n)||n<0)
   throw new Error("No están disponibles las estadísticas del artesano.");
  return Math.min(100,n);
 };
 const score=Math.max(0,Math.min(100,Math.floor(
  value("intelligence")*0.5+value("wisdom")*0.3+value("agility")*0.2
 )));
 const grade:CraftQualityGrade=score>=75?"MAESTRO":score>=40?"EXPERTO":"NORMAL";
 const divisor=grade==="MAESTRO"?4:grade==="EXPERTO"?5:Infinity;
 const savings:CraftIngredient[]=[],inputs:CraftIngredient[]=[];
 for(const ing of ingredients){
  if(!Number.isSafeInteger(ing.quantity)||ing.quantity<1||
   !Number.isSafeInteger(ing.itemId)||ing.itemId<=0)
   throw new Error("Ingrediente inválido en la receta.");
  // Never waive the entire ingredient. At most 25% of each material can
  // be saved, and a 1-unit requirement always costs one unit.
  const saved=Math.min(ing.quantity-1,Number.isFinite(divisor)?
   Math.floor(ing.quantity/divisor):0);
  inputs.push({itemId:ing.itemId,quantity:ing.quantity-saved});
  if(saved>0)savings.push({itemId:ing.itemId,quantity:saved});
 }
 return {
  score,grade,
  efficiencyPercent:grade==="MAESTRO"?25:grade==="EXPERTO"?20:0,
  inputs,savings
 };
}
