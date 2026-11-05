/** A type's stable code is referenced by every material and is never renamed.
 * Labels, processing forms and elemental reactions are fully data driven.
 */
export type MaterialTypeRow={
 code:string;name:string;obtaining:string|null;
 naturalForm:string|null;minimumForm:string|null;rawForm:string|null;
 marketForm:string|null;fireReaction:string|null;lightningReaction:string|null;
 iceReaction:string|null;active:boolean;
};
export type MaterialTypeDraft=MaterialTypeRow;
const optionalFields=["obtaining","naturalForm","minimumForm","rawForm",
 "marketForm","fireReaction","lightningReaction","iceReaction"] as const;

export function materialTypeCodeFromName(name:string):string{
 const code=name.normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .trim().toUpperCase().replace(/[^A-Z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,32);
 if(!/^[A-Z][A-Z0-9_]{1,31}$/.test(code))
  throw new Error("El nombre debe permitir generar un código válido de 2 a 32 caracteres.");
 return code;
}
export function validateMaterialTypeDraft(value:unknown):MaterialTypeDraft{
 if(!value||typeof value!=="object"||Array.isArray(value))
  throw new Error("Tipo de material inválido.");
 const raw=value as Record<string,unknown>;
 const name=String(raw.name??"").trim();
 if(!name||name.length>100)throw new Error("El nombre debe tener entre 1 y 100 caracteres.");
 const code=String(raw.code??"").trim().toUpperCase()||materialTypeCodeFromName(name);
 if(!/^[A-Z][A-Z0-9_]{1,31}$/.test(code))
  throw new Error("Código de tipo inválido (letras A-Z, números y guiones bajos).");
 const fields=Object.fromEntries(optionalFields.map(k=>{
  if(raw[k]!=null&&typeof raw[k]!=="string")
   throw new Error("El campo "+k+" debe ser texto.");
  const value=String(raw[k]??"").trim();
  if(value.length>700)throw new Error("La descripción excede 700 caracteres.");
  return [k,value||null];
 })) as Pick<MaterialTypeDraft,typeof optionalFields[number]>;
 return {code,name,active:raw.active!==false,...fields};
}
