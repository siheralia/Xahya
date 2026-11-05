/** Shared, version-stable area labels stored in the existing areaOfEffect column.
 * No legacy description becomes a mechanical area unless it matches an explicit contract.
 * Reach remains a distinct field and is serialized by range-storage.
 */
export const SKILL_AREA_OPTIONS = [
 {value:"SINGLE",label:"Objetivo único"},
 {value:"SELF",label:"Personal (usuario)"},
 {value:"CONTACT",label:"Contacto"},
 {value:"CIRCLE",label:"Área circular"},
 {value:"STRIP",label:"Franja rectangular"},
 {value:"SELF_FIELD",label:"Campo alrededor del usuario"},
 {value:"UNSPECIFIED",label:"No especificada"},
] as const;
export type SkillAreaKind=typeof SKILL_AREA_OPTIONS[number]["value"]|"LEGACY";
export type StripDimensions={lengthMeters:number;widthMeters:number};
export type ParsedSkillArea={
 kind:SkillAreaKind;
 label:string;
 radiusMeters:number|null;
 lengthMeters?:number;
 widthMeters?:number;
 legacyValue?:string;
};
export const MIN_SKILL_AREA_RADIUS_METERS=0.1;
export const MAX_SKILL_AREA_RADIUS_METERS=10;
const canonicalLabels:Record<Exclude<SkillAreaKind,"LEGACY"|"CIRCLE"|"STRIP">,string>={
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
    number>MAX_SKILL_AREA_RADIUS_METERS||Math.abs(Math.round(number*100)-number*100)>1e-7)
  throw new Error("El radio debe estar entre 0,1 y 10 m, con hasta dos decimales.");
 return number;
}
/** The strip is a center-targeted rectangle, not a beam implicitly emitted by the caster.
 * Both dimensions are in meters; direction is chosen only when firing and kept server-side.
 */
export function validateStripDimensions(raw:unknown):StripDimensions {
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("La franja necesita largo y ancho.");
 const dimensions=raw as Record<string,unknown>;
 const lengthMeters=validateSkillAreaRadius(dimensions.lengthMeters);
 const widthMeters=validateSkillAreaRadius(dimensions.widthMeters);
 if(widthMeters>lengthMeters)throw new Error("El ancho de la franja no puede superar su largo.");
 return {lengthMeters,widthMeters};
}
export function formatSkillArea(kind:SkillAreaKind,dimensions?:unknown):string {
 if(kind==="CIRCLE")
  return "Área circular de "+numberText(validateSkillAreaRadius(dimensions))+" m";
 if(kind==="STRIP"){
  const {lengthMeters,widthMeters}=validateStripDimensions(dimensions);
  return "Franja de "+numberText(lengthMeters)+" m de largo y "+numberText(widthMeters)+" m de ancho";
 }
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
  try{
   const radiusMeters=validateSkillAreaRadius(circle[1]);
   return {kind:"CIRCLE",label:formatSkillArea("CIRCLE",radiusMeters),radiusMeters};
  }catch{/* Invalid historical dimensions remain literal. */}
 }
 const strip=/^Franja de (\d+(?:[.,]\d+)?) m de largo y (\d+(?:[.,]\d+)?) m de ancho$/i.exec(label);
 if(strip){
  try{
   const dims=validateStripDimensions({lengthMeters:Number(strip[1].replace(",",".")),widthMeters:Number(strip[2].replace(",","."))});
   return {kind:"STRIP",label:formatSkillArea("STRIP",dims),radiusMeters:null,...dims};
  }catch{/* Invalid historical dimensions remain literal. */}
 }
 return {kind:"LEGACY",label,legacyValue:label,radiusMeters:null};
}
export function normalizeSkillArea(value:unknown):string {
 const parsed=parseSkillArea(value);
 return parsed.kind==="LEGACY"?parsed.legacyValue!:parsed.label;
}
export function editorSkillArea(value:unknown):{kind:SkillAreaKind;radiusMeters:number;lengthMeters:number;widthMeters:number;legacyValue:string} {
 const parsed=parseSkillArea(value);
 return {kind:parsed.kind,radiusMeters:parsed.radiusMeters??3,
  lengthMeters:parsed.lengthMeters??4,widthMeters:parsed.widthMeters??1,
  legacyValue:parsed.legacyValue??""};
}
