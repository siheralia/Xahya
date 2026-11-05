/** Material catalog: material resistance is used for BLOCK wear, and an
 * approved perk-targeted bonus is used for eligible equipped physical attacks.
 * Hardness, magic resistance and general attack/defense grants do not yet
 * affect combat formulas.
 */
export const MATERIAL_TYPES=[
 {value:"WOOD",label:"Madera"},
 {value:"METAL",label:"Metal"},
 {value:"MINERAL",label:"Mineral"},
 {value:"LIQUID",label:"Líquido"},
 {value:"PLANT",label:"Planta"},
 {value:"BONE",label:"Hueso"},
 {value:"SKIN",label:"Piel"},
 {value:"CLOTH",label:"Tela"},
] as const;
// Initial fallback labels only; accepted types are verified against materialType
// records in the database, never against this hardcoded initial catalog.
export type MaterialType=string;
export type MaterialDraft={
 name:string;type:MaterialType;description:string|null;weightPerUnitKg:number|null;
 bonusAgainstPerkId:number|null;bonusAgainstPerkAttack:number;
 hardness:number;physicalResistance:number;magicResistance:number;
 attackGrant:number;defenseGrant:number;specialEffect:string|null;
 naturalForm:string|null;minimumForm:string|null;rawForm:string|null;marketForm:string|null;
 fireReaction:string|null;lightningReaction:string|null;iceReaction:string|null;active:boolean;
};
const descriptive=["description","specialEffect","naturalForm","minimumForm","rawForm","marketForm",
 "fireReaction","lightningReaction","iceReaction"] as const;
const integer=(value:unknown,min:number,max:number,name:string)=>{
 const n=Number(value);
 if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(name+" fuera de rango.");
 return n;
};
export function validateMaterialDraft(value:unknown):MaterialDraft {
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("Datos de material inválidos.");
 const raw=value as Record<string,unknown>;
 const name=String(raw.name??"").trim();
 if(name.length<1||name.length>100)throw new Error("El nombre debe tener de 1 a 100 caracteres.");
 const type=String(raw.type??"");
 if(!/^[A-Z][A-Z0-9_]{1,31}$/.test(type))throw new Error("Selecciona un tipo de material válido.");
 const description=Object.fromEntries(descriptive.map(key=>{
  if(raw[key]!=null&&typeof raw[key]!=="string")throw new Error("El campo "+key+" debe ser texto.");
  const content=String(raw[key]??"").trim();
  if(content.length>700)throw new Error("La descripción del material excede 700 caracteres.");
  return [key,content||null];
 })) as Record<typeof descriptive[number],string|null>;
 const weight=raw.weightPerUnitKg===""||raw.weightPerUnitKg==null?null:Number(raw.weightPerUnitKg);
 if(weight!==null&&(!Number.isFinite(weight)||weight<=0||weight>100000||Math.abs(weight*1000-Math.round(weight*1000))>1e-7))
  throw new Error("El peso debe ser positivo y tener hasta tres decimales.");
 const perkRaw=raw.bonusAgainstPerkId,bonusAgainstPerkId=perkRaw===null||perkRaw===undefined||perkRaw===""?null:Number(perkRaw);
 if(bonusAgainstPerkId!==null&&(!Number.isSafeInteger(bonusAgainstPerkId)||bonusAgainstPerkId<=0))
  throw new Error("La perk objetivo no es válida.");
 const bonusAgainstPerkAttack=integer(raw.bonusAgainstPerkAttack??0,0,10000,"Bono contra perk");
 if(bonusAgainstPerkAttack>0&&bonusAgainstPerkId===null)
  throw new Error("Selecciona una perk para aplicar el bono de ataque.");
 return {name,type,weightPerUnitKg:weight,bonusAgainstPerkId,bonusAgainstPerkAttack,
  // 100 is STEEL's reference, not an upper balance bound.
  hardness:integer(raw.hardness??0,0,1000000,"Dureza"),
  physicalResistance:integer(raw.physicalResistance??0,0,1000000,"Resistencia física"),
  magicResistance:integer(raw.magicResistance??0,0,1000000,"Resistencia mágica"),
  attackGrant:integer(raw.attackGrant??0,-10000,10000,"Bono de ataque"),
  defenseGrant:integer(raw.defenseGrant??0,-10000,10000,"Bono de defensa"),
  active:raw.active!==false,...description};
}
export function selectedMaterialId(value:unknown):number|null {
 if(value===null||value===undefined||value==="")return null;
 const id=typeof value==="number"?value:Number(value);
 if(!Number.isSafeInteger(id)||id<1)throw new Error("Material inválido.");
 return id;
}
export const itemMaterialLabel=(name:unknown)=>
 typeof name==="string"&&name.trim()?name.trim():"Sin definir";
