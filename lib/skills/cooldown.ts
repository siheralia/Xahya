/** Shared cooldown contract for skill quotes, editors, and activation. */
export const COOLDOWN_OPTIONS = [
  {value:"Sin cooldown",percent:0},
  {value:"1 turno",percent:5},
  {value:"2 turnos",percent:10},
  {value:"3 turnos",percent:15},
  {value:"5 turnos",percent:20},
  {value:"10 turnos",percent:30},
  {value:"Una vez por combate",percent:35},
  {value:"Igual a duración",percent:null},
] as const;

/** Only catalog values can receive a PCH discount. */
export function isConfiguredCooldown(value:unknown):boolean {
  return typeof value==="string" && COOLDOWN_OPTIONS.some(option=>option.value===value);
}

const byTurns=(turns:number):number =>
  turns>=10?30:turns>=5?20:turns>=3?15:turns>=2?10:turns>=1?5:0;

/** Explicit finite duration; "No termina" and instantaneous skills get no discount. */
export function cooldownDurationTurns(duration:string|null|undefined):number {
  const found=/^(\d+) turnos?$/.exec(String(duration??"").trim());
  if(!found)return 0;
  const n=Number(found[1]);
  return Number.isSafeInteger(n)&&n>0&&n<=1000?n:0;
}

export function cooldownTurns(cooldown:string|null|undefined,duration:string|null|undefined):number {
  if(cooldown==="Igual a duración")return cooldownDurationTurns(duration);
  const parsed=/^(1|2|3|5|10) turnos?$/.exec(String(cooldown??""));
  return parsed?Number(parsed[1]):0;
}

export function cooldownDiscountPercent(cooldown:string|null|undefined,duration:string|null|undefined,category?:string|null):number {
  // A passive auto-activates on its conditions, so a cooldown must not discount its permanent PCH.
  if(category==="PASSIVE")return 0;
  if(cooldown==="Igual a duración")return byTurns(cooldownDurationTurns(duration));
  return COOLDOWN_OPTIONS.find(option=>option.value===cooldown)?.percent??0;
}

/** Applied after range/speed/mana and before effect-requirement discounts. */
export function applyCooldownPch(
  originalPch:number,cooldown:string|null|undefined,duration:string|null|undefined,category?:string|null,
):number {
  if(!Number.isSafeInteger(originalPch)||originalPch<0)throw new Error("PCH de cooldown inválido.");
  if(originalPch===0)return 0;
  const discount=Math.floor(originalPch*cooldownDiscountPercent(cooldown,duration,category)/100);
  return Math.max(1,originalPch-discount);
}

export function cooldownDiscountPch(originalPch:number,cooldown:string|null|undefined,duration:string|null|undefined,category?:string|null):number {
  return originalPch-applyCooldownPch(originalPch,cooldown,duration,category);
}
