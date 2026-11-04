/**
 * Global migration switch for all approved legacy abilities.
 *
 * MODULAR_FIRST: numeric micro evaluation is preferred after parity checks.
 *                  All unsupported mechanics keep the untouched legacy resolver.
 * LEGACY_ONLY:    revert the numerical execution immediately without changing
 *                  any skill, race, template, PCH, cooldown, or ownership row.
 *
 * The switch does not certify narrative-only actions or authorize unpriced
 * COMPOSED skills to run in combat.
 */
export const MODULAR_CUTOVER_KEY="skills.modular-cutover.v1" as const;
export type ModularCutoverMode="MODULAR_FIRST"|"LEGACY_ONLY";
export type ModularCutoverSetting={
  version:1;mode:ModularCutoverMode;revision:number;
  changedBy:number|null;changedAt:string|null;
};
export const DEFAULT_MODULAR_CUTOVER:ModularCutoverSetting={
  version:1,mode:"MODULAR_FIRST",revision:0,changedBy:null,changedAt:null,
};
export function readModularCutoverSetting(value:unknown):ModularCutoverSetting {
  if(typeof value!=="string")return {...DEFAULT_MODULAR_CUTOVER};
  try{
    const parsed=JSON.parse(value);
    if(!parsed||typeof parsed!=="object"||parsed.version!==1||
      !["MODULAR_FIRST","LEGACY_ONLY"].includes(parsed.mode)||
      !Number.isSafeInteger(parsed.revision)||parsed.revision<0||
      (parsed.changedBy!==null&&!Number.isSafeInteger(parsed.changedBy))||
      (parsed.changedAt!==null&&typeof parsed.changedAt!=="string"))
      return {...DEFAULT_MODULAR_CUTOVER};
    return {version:1,mode:parsed.mode,revision:parsed.revision,
      changedBy:parsed.changedBy,changedAt:parsed.changedAt};
  }catch{return {...DEFAULT_MODULAR_CUTOVER};}
}
export function decideModularExecution(
  mode:ModularCutoverMode,
  parityVerified:boolean,
):"MODULAR"|"LEGACY_FALLBACK"|"LEGACY_ROLLBACK"{
  if(mode==="LEGACY_ONLY")return "LEGACY_ROLLBACK";
  return parityVerified?"MODULAR":"LEGACY_FALLBACK";
}
