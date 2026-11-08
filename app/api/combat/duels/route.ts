import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { getEffectiveCombatCharacterStats } from "@/lib/stats/effective";
import { calculateConfiguredDerivedStats } from "@/lib/stats/engine";
import { readMechanics } from "@/lib/stats/mechanics";
import { canAct, massDefaultKg, newCombatState, reconcileWearableBonusesAtCombatStart, weaponIntegrityDefault, type CombatFighter } from "@/lib/combat/turn-engine";
import { progressTrainingNpc } from "@/lib/combat/npc-policy";
import { combatClientView } from "@/lib/combat/magic-area";
import { varyTrainingNpcStats } from "@/lib/combat/training-npc";
import { applyTrainingDifficulty, parseTrainingDifficulty, trainingBaseStats } from "@/lib/combat/training-difficulty";
import {selectTrainingIdentity,allTrainingPerks,applyTrainingBasePerks,applyTrainingDerivedPerks,trainingResourceBonus} from "@/lib/combat/training-identity";
import {compileTrainingNpcSkills,selectTrainingNpcSkills} from "@/lib/combat/training-npc-skills";
import { canApproveCombat } from "@/lib/combat/permissions";
import { racialDamageFactors,perkDamageFactors,mergeDamageTakenFactors } from "@/lib/combat/innate-traits";
import { getPerkEffects } from "@/lib/perks";
import {characterCombatConsumables,npcStartingConsumables} from "@/lib/items/combat-consumables";
import {compileWeaponAutoRepair} from "@/lib/items/auto-repair";
import {snapshotEquippedWearables} from "@/lib/items/combat-wearables";

async function snapshotEquippedWeapons(characterId:number):Promise<{
  main:CombatFighter["equippedWeapon"];offhand:CombatFighter["offhandWeapon"]
}>{
  const CharacterItem=(db.orm.public as any).CharacterItem;
  const Item=(db.orm.public as any).Item;
  const Material=(db.orm.public as any).Material;
  if(!CharacterItem||!Item)return {main:undefined,offhand:undefined};
  const owned=await CharacterItem.where({characterId}).all();
  const result:{main:CombatFighter["equippedWeapon"];offhand:CombatFighter["offhandWeapon"]}={
    main:undefined,offhand:undefined
  };
  for(const slot of ["MAIN_HAND","OFF_HAND"] as const) {
    const equipped=owned.find((entry:any)=>entry.equipped&&entry.equippedSlot===slot);
    if(!equipped)continue;
    const item=await Item.where({id:Number(equipped.itemId)}).first();
    if(!item||item.itemType!=="WEAPON"||!["CUT","BLUNT","PIERCE"].includes(String(item.attackType)))continue;
    const effective=Number(item.effectiveRangeMeters??1.5);
    const maximum=Number(item.maximumRangeMeters??effective);
    const throwRange=Number(item.throwRangeMeters??0);
    if(!Number.isFinite(effective)||effective<=0||!Number.isFinite(maximum)||maximum<effective||
      !Number.isFinite(throwRange)||throwRange<0)continue;
    const weapon={
      name:String(item.name),attackType:String(item.attackType) as "CUT"|"BLUNT"|"PIERCE",
      mode:item.weaponMode==="RANGED"?"RANGED" as const:"MELEE" as const,
      effectiveRangeMeters:effective,maximumRangeMeters:maximum,
      throwable:Boolean(item.throwable)&&throwRange>0,throwRangeMeters:throwRange,
       itemId:Number(item.id),characterItemId:Number(equipped.id),
       durability:Math.max(0,Math.min(100,Number(equipped.durability??100)))
    } as NonNullable<CombatFighter["equippedWeapon"]>;
    // Copy staff-managed item passives into the immutable combat equipment
    // snapshot. Invalid historical effects are ignored, not executed.
    try{
      const repair=compileWeaponAutoRepair(item.effects,String(item.itemType));
      if(repair)weapon.autoRepair=repair;
    }catch{}
    if(item.materialId!=null){
      const material=await Material.where({id:Number(item.materialId)}).first();
      if(material){
        const resistance=Number(material.physicalResistance);
        weapon.materialName=String(material.name);
        // Physical resistance affects weapon wear, not incoming HP damage.
        // Zero/unset means neutral 100 until its material is configured.
        if(Number.isFinite(resistance)&&resistance>=0&&resistance<=1_000_000)
          weapon.materialPhysicalResistance=resistance;
      }
      const perkId=Number(material?.bonusAgainstPerkId),bonus=Number(material?.bonusAgainstPerkAttack);
      if(Number.isSafeInteger(perkId)&&perkId>0&&Number.isSafeInteger(bonus)&&bonus>0&&bonus<=10000)
        weapon.materialPerkBonus={perkId,attackBonus:bonus};
    }
    if(slot==="MAIN_HAND")result.main=weapon;
    else result.offhand=weapon;
  }
  return result;
}

