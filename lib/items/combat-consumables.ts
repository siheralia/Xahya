/** Server-compiled consumables: no client-provided HP/mana restoration amounts. */
export type CombatConsumableEffect="HEAL_HP"|"RESTORE_MANA";
export type CombatConsumable={
 itemId:number;characterItemId?:number;name:string;
 action:CombatConsumableEffect;amount:number;quantity:number;
};
type ItemRow=Record<string,unknown>;
type OwnedRow=Record<string,unknown>;
export function compileCombatConsumable(raw:ItemRow):Omit<CombatConsumable,"quantity"|"characterItemId">|null {
 if(raw.itemType!=="CONSUMABLE")return null;
 const effects=Array.isArray(raw.effects)?raw.effects:[];
 if(effects.length!==1)return null; // Combined items require a separate approved resolver.
 const effect=effects[0] as Record<string,unknown>|null;
 if(!effect||effect.type!=="system_action"||
  !["HEAL_HP","RESTORE_MANA"].includes(String(effect.action)))return null;
 const amount=Number(effect.value),itemId=Number(raw.id);
 if(!Number.isSafeInteger(itemId)||itemId<1||!Number.isSafeInteger(amount)||amount<1||amount>1000)
  return null;
 return {itemId,name:String(raw.name??"Consumible").slice(0,100),
  action:effect.action as CombatConsumableEffect,amount};
}
export function characterCombatConsumables(
 catalog:readonly ItemRow[],owned:readonly OwnedRow[],
):CombatConsumable[]{
 const byId=new Map(catalog.map(item=>[Number(item.id),compileCombatConsumable(item)]));
 return owned.flatMap(entry=>{
  const recipe=byId.get(Number(entry.itemId)),quantity=Number(entry.quantity),characterItemId=Number(entry.id);
  if(!recipe||!Number.isSafeInteger(quantity)||quantity<1||
   !Number.isSafeInteger(characterItemId)||characterItemId<1)return [];
  return [{...recipe,characterItemId,quantity}];
 });
}
/** Exactly one HP and one mana potion per training NPC, chosen at random
 * among available approved recipes for each kind; nothing enters real inventory.
 */
export function npcStartingConsumables(
 catalog:readonly ItemRow[],random:()=>number,
):CombatConsumable[]{
 const recipes=catalog.map(compileCombatConsumable).filter(
  (x):x is NonNullable<typeof x>=>Boolean(x));
 return (["HEAL_HP","RESTORE_MANA"] as const).flatMap(action=>{
  const options=recipes.filter(x=>x.action===action);
  if(!options.length)return [];
  const index=Math.floor(Math.max(0,Math.min(0.999999,random()))*options.length);
  return [{...options[index],quantity:1}];
 });
}
