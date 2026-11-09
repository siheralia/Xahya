import { db } from "@/lib/db";
import { readStatisticsCatalog, CORE_BASIC_STAT_KEYS } from "@/lib/stats/dynamic";
import { calculateConfiguredDerivedStats } from "@/lib/stats/engine";
import { getPerkEffects } from "@/lib/perks";
import {activeStatMultipliers,parseEnvironment} from "@/lib/skills/interaction-engine";
import {combatWearableStatSnapshots,WEARABLE_DIRECT_COMBAT_STATS} from "@/lib/combat/wearable-stat-bonus";
import {buildEquipmentDerivedReplay} from "@/lib/combat/equipment-derived-replay";
import {buildEquipmentBasicReplay,type BasicFormulaInput} from "@/lib/combat/equipment-basic-replay";
import {buildEquipmentResourceReplay} from "@/lib/combat/equipment-resource-replay";

const CORE_CODES: Record<string,string> = {strength:"STR",agility:"AGI",constitution:"CON",intelligence:"INT",wisdom:"WIS",charisma:"CHA",spirit:"SPI",luck:"LCK"};

type NumericPassiveEffect = {type:"STAT_BONUS"|"STAT_MULTIPLIER";target:string;value:number};

/** A narrative condition is not an executable predicate. Only permanent/in-combat
 * wording is safe to resolve from the combat snapshot; others stay inactive. */
function appliesThroughCombat(condition:unknown):boolean {
  if(condition===null||condition===undefined||condition==="")return true;
  if(typeof condition!=="string")return false;
  const normalized=condition.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[.!]+$/,"").trim();
  return ["siempre","permanente","en combate","durante el combate","mientras este en combate"].includes(normalized);
}

/** Passive numeric effects are read from the character's actual approved Skill rows.
 * Their percentages use the skill convention 150 = ×1.5 (unlike item factors).
 * The same ability ID is counted once, and conditional/advanced activation
 * rules are never assumed to be satisfied just because a duel begins.
 */
async function readCombatPassiveStatEffects(characterId:number,source:any):Promise<NumericPassiveEffect[]> {
  const Skill=source.orm.public.Skill;
  if(!Skill)return [];
  const approved=await Skill.where({characterId,status:"APPROVED"}).all();
  const ids=new Set(approved.map((skill:any)=>Number(skill.id)));
  const seen=new Set<number>();
  const effects:NumericPassiveEffect[]=[];
  for(const skill of approved){
    const id=Number(skill.id);
    if(skill.category!=="PASSIVE"||!Number.isSafeInteger(id)||seen.has(id))continue;
    seen.add(id);
    if(!appliesThroughCombat(skill.condition))continue;
    // A skill automatically granted by a racial *perk* must not duplicate that
    // perk's own stat bonus, already included by the CharacterPerk resolver.
    if(Number(skill.grantedByRacePerkId)>0)continue;
    if(Array.isArray(skill.effectRequirements)&&skill.effectRequirements.length>0)continue;
    if(Array.isArray(skill.requiredSkillIds)&&skill.requiredSkillIds.some((required:unknown)=>!ids.has(Number(required))))continue;
    const mechanics=skill.mechanics&&typeof skill.mechanics==="object"&&!Array.isArray(skill.mechanics)?skill.mechanics:{};
    if((Array.isArray(mechanics.rules)&&mechanics.rules.length>0)||
      (Array.isArray(mechanics.activationConditions)&&mechanics.activationConditions.length>0)||
      mechanics.variableResistance)continue;
    if(mechanics.parentSkillId!==undefined&&mechanics.parentSkillId!==null&&!ids.has(Number(mechanics.parentSkillId)))continue;
    if(!Array.isArray(skill.effect))continue;
    for(const raw of skill.effect){
      if(!raw||typeof raw!=="object"||Array.isArray(raw))continue;
      const type=raw.type;
      if(type!=="STAT_BONUS"&&type!=="STAT_MULTIPLIER")continue;
      const target=typeof raw.target==="string"?raw.target.trim():"";
      const value=raw.value;
      if(!target||typeof value!=="number"||!Number.isFinite(value)||value<=0||value>100000)continue;
      effects.push({type,target,value:type==="STAT_MULTIPLIER"?value/100:value});
    }
  }
  return effects;
}

