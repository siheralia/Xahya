import { db } from "@/lib/db";
import { readStatisticsCatalog, CORE_BASIC_STAT_KEYS } from "@/lib/stats/dynamic";
import { calculateConfiguredDerivedStats } from "@/lib/stats/engine";
import { applyDerivedItemEffects } from "@/lib/stats/derived";
import { getPerkEffects } from "@/lib/perks";

const CORE_CODES: Record<string,string> = {strength:"STR",agility:"AGI",constitution:"CON",intelligence:"INT",wisdom:"WIS",charisma:"CHA",spirit:"SPI",luck:"LCK"};
const DERIVED_CODES: Record<string,string> = {maxHp:"HP",maxMana:"MANA",physicalAttack:"PHYS_ATK",magicAttack:"MAGIC_ATK",physicalDefense:"DEF",magicDefense:"MAG_DEF",precision:"PRECISION",critical:"CRITICAL",discovery:"DISCOVERY",miracle:"MIRACLE",intimidation:"INTIMIDATION",conquest:"CONQUEST",race:"RACE",dodge:"DODGE",stealth:"STEALTH",detection:"DETECTION"};

export async function getEffectiveCharacterStats(characterId:number, source:any=db) {
  const legacy = await source.orm.public.CharacterStat.where({characterId}).first();
  if (!legacy) return null;
  const catalog = await readStatisticsCatalog(source);
  const Model = source.orm.public.CharacterStatValue;
  const rows:any[] = Model ? await Model.where({characterId}).all() : [];
  const basicDefinitions = catalog.filter((entry)=>entry.kind==="basic" && entry.active!==false);
  const basicKeys = new Set([...CORE_BASIC_STAT_KEYS].filter((key)=>!catalog.some((entry)=>entry.key===key&&entry.active===false)).concat(basicDefinitions.map((entry)=>entry.key)));
  const codeByKey:Record<string,string> = {...CORE_CODES,...Object.fromEntries(basicDefinitions.map((entry)=>[entry.key,entry.code||entry.key]))};
  const activeDerived = catalog.filter((entry)=>entry.kind==="derived"&&entry.active!==false);
  const derivedCodes = {...Object.fromEntries(Object.entries(DERIVED_CODES).filter(([key])=>!catalog.some((entry)=>entry.key===key&&entry.active===false))),...Object.fromEntries(activeDerived.map((entry)=>[entry.key,entry.code||entry.key]))};
  const aliases:Record<string,string> = Object.fromEntries(Object.entries(derivedCodes).flatMap(([key,code])=>[[key,key],[code,key]]));
  const activeTargets = new Set([...Object.keys(codeByKey).filter((key)=>basicKeys.has(key)).flatMap((key)=>[key,codeByKey[key]]),...Object.entries(derivedCodes).flatMap(([key,code])=>[key,code])]);
  const validStatTarget = (target:string)=>activeTargets.has(target);
  const modifiers = await source.orm.public.CharacterModifier.where({characterId}).all();
  const active = modifiers.filter((entry:any)=>!entry.expiresAt || new Date(String(entry.expiresAt)).getTime()>Date.now());
  const CharacterItem = source.orm.public.CharacterItem;
  const Item = source.orm.public.Item;
  const owned = CharacterItem ? await CharacterItem.where({characterId}).all() : [];
  const items = Item ? await Item.all() : [];
  const effects = owned.filter((entry:any)=>Boolean(entry.equipped)).flatMap((entry:any)=>{
    const item=items.find((candidate:any)=>Number(candidate.id)===Number(entry.itemId));
    return (Array.isArray(item?.effects)?item.effects:[]).map((effect:any)=>({type:String(effect.type),stat:String(effect.stat??""),value:Number(effect.value)}));
  });
  const CharacterPerk = source.orm.public.CharacterPerk;
  const Perk = source.orm.public.Perk;
  const assigned = CharacterPerk ? await CharacterPerk.where({characterId}).all() : [];
  const perkDefinitions = Perk ? await Perk.all() : [];
  const perks = getPerkEffects(assigned.map((entry:any)=>({...entry,perk:perkDefinitions.find((perk:any)=>Number(perk.id)===Number(entry.perkId))})));
  const validEffects = effects.filter((effect:any)=>!["stat_bonus","stat_multiplier"].includes(effect.type)||validStatTarget(effect.stat)||effect.stat==="ATTACK_TOTAL");
  const validPerks = perks.filter((effect:any)=>!["STAT_BONUS","STAT_MULTIPLIER"].includes(String(effect.type))||validStatTarget(String(effect.target??""))||effect.target==="ATTACK_TOTAL");
  const base:Record<string,number> = {};
  const breakdown:Record<string,{base:number;value:number;karmaBonus:number;objectFlatBonus:number;combinedMultiplier:number}> = {};
  for(const key of basicKeys) {
    const definition=basicDefinitions.find((entry)=>entry.key===key);
    const stored=rows.find((entry:any)=>String(entry.statKey)===key);
    const initial=Number(stored?.value??(CORE_BASIC_STAT_KEYS.has(key)?legacy[key]:definition?.defaultValue)??0);
    const original=Number.isFinite(initial)?initial:0;
    const matches=(target:string)=>target===key||target===codeByKey[key];
    const flat=active.filter((entry:any)=>String(entry.stat)===key&&String(entry.source)!=="KARMA_BOOST").reduce((sum:number,entry:any)=>sum+Number(entry.amount),0);
    const karma=active.filter((entry:any)=>String(entry.stat)===key&&String(entry.source)==="KARMA_BOOST").reduce((sum:number,entry:any)=>sum+Number(entry.amount),0);
    const multiplier=active.filter((entry:any)=>String(entry.stat)===key+"_multiplier").reduce((sum:number,entry:any)=>sum+Number(entry.amount)/100,0);
    const bonus=validEffects.filter((entry:any)=>entry.type==="stat_bonus"&&matches(entry.stat)).reduce((sum:number,entry:any)=>sum+entry.value,0)+validPerks.filter((entry:any)=>entry.type==="STAT_BONUS"&&matches(String(entry.target))).reduce((sum:number,entry:any)=>sum+Number(entry.value),0);
    const itemFactors=validEffects.filter((entry:any)=>entry.type==="stat_multiplier"&&matches(entry.stat)).map((entry:any)=>entry.value);
    const perkFactors=validPerks.filter((entry:any)=>entry.type==="STAT_MULTIPLIER"&&matches(String(entry.target))).map((entry:any)=>Number(entry.value));
    const combinedMultiplier=(1+multiplier)*([...itemFactors,...perkFactors].length ? [...itemFactors,...perkFactors].reduce((sum:number,factor:number)=>sum+factor,0) : 1);
    base[key]=original*combinedMultiplier+flat+bonus+karma;
    breakdown[key]={base:original,value:base[key],karmaBonus:karma,objectFlatBonus:flat+bonus,combinedMultiplier};
  }
  let derived=await calculateConfiguredDerivedStats(base as any,source);
  // Resolve only active derived targets; do not fall back to legacy aliases for disabled stats.
  const derivedItemEffects = validEffects.filter((entry:any)=>
    (entry.type==="stat_bonus"||entry.type==="stat_multiplier") && Boolean(aliases[entry.stat])
  ).map((entry:any)=>({...entry,stat:aliases[entry.stat]}));
  derived=applyDerivedItemEffects(derived,derivedItemEffects,aliases);
  for(const effect of validPerks){
    const type=String(effect.type), target=String(effect.target??""), amount=Number(effect.value);
    if(!Number.isFinite(amount)) continue;
    const key=aliases[target]??aliases[target.toUpperCase()];
    if(type==="RESOURCE_BONUS"&&target==="HP") derived.maxHp+=amount;
    else if(type==="RESOURCE_BONUS"&&target==="MANA") derived.maxMana+=amount;
    else if(key&&type==="STAT_BONUS") derived[key]=(derived[key]??0)+amount;
    else if(key&&type==="STAT_MULTIPLIER") derived[key]=(derived[key]??0)*amount;
  }
  const attackMultiplier=validEffects.filter((entry:any)=>entry.type==="stat_multiplier"&&entry.stat==="ATTACK_TOTAL").reduce((sum:number,entry:any)=>sum+entry.value,0) || 1;
  derived.physicalAttack*=attackMultiplier;
  derived.magicAttack*=attackMultiplier;
  return {effectiveStats:base,derived,statBreakdown:breakdown};
}
