import {cloneLegacySkillAsMicro,evaluateLegacyShadowParts} from "./effects/legacy-modular-shadow.ts";
/** Maze passives are effects granted by approved RACIAL skills, not race names or client claims. */
export type RacialMazeBonuses = {
  trapEvasionPercent: number;
  treasureItemChancePercent: number;
  treasureMoneyBonusPercent: number;
};
type Effect = { type?: unknown; target?: unknown; value?: unknown };
type Skill = { status?: unknown; category?: unknown; grantedByRaceSkillId?: unknown; effect?: unknown };

export const EMPTY_RACIAL_MAZE_BONUSES: RacialMazeBonuses = {
  trapEvasionPercent: 0,
  treasureItemChancePercent: 0,
  treasureMoneyBonusPercent: 0,
};

const EFFECT_TARGETS: Record<keyof RacialMazeBonuses,{type:string;target:string}> = {
  trapEvasionPercent: {type:"MAZE_TRAP_EVASION",target:"TRAP"},
  treasureItemChancePercent: {type:"MAZE_TREASURE_ITEM_CHANCE",target:"TREASURE"},
  treasureMoneyBonusPercent: {type:"MAZE_TREASURE_MONEY_BONUS",target:"TREASURE"},
};
export function racialMazeBonuses(skills: readonly Skill[]): RacialMazeBonuses {
  const result={...EMPTY_RACIAL_MAZE_BONUSES};
  for(const skill of skills) {
    if(skill.status!=="APPROVED" || skill.category!=="PASSIVE"
      || !Number.isSafeInteger(Number(skill.grantedByRaceSkillId))
      || Number(skill.grantedByRaceSkillId)<=0 || !Array.isArray(skill.effect)) continue;
    // Execute the converted bonus modules for supported racial maze perks.
    const clone=cloneLegacySkillAsMicro({
      id:Number(skill.grantedByRaceSkillId),name:"Racial del laberinto",effect:skill.effect
    },"raceSkill");
    const mazeKeys:Record<string,keyof RacialMazeBonuses>={
      MAZE_TRAP_EVASION:"trapEvasionPercent",
      MAZE_ITEM_CHANCE:"treasureItemChancePercent",
      MAZE_MONEY_BONUS:"treasureMoneyBonusPercent",
    };
    if(clone.coverage==="COMPLETE" &&
      clone.parts.every(part=>["MAZE_TRAP_EVASION","MAZE_TREASURE_ITEM_CHANCE","MAZE_TREASURE_MONEY_BONUS"].includes(part.sourceType))){
      const intents=evaluateLegacyShadowParts(clone.parts);
      if(intents.length===clone.parts.length && intents.every(intent=>
        intent.kind==="BONUS" && mazeKeys[intent.stat]!==undefined)){
        for(const intent of intents){
          if(intent.kind==="BONUS" && intent.amount>0 && intent.amount<=100){
            const key=mazeKeys[intent.stat];
            result[key]=Math.max(result[key],intent.amount);
          }
        }
        continue;
      }
    }
    for(const raw of skill.effect as Effect[]) {
      if(!raw || typeof raw!=="object")continue;
      const power=Number(raw.value);
      if(!Number.isFinite(power)||power<=0||power>100)continue;
      for(const [key,entry] of Object.entries(EFFECT_TARGETS) as Array<[keyof RacialMazeBonuses,{type:string;target:string}]>) {
        if(raw.type===entry.type && raw.target===entry.target) result[key]=Math.max(result[key],power);
      }
    }
  }
  return result;
}

/** A single server-side roll when a character enters an active trap (not on page refresh). */
export function avoidsMazeTrap(chancePercent:number, random:number):boolean {
  if(!Number.isFinite(random)||random<0||random>=1)return false;
  return Number.isFinite(chancePercent) && chancePercent>0
    && random < Math.min(100,chancePercent)/100;
}
export function treasureItemChance(baseChance:number,bonusPercent:number):number {
  return Math.min(1,Math.max(0,baseChance+Math.min(100,Math.max(0,bonusPercent))/100));
}
export function treasureMoneyWithBonus(baseMoney:number,bonusPercent:number):number {
  if(!Number.isSafeInteger(baseMoney)||baseMoney<0)throw new Error("Recompensa inválida.");
  return Math.round(baseMoney*(1+Math.min(100,Math.max(0,bonusPercent))/100));
}
