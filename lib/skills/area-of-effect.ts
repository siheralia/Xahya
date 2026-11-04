/**
 * Shared, version-stable representation of a skill's targeting footprint.
 * Kept in the existing areaOfEffect text column for backwards compatibility:
 * the separately configured reach is appended by range-storage.
 *
 * LEGACY is deliberately read-only in the editor: an unknown historical text
 * is never interpreted as a radius, ownership target, or execution permission.
 */
export const SKILL_AREA_OPTIONS = [
 {value:"SINGLE",label:"Objetivo único"},
 {value:"SELF",label:"Personal (usuario)"},
 {value:"CONTACT",label:"Contacto"},
 {value:"CIRCLE",label:"Área circular"},
 {value:"SELF_FIELD",label:"Campo alrededor del usuario"},
 {value:"UNSPECIFIED",label:"No especificada"},
] as const;
export type SkillAreaKind=typeof SKILL_AREA_OPTIONS[number]["value"]|"LEGACY";
export type ParsedSkillArea={
 kind:SkillAreaKind;
 label:string;
 radiusMeters:number|null;
 legacyValue?:string;
};
export const MIN_SKILL_AREA_RADIUS_METERS=0.1;
export const MAX_SKILL_AREA_RADIUS_METERS=10;
const canonicalLabels:Record<Exclude<SkillAreaKind,"LEGACY"|"CIRCLE">,string>={
 SINGLE:"Objetivo único",
 SELF:"Personal",
 CONTACT:"Contacto",
 SELF_FIELD:"Campo alrededor del usuario",
 UNSPECIFIED:"No especificada",
};
const stripReach=(value:unknown)=>(typeof value==="string"?value:"")
 .replace(/\s*\|\s*Alcance máximo:\s*\d+\s*m\s*$/i,"").trim();
const numberText=(n:number)=>String(Number(n.toFixed(2)));
export function validateSkillAreaRadius(value:unknown):number {
 const number=typeof value==="number"?value:Number(String(value).replace(",","."));
 if(!Number.isFinite(number)||number<MIN_SKILL_AREA_RADIUS_METERS||
    number>MAX_SKILL_AREA_RADIUS_METERS||Math.round(number*100)!==number*100)
  throw new Error("El radio debe estar entre 0,1 y 10 m, con hasta dos decimales.");
 return number;
}
export function formatSkillArea(kind:SkillAreaKind,radiusMeters?:unknown):string {
 if(kind==="CIRCLE")
  return "Área circular de "+numberText(validateSkillAreaRadius(radiusMeters))+" m";
 if(kind==="LEGACY")throw new Error("Una descripción antigua debe conservarse o reclasificarse.");
 if(Object.prototype.hasOwnProperty.call(canonicalLabels,kind))
  return canonicalLabels[kind as keyof typeof canonicalLabels];
 throw new Error("Tipo de área inválido.");
}
export function parseSkillArea(value:unknown):ParsedSkillArea {
 const label=stripReach(value);
 if(!label||/^(?:Sin especificar|No especificada)$/i.test(label))
  return {kind:"UNSPECIFIED",label:canonicalLabels.UNSPECIFIED,radiusMeters:null};
 if(/^(?:Objetivo único|Objetivo unico|Oponente único|Oponente unico)$/i.test(label))
  return {kind:"SINGLE",label:canonicalLabels.SINGLE,radiusMeters:null};
 if(/^(?:Personal|Usuario|Propio)$/i.test(label))
  return {kind:"SELF",label:canonicalLabels.SELF,radiusMeters:null};
 if(/^(?:Contacto|Oponente al contacto|Objetivo al contacto)$/i.test(label))
  return {kind:"CONTACT",label:canonicalLabels.CONTACT,radiusMeters:null};
 if(/^Campo alrededor del usuario$/i.test(label))
  return {kind:"SELF_FIELD",label:canonicalLabels.SELF_FIELD,radiusMeters:null};
 const circle=/^(?:área\s+circular\s+de\s+|círculo\s+de\s+|radio\s*(?::|de)?\s*)(\d+(?:[.,]\d+)?)\s*m(?:\s+de\s+radio)?$/i.exec(label);
 if(circle){
  try {
   const radiusMeters=validateSkillAreaRadius(circle[1]);
   return {kind:"CIRCLE",label:formatSkillArea("CIRCLE",radiusMeters),radiusMeters};
  }catch {
   // Keep invalid old values visible as legacy rather than guessing a radius.
  }
 }
 return {kind:"LEGACY",label,legacyValue:label,radiusMeters:null};
}
export function normalizeSkillArea(value:unknown):string {
 const parsed=parseSkillArea(value);
 return parsed.kind==="LEGACY"?parsed.legacyValue!:parsed.label;
}
/** Structured editor state can be created without transforming any legacy data. */
export function editorSkillArea(value:unknown):{kind:SkillAreaKind;radiusMeters:number;legacyValue:string} {
 const parsed=parseSkillArea(value);
 return {kind:parsed.kind,radiusMeters:parsed.radiusMeters??3,legacyValue:parsed.legacyValue??""};
}