/** Resolve the active character context without hardcoding any ability name. */
async function readMechanicStatFactors(characterId:number, source:any):Promise<Record<string,number>> {
  const Combat=(source.orm.public as any).CombatSession;
  if(Combat){
    const sessions=await Combat.where({playerCharacterId:characterId,status:"ACTIVE"}).all();
    const current=sessions.sort((a:any,b:any)=>Number(b.id)-Number(a.id))[0];
    if(current)return activeStatMultipliers(parseEnvironment(current.mechanicsState),"PLAYER");
  }
  const Position=(source.orm.public as any).MazeCharacterPosition;
  const position=Position?await Position.where({characterId,status:"ACTIVE"}).first():null;
  if(position){
    const Room=(source.orm.public as any).MazeRoom;
    const room=Room?await Room.where({id:Number(position.roomId)}).first():null;
    if(room)return activeStatMultipliers(parseEnvironment(room.mechanicsState),"PLAYER");
  }
  const Character=(source.orm.public as any).Character;
  const character=Character?await Character.where({id:characterId}).first():null;
  return activeStatMultipliers(parseEnvironment(character?.mechanicsState),"PLAYER");
}



/** Regular sheets and maze statistics stay unchanged. Combat passives are a
 * fresh, immutable fighter snapshot, resolved only for new duels.
 */