const numeric = (n:unknown, fallback=0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
async function racialTraitsForCharacter(characterId:number) {
  const [skills,assigned,definitions]=await Promise.all([
    db.orm.public.Skill.where({characterId,status:"APPROVED"}).all(),
    db.orm.public.CharacterPerk.where({characterId}).all(),
    db.orm.public.Perk.where({active:true}).all(),
  ]);
  const byId=new Map(definitions.map(perk=>[Number(perk.id),perk]));
  const equipped=assigned.flatMap(entry=>{
    const perk=byId.get(Number(entry.perkId));
    return perk?[{...entry,perk}]:[];
  });
  return {
    damageTakenFactors:mergeDamageTakenFactors(
      racialDamageFactors(skills),
      perkDamageFactors(getPerkEffects(equipped)),
    ),
    perkIds:[...new Set(equipped.map(entry=>Number(entry.perkId)).filter(id=>Number.isSafeInteger(id)&&id>0))],
  };
}
async function currentUser() {
  const {userId}=await auth();
  if(!userId)return null;
  return (await db.orm.public.User.all()).find(u=>u.clerkId===userId)??null;
}
export async function GET() {
 const user=await currentUser();
 if(!user)return NextResponse.json({error:"Sin sesión."},{status:401});
 const canApprovePvP=await canApproveCombat(user);
 const all=await db.orm.public.Character.all();
 const own=all.filter(c=>Number(c.userId)===Number(user.id));
 const chars=canApprovePvP?all:own;
 const characters=chars.map(c=>({id:Number(c.id),name:String(c.name),mine:Number(c.userId)===Number(user.id)}));
 return NextResponse.json({characters,canApprovePvP});
}
function buildFighter(name:string, characterId:number|null, base:Record<string,number>,
 derived:Record<string,number>, weaponType:unknown="CUT", defenseType:unknown="SOLID",
 fieldType:unknown="CONCENTRATED", fieldDescription:unknown=null):CombatFighter {
  const aType=["CUT","BLUNT","PIERCE"].includes(String(weaponType)) ? weaponType as CombatFighter["attackType"]:"CUT";
  const dType=["CONCENTRATED","DISPERSED","SOLID"].includes(String(defenseType)) ? defenseType as CombatFighter["defenseType"]:"SOLID";
  const mType=["CONCENTRATED","DISPERSED","SOLID"].includes(String(fieldType))
    ? fieldType as NonNullable<CombatFighter["magicFieldType"]>:"CONCENTRATED";
  return {
    characterId,name,hp:Math.max(1,Math.floor(numeric(derived.maxHp,10))),
    maxHp:Math.max(1,Math.floor(numeric(derived.maxHp,10))),
    agility:Math.max(1,numeric(base.agility,1)),strength:numeric(base.strength),
    constitution:numeric(base.constitution),precision:numeric(derived.precision),
    dodge:numeric(derived.dodge),physicalAttack:numeric(derived.physicalAttack),
    physicalDefense:numeric(derived.physicalDefense),magicAttack:numeric(derived.magicAttack),
    magicDefense:numeric(derived.magicDefense),critical:numeric(derived.critical),
    luck:numeric(base.luck),race:numeric(derived.race),
    massKg:massDefaultKg,positionMeters:characterId===null?1.5:0,attackType:aType,defenseType:dType,
    magicFieldType:mType,
    magicFieldDescription:typeof fieldDescription==="string"?fieldDescription.slice(0,500):null,
    weaponIntegrity:weaponIntegrityDefault,spentTicks:0,spentAp:0,
  };
}
export async function POST(req:Request) {
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Sin sesión."},{status:401});
  const body=await req.json().catch(()=>null);
  const characterId=Number(body?.characterId);
  if(!Number.isSafeInteger(characterId)||characterId<1)
    return NextResponse.json({error:"Personaje inválido."},{status:400});
  const character=await db.orm.public.Character.where({id:characterId}).first();
  const gm=await canApproveCombat(user);
  if(!character || (!gm && Number(character.userId)!==Number(user.id)))
    return NextResponse.json({error:"Sin permiso sobre este personaje."},{status:403});
  const first=await getEffectiveCombatCharacterStats(characterId);
  if(!first)return NextResponse.json({error:"Faltan estadísticas del personaje."},{status:400});
  const mechanics=await readMechanics();
  const player=buildFighter(String(character.name),characterId,first.effectiveStats,first.derived,
    (character as any).magicAttackType,(character as any).blockDefenseType,
    (character as any).fieldDefenseType,(character as any).fieldDefenseDescription);
  player.speedValue=numeric(first.effectiveStats[mechanics.combatSpeed]??first.derived[mechanics.combatSpeed],player.agility);
  const playerTraits=await racialTraitsForCharacter(characterId);
  player.damageTakenFactors=playerTraits.damageTakenFactors;
  player.perkIds=playerTraits.perkIds;
  const playerWeapons=await snapshotEquippedWeapons(characterId);
  player.equippedWeapon=playerWeapons.main;
  player.offhandWeapon=playerWeapons.offhand;
  // Snapshot actual defensive-weapon wear at the start of each encounter.
  player.weaponIntegrity=playerWeapons.main?.durability??playerWeapons.offhand?.durability??weaponIntegrityDefault;
  player.heightMeters=Math.max(0.3,numeric((character as any).height,170)/100);
  player.unarmedReachMeters=Math.round(player.heightMeters*0.45*100)/100;
  const opponentId=Number(body?.opponentCharacterId??0);
  let opponent:CombatFighter;
  let trainingDifficulty:ReturnType<typeof parseTrainingDifficulty>="INTERMEDIATE";
  if(!(Number.isSafeInteger(opponentId)&&opponentId>0)) {
    try { trainingDifficulty=parseTrainingDifficulty(body?.npcDifficulty); }
    catch {return NextResponse.json({error:"Dificultad de entrenamiento inválida."},{status:400});}
  }
  let opponentManaMax=0;
  let rivalWearableStatBonuses:typeof first.combatWearableStatBonuses=[];
  let trainingIdentity:ReturnType<typeof selectTrainingIdentity>|null=null;
  let npcPlans:ReturnType<typeof compileTrainingNpcSkills>=[];
  if(Number.isSafeInteger(opponentId) && opponentId>0) {
    // A GM must initiate PvP. Both owners may act afterward.
    if(!gm)return NextResponse.json({error:"El PvP requiere que un GM inicie el encuentro."},{status:403});
    if(opponentId===characterId)return NextResponse.json({error:"Un personaje no puede enfrentarse consigo mismo."},{status:400});
    const rival=await db.orm.public.Character.where({id:opponentId}).first();
    const stats=await getEffectiveCombatCharacterStats(opponentId);
    if(!rival||!stats)return NextResponse.json({error:"Oponente no encontrado."},{status:404});
    rivalWearableStatBonuses=stats.combatWearableStatBonuses;
    opponent=buildFighter(String(rival.name),opponentId,stats.effectiveStats,stats.derived,
      (rival as any).magicAttackType,(rival as any).blockDefenseType,
      (rival as any).fieldDefenseType,(rival as any).fieldDefenseDescription);
    const rivalWeapons=await snapshotEquippedWeapons(opponentId);
    opponent.equippedWeapon=rivalWeapons.main;
    opponent.offhandWeapon=rivalWeapons.offhand;
    opponent.weaponIntegrity=rivalWeapons.main?.durability??rivalWeapons.offhand?.durability??weaponIntegrityDefault;
    opponent.heightMeters=Math.max(0.3,numeric((rival as any).height,170)/100);
    opponent.unarmedReachMeters=Math.round(opponent.heightMeters*0.45*100)/100;
    opponentManaMax=Math.max(0,Math.floor(numeric(stats.derived.maxMana)));
    opponent.positionMeters=1.5;
    opponent.speedValue=numeric(stats.effectiveStats[mechanics.combatSpeed]??stats.derived[mechanics.combatSpeed],opponent.agility);
    const rivalTraits=await racialTraitsForCharacter(opponentId);
    opponent.damageTakenFactors=rivalTraits.damageTakenFactors;
    opponent.perkIds=rivalTraits.perkIds;
  } else {
    // Fair sparring partner: mirror the challenger's effective base stats,
    // then let a GM override specific values for a scripted NPC.
    const base={
      strength:Math.max(1,numeric(first.effectiveStats.strength,10)),
      agility:Math.max(1,numeric(first.effectiveStats.agility,10)),
      constitution:Math.max(1,numeric(first.effectiveStats.constitution,10)),
      intelligence:Math.max(1,numeric(first.effectiveStats.intelligence,10)),
      wisdom:Math.max(1,numeric(first.effectiveStats.wisdom,10)),
      charisma:Math.max(1,numeric(first.effectiveStats.charisma,10)),
      spirit:Math.max(1,numeric(first.effectiveStats.spirit,10)),
      luck:Math.max(1,numeric(first.effectiveStats.luck,10)),
    };
    if(gm && body?.npcStats && typeof body.npcStats==="object") {
      for(const key of Object.keys(base) as Array<keyof typeof base>) {
        const supplied=Number(body.npcStats[key]);
        if(Number.isFinite(supplied))base[key]=Math.max(0,Math.min(10000,supplied));
      }
    }
    // A small, server-generated variation makes each training opponent unique.
    // Preserve mirrored AGI/speed so equal-speed initiative can still be tested.
    const scripted=gm&&body?.npcStats&&typeof body.npcStats==="object";
    const npcBase=scripted
      ? base:varyTrainingNpcStats(base,()=>randomInt(1_000_000)/1_000_000,mechanics.combatSpeed);
    // Choose only active races and perks from the actual database. All effects are
    // encounter-only: no Character, CharacterPerk or currency writes.
    const [races,perks,links,templates]=await Promise.all([
      db.orm.public.Race.where({active:true}).all(),
      db.orm.public.Perk.where({active:true}).all(),
      db.orm.public.RacePerk.all(),
      (db.orm.public as any).GenericSkillTemplate.all(),
    ]);
    trainingIdentity=selectTrainingIdentity(races,perks,links,
      ()=>randomInt(1_000_000)/1_000_000);
    const difficultyBase=trainingBaseStats(npcBase,trainingDifficulty,mechanics.combatSpeed);
    const npcPerks=allTrainingPerks(trainingIdentity);
    const perkedBase=applyTrainingBasePerks(difficultyBase,npcPerks);
    const derived=await calculateConfiguredDerivedStats(perkedBase);
    opponent=buildFighter(String(body?.npcName||"Oponente de entrenamiento").slice(0,60)+" · "+trainingIdentity.race.name,
      null,perkedBase,derived,"CUT","SOLID",
      (character as any).fieldDefenseType);
    opponent=applyTrainingDerivedPerks(applyTrainingDifficulty(opponent,trainingDifficulty),npcPerks);
    opponent.damageTakenFactors=perkDamageFactors(npcPerks.flatMap(perk=>perk.effects));
    opponent.perkIds=[...new Set(npcPerks.map(perk=>perk.id))];
    // Resource perks only increase the encounter snapshot, not the character sheet.
    const bonusHp=trainingResourceBonus(npcPerks,"HP");
    opponent.maxHp=Math.max(1,opponent.maxHp+bonusHp);
    opponent.hp=opponent.maxHp;
    npcPlans=selectTrainingNpcSkills(compileTrainingNpcSkills(templates.map((t:any)=>({
      id:Number(t.id),name:String(t.name),description:t.description??null,
      parentTemplateId:t.parentTemplateId==null?null:Number(t.parentTemplateId),
      payload:t.payload??{},elementChoice:Boolean(t.elementChoice),enabled:Boolean(t.enabled),
    })),opponent.attackType),()=>randomInt(1_000_000)/1_000_000);
    opponentManaMax=Math.max(0,Math.floor(numeric(derived.maxMana))+trainingResourceBonus(npcPerks,"MANA"));
    opponent.massKg=massDefaultKg;
    opponent.heightMeters=player.heightMeters;
    opponent.unarmedReachMeters=player.unarmedReachMeters;
    // Sparring mirrors the challenger’s *effective* speed even when the
    // configured combat-speed formula is a derived stat of varied attributes.
    const speedPerk=npcPerks.some(p=>p.effects.some(e=>
      ({"AGI":"agility","STR":"strength","CON":"constitution","INT":"intelligence",
        "WIS":"wisdom","CHA":"charisma","SPI":"spirit","LUCK":"luck"} as Record<string,string>)[e.target]===mechanics.combatSpeed
      ||e.target.toLowerCase()===mechanics.combatSpeed));
    opponent.speedValue=scripted||speedPerk
      ? numeric((perkedBase as Record<string,number>)[mechanics.combatSpeed]??(derived as Record<string,number>)[mechanics.combatSpeed],opponent.agility)
      : player.speedValue;
  }
  // Server-side random tie-break prevents a permanent first-mover advantage.
  // The next round opens with the other fighter, then alternates.
  const starter=randomInt(2)===0?"PLAYER":"NPC";
  const dice=()=>({hit:randomInt(1_000_000)/1_000_000,
    critical:randomInt(1_000_000)/1_000_000,defense:randomInt(1_000_000)/1_000_000});
  const initial=newCombatState(player,opponent,starter);
  if(trainingIdentity)initial.trainingNpc={
    difficulty:trainingDifficulty,race:trainingIdentity.race,
    racialPerks:trainingIdentity.racialPerks.map(p=>({id:p.id,name:p.name,mechanical:p.mechanical})),
    extraPerks:trainingIdentity.extraPerks.map(p=>({id:p.id,name:p.name,mechanical:p.mechanical})),skills:npcPlans,
  };
  // Encounter-local mana snapshots: costs are persisted with the combat
  // transaction, never deducted from the shared character sheet in a test.
  const firstMax=Math.max(0,Math.floor(numeric(first.derived.maxMana)));
  const ownerResource=await db.orm.public.CharacterResource.where({characterId}).first();
  const rivalResource=opponent.characterId!==null
    ? await db.orm.public.CharacterResource.where({characterId:opponent.characterId}).first()
    : null;
  const snapshot=(stored:unknown,maximum:number)=>{
    const n=stored===null||stored===undefined?maximum:Number(stored);
    return Math.max(0,Math.min(maximum,Number.isFinite(n)?Math.floor(n):maximum));
  };
  initial.mana={
    PLAYER:{current:snapshot(ownerResource?.currentMana,firstMax),max:firstMax},
    NPC:{current:snapshot(rivalResource?.currentMana,opponentManaMax),max:opponentManaMax},
  };
  // Real characters snapshot their own inventory. Training NPCs get exactly one
  // potion of each type selected randomly from the purchasable catalog.
  const Item=(db.orm.public as any).Item;
  const CharacterItem=(db.orm.public as any).CharacterItem;
  const Material=(db.orm.public as any).Material;
  const [catalog,materials,ownerCopies]=await Promise.all([
    Item.all(),Material?Material.all():[],CharacterItem.where({characterId}).all(),
  ]);
  const rivalCopies=opponent.characterId!==null
    ?await CharacterItem.where({characterId:opponent.characterId}).all():[];
  // Only staff-defined configurations bound to actual equipped copies enter
  // the immutable encounter snapshot. Synthetic NPCs own no persistent gear.
  initial.actors.PLAYER.equippedWearables=snapshotEquippedWearables(catalog,ownerCopies,materials,
    first.combatWearableStatBonuses);
  initial.actors.NPC.equippedWearables=opponent.characterId!==null
    ?snapshotEquippedWearables(catalog,rivalCopies,materials,
        rivalWearableStatBonuses):[];
  // The effective stats resolver initially counted every equipped copy.
  // Explicitly drop bonuses from copies already broken before round one.
  reconcileWearableBonusesAtCombatStart(initial,"PLAYER");
  reconcileWearableBonusesAtCombatStart(initial,"NPC");
  initial.consumables={
    PLAYER:characterCombatConsumables(catalog,ownerCopies),
    NPC:opponent.characterId!==null
      ?characterCombatConsumables(catalog,rivalCopies)
      :npcStartingConsumables(catalog.filter((item:any)=>item.acquisitionType==="PURCHASABLE"),
        ()=>randomInt(1_000_000)/1_000_000),
  };
  const state=progressTrainingNpc(initial,dice,
    ()=>randomInt(1_000_000)/1_000_000);
  const Session=(db.orm.public as any).CombatSession;
  const session=await Session.create({
    playerCharacterId:characterId,npcName:opponent.name,
    npcStats:{opponentCharacterId:opponent.characterId,...(trainingIdentity?{
      difficulty:trainingDifficulty,raceId:trainingIdentity.race.id,
      racialPerkIds:trainingIdentity.racialPerks.map(p=>p.id),
      extraPerkIds:trainingIdentity.extraPerks.map(p=>p.id),
      genericTemplateIds:npcPlans.map(p=>p.id-1_000_000_000),
    }: {})},
    currentTick:state.tick,turn:state.round,
    activeActor:state.pending?.against??(canAct(state,"PLAYER")?"PLAYER":"NPC"),
    status:state.status,lastAction:{combatV1:state},
    playerNextActionTick:state.actors.PLAYER.spentTicks,
    npcNextActionTick:state.actors.NPC.spentTicks,
  });
  return NextResponse.json({id:Number(session.id),state:combatClientView(state)},{status:201});
}
