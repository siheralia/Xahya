import {cooldownTurns} from "@/lib/skills/cooldown";

export type CooldownStamp={turn:number;at:number};
export type CooldownLedger=Record<string,CooldownStamp>;
export type CooldownContext="COMBAT"|"MAZE"|"PERSONAL";

/** Outside combat, one turn is 100 skill ticks (100s) until turn-based scene
 * resolution is implemented. Within combat, turns come from the encounter. */
export const OUT_OF_COMBAT_TURN_MS=100000;

export type CooldownGate={allowed:boolean;remainingTurns:number;remainingMs:number;reason?:"COOLDOWN_ACTIVE"|"COOLDOWN_COMBAT_ONLY"};

export function cooldownAvailability(
 cooldown:string|null|undefined,duration:string|null|undefined,
 category:string|null|undefined,stamp:CooldownStamp|undefined,
 context:CooldownContext,turn:number,nowMs:number,
):CooldownGate {
 if(category==="PASSIVE"||!cooldown||cooldown==="Sin cooldown")
  return {allowed:true,remainingTurns:0,remainingMs:0};
 if(cooldown==="Una vez por combate"){
  if(context!=="COMBAT")
   return {allowed:false,remainingTurns:0,remainingMs:0,reason:"COOLDOWN_COMBAT_ONLY"};
  return stamp?{allowed:false,remainingTurns:0,remainingMs:0,reason:"COOLDOWN_ACTIVE"}
    :{allowed:true,remainingTurns:0,remainingMs:0};
 }
 const waitTurns=cooldownTurns(cooldown,duration);
 if(waitTurns===0||!stamp)return {allowed:true,remainingTurns:0,remainingMs:0};
 if(context==="COMBAT"){
  // Turn used + N intervening turns. Example: 1-turn cooldown used on turn 2
  // can be used again on turn 4.
  const remaining=Math.max(0,stamp.turn+waitTurns+1-turn);
  return remaining>0?{allowed:false,remainingTurns:remaining,remainingMs:0,reason:"COOLDOWN_ACTIVE"}
    :{allowed:true,remainingTurns:0,remainingMs:0};
 }
 const remainingMs=Math.max(0,stamp.at+waitTurns*OUT_OF_COMBAT_TURN_MS-nowMs);
 return remainingMs>0?{allowed:false,remainingTurns:Math.ceil(remainingMs/OUT_OF_COMBAT_TURN_MS),remainingMs,reason:"COOLDOWN_ACTIVE"}
   :{allowed:true,remainingTurns:0,remainingMs:0};
}

export function recordSkillCooldown(
 ledger:Readonly<CooldownLedger>|undefined,skillId:number,turn:number,nowMs:number,
):CooldownLedger {
 if(!Number.isSafeInteger(skillId)||skillId<=0)throw new Error("Identificador de habilidad inválido.");
 return {...(ledger??{}),[String(skillId)]:{turn,at:nowMs}};
}