export async function getEffectiveCharacterStats(characterId:number, source:any=db, options:{combatPassives?:boolean}={}) {
  const legacy = await source.orm.public.CharacterStat.where({characterId}).first();
  if (!legacy) return null;
  const catalog = await readStatisticsCatalog(source);
  const Model = source.orm.public.CharacterStatValue;
  const rows:any[] = Model ? await Model.where({characterId}).all() : [];
  const basicDefinitions = catalog.filter((entry)=>entry.kind==="basic" && entry.active!==false);
  const basicKeys = new Set([...CORE_BASIC_STAT_KEYS].filter((key)=>!catalog.some((entry)=>entry.key===key&&entry.active===false)).concat(basicDefinitions.map((entry)=>entry.key)));
  const codeByKey:Record<string,string> = {...CORE_CODES,...Object.fromEntries(basicDefinitions.map((entry)=>[entry.key,entry.code||entry.key]))};
  const activeDerived = catalog.filter((entry)=>entry.kind==="derived"&&entry.active!==false);
  const derivedCodes = Object.fromEntries(activeDerived.map((entry)=>[entry.key,entry.code||entry.key]));
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
  const passiveEffects=options.combatPassives
    ?(await readCombatPassiveStatEffects(characterId,source)).filter(effect=>
      validStatTarget(effect.target)||effect.target==="ATTACK_TOTAL")
    :[];
  const mechanicFactors=await readMechanicStatFactors(characterId,source);
  const base:Record<string,number> = {};
  // Capture each input *while* the authoritative calculator has it. Combat
  // must not reverse-engineer formulas from already-multiplied stats.
  const basicFormulaInputs:Record<string,BasicFormulaInput>={};
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
    const bonus=validEffects.filter((entry:any)=>entry.type==="stat_bonus"&&matches(entry.stat)).reduce((sum:number,entry:any)=>sum+entry.value,0)+validPerks.filter((entry:any)=>entry.type==="STAT_BONUS"&&matches(String(entry.target))).reduce((sum:number,entry:any)=>sum+Number(entry.value),0)+passiveEffects.filter(effect=>effect.type==="STAT_BONUS"&&matches(effect.target)).reduce((sum,effect)=>sum+effect.value,0);
    const itemFactors=validEffects.filter((entry:any)=>entry.type==="stat_multiplier"&&matches(entry.stat)).map((entry:any)=>entry.value);
    const perkFactors=validPerks.filter((entry:any)=>entry.type==="STAT_MULTIPLIER"&&matches(String(entry.target))).map((entry:any)=>Number(entry.value));
    const passiveFactors=passiveEffects.filter(effect=>effect.type==="STAT_MULTIPLIER"&&matches(effect.target)).map(effect=>effect.value);
    const factors=[...itemFactors,...perkFactors,...passiveFactors];
    const combinedMultiplier=(1+multiplier)*(factors.length ? factors.reduce((sum:number,factor:number)=>sum+factor,0) : 1);
    const mechanicMultiplier=mechanicFactors[codeByKey[key]]??mechanicFactors[key.toUpperCase()]??1;
    base[key]=(original*combinedMultiplier+flat+bonus+karma)*mechanicMultiplier;
    if(options.combatPassives)basicFormulaInputs[key]={
      original,modifier:1+multiplier,flat:flat+bonus+karma,factors,mechanic:mechanicMultiplier,
    };
    breakdown[key]={base:original,value:base[key],karmaBonus:karma,objectFlatBonus:flat+bonus,combinedMultiplier:combinedMultiplier*mechanicMultiplier};
  }
  let derived=await calculateConfiguredDerivedStats(base as any,source);
  // A genuine configured-derived baseline, before item/perk/passive factors.
  // Copy it for encounter-only factor replay, never invert later damage.
  const unmodifiedDerived={...derived};
  // Resolve only active derived targets; do not fall back to legacy aliases for disabled stats.
  // Combine item and perk factors per derived stat before applying them.
  // Xahya rule: ×2 + ×3 = ×5, not ×6. Flat bonuses are added afterward.
  const derivedModifiers = new Map<string, { factors: number[]; bonus: number }>();
  const addDerived = (type: string, target: string, amount: number) => {
    const key = aliases[target] ?? aliases[target.toUpperCase()];
    if (!key || !Number.isFinite(amount)) return;
    const entry = derivedModifiers.get(key) ?? { factors: [], bonus: 0 };
    if (type === "STAT_MULTIPLIER") entry.factors.push(amount);
    if (type === "STAT_BONUS") entry.bonus += amount;
    derivedModifiers.set(key, entry);
  };
  for (const effect of validEffects) {
    addDerived(String(effect.type).toUpperCase(), String(effect.stat), Number(effect.value));
  }
  const externalResourceBonuses={maxHp:0,maxMana:0};
  for (const effect of validPerks) {
    const type = String(effect.type), target = String(effect.target ?? ""), amount = Number(effect.value);
    if (type === "RESOURCE_BONUS" && target === "HP" && Number.isFinite(amount)){
      derived.maxHp+=amount;
      externalResourceBonuses.maxHp+=amount;
    }else if (type === "RESOURCE_BONUS" && target === "MANA" && Number.isFinite(amount)){
      derived.maxMana+=amount;
      externalResourceBonuses.maxMana+=amount;
    }else addDerived(type, target, amount);
  }
  for (const effect of passiveEffects) addDerived(effect.type,effect.target,effect.value);
  const derivedStatMultipliers:Record<string,number>={};
  for (const [key, modifier] of derivedModifiers) {
    const factor = modifier.factors.length ? modifier.factors.reduce((sum, value) => sum + value, 0) : 1;
    derivedStatMultipliers[key]=factor;
    derived[key] = Number(derived[key] ?? 0) * factor + modifier.bonus;
  }
  for(const [key,code] of Object.entries(derivedCodes)) {
    const mechanicMultiplier=mechanicFactors[code]??mechanicFactors[key.toUpperCase()];
    if(mechanicMultiplier!==undefined && Number.isFinite(Number(derived[key]))){
      derived[key]*=mechanicMultiplier;
      derivedStatMultipliers[key]=(derivedStatMultipliers[key]??1)*mechanicMultiplier;
    }
  }
  const attackFactors=[...validEffects.filter((entry:any)=>entry.type==="stat_multiplier"&&entry.stat==="ATTACK_TOTAL").map((entry:any)=>entry.value),...validPerks.filter((entry:any)=>entry.type==="STAT_MULTIPLIER"&&entry.target==="ATTACK_TOTAL").map((entry:any)=>Number(entry.value)),...passiveEffects.filter(effect=>effect.type==="STAT_MULTIPLIER"&&effect.target==="ATTACK_TOTAL").map(effect=>effect.value)];
  const attackMultiplier=attackFactors.length?attackFactors.reduce((sum:number,factor:number)=>sum+factor,0):1;
  derived.physicalAttack*=attackMultiplier;
  derived.magicAttack*=attackMultiplier;
  if(options.combatPassives){
    derivedStatMultipliers.physicalAttack=(derivedStatMultipliers.physicalAttack??1)*attackMultiplier;
    derivedStatMultipliers.magicAttack=(derivedStatMultipliers.magicAttack??1)*attackMultiplier;
  }
  // Capture only mathematically reversible, direct derived flat bonuses.
  // They are added after derived multipliers, so only global mechanics and
  // ATTACK_TOTAL multiply their actual contribution. No base-stat,
  // resource or multiplicative effects are approximated.
  const combatWearableStatBonuses=options.combatPassives?combatWearableStatSnapshots(
    owned,items,aliases,Object.fromEntries(WEARABLE_DIRECT_COMBAT_STATS.map(key=>{
      const code=derivedCodes[key];
      const mechanic=code===undefined?1:
        mechanicFactors[code]??mechanicFactors[key.toUpperCase()]??1;
      return [key,mechanic*(key==="physicalAttack"||key==="magicAttack"?attackMultiplier:1)];
    })),
  ):[];
  // The new replay preserves the *whole* direct-derived modifier formula
  // (factors and flat bonuses together). Real armor/accessory copies can then
  // be disabled without inverting multiplicative stats or erasing other buffs.
  // Existing direct-flat snapshots remain as a safe legacy fallback when an
  // older combat has no replay model.
  const wearableCopies=options.combatPassives?owned.flatMap((entry:any)=>{
    const definition=items.find((item:any)=>Number(item.id)===Number(entry.itemId));
    const id=Number(entry.id),itemId=Number(entry.itemId);
    if(entry.equipped!==true||Number(entry.quantity)!==1||
       !Number.isSafeInteger(id)||id<1||
       !Number.isSafeInteger(itemId)||itemId<1||
       !["ARMOR","ACCESSORY"].includes(String(definition?.itemType)))return [];
    return [{
      characterItemId:id,itemId,
      effects:(Array.isArray(definition.effects)?definition.effects:[]).map((effect:any)=>({
        type:String(effect.type),stat:String(effect.stat??""),value:Number(effect.value),
      })),
    }];
  }):[];
  const combatEquipmentDerivedReplay=options.combatPassives&&wearableCopies.length
    ?buildEquipmentDerivedReplay({
      unmodifiedDerived,currentDerived:derived,
      derivedModifiers:Object.fromEntries(derivedModifiers),
      attackFactors,
      mechanicByStat:Object.fromEntries(WEARABLE_DIRECT_COMBAT_STATS.map(key=>{
        const code=derivedCodes[key];
        return [key,code===undefined?1:
          mechanicFactors[code]??mechanicFactors[key.toUpperCase()]??1];
      })),
      activeDerivedAliases:aliases,copies:wearableCopies,
    }):null;
  // HP and mana maxima use the same approved derived configuration, but they
  // are not ordinary combat stats: their current pools must not increase when
  // a repaired item increases the maximum.
  const combatResourceCapacityReplay=options.combatPassives&&wearableCopies.length
    ?buildEquipmentResourceReplay({
      unmodifiedDerived,currentDerived:derived,
      derivedModifiers:Object.fromEntries(derivedModifiers),
      externalResourceBonuses,
      mechanicByStat:Object.fromEntries(["maxHp","maxMana"].map(key=>{
        const code=derivedCodes[key];
        return [key,code===undefined?1:
          mechanicFactors[code]??mechanicFactors[key.toUpperCase()]??1];
      })),
      activeDerivedAliases:aliases,copies:wearableCopies,
    }):null;
  if(combatEquipmentDerivedReplay&&combatResourceCapacityReplay)
    combatEquipmentDerivedReplay.resourceReplay=combatResourceCapacityReplay;
  // Upgrade the derived replay only if the *same configured formula snapshot*
  // and per-copy basic math reproduce the live values exactly. Failed/legacy
  // formulas keep the previously validated derived-only behavior.
  if(combatEquipmentDerivedReplay){
    const basicReplay=buildEquipmentBasicReplay({
      source:basicFormulaInputs,currentBasic:base,referenceDerived:unmodifiedDerived,
      catalog,codeByKey,wearableCopies,
    });
    if(basicReplay)combatEquipmentDerivedReplay.basicReplay=basicReplay;
  }
  return {effectiveStats:base,derived,statBreakdown:breakdown,derivedStatMultipliers,
    combatWearableStatBonuses,combatEquipmentDerivedReplay};
}

/** Opt in explicitly from new-combat snapshot and its karma delta calculation. */
export async function getEffectiveCombatCharacterStats(characterId:number,source:any=db){
  return getEffectiveCharacterStats(characterId,source,{combatPassives:true});
}
