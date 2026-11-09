/**
 * D3.1 — explicit, isolated damage channels.
 *
 * This module is pure. It never chooses an attack target, geometry, defense,
 * hit, roll, cooldown, payment, status or persistence policy. The engine must
 * resolve each relevant channel against the actual defender first.
 *
 * The single-channel path deliberately reproduces the existing phase-2
 * offense formula, bit-for-bit, including rounding before final multipliers.
 * Dual-channel output is an accounting model, not permission to launch a
 * mixed attack in combat: there is not yet a defender reaction/cover policy
 * for attacks with two channels.
 */
export type DamageChannelKind="PHYSICAL"|"MAGICAL";
export type ResolvedChannelInput={
 kind:DamageChannelKind;
 /** Already selected by the authoritative encounter, not a client field. */
 power:number;
 protection:number;
 damageMultiplier:number;
 defenseFactor:number;
 finalMultiplier:number;
 typeFactor:number;
 racialFactor:number;
 critical:boolean;
 /** True only after the resolver confirms actual geometric contact. */
 contact:boolean;
 /** Result of the corresponding paid defense, e.g. block or magic field. */
 reactionScale:number;
};
export type ChannelDamage=Readonly<{
 kind:DamageChannelKind;
 raw:number;
 rawWithoutResistance:number;
 damage:number;
 unprotectedDamage:number;
 mitigatedByResistance:number;
}>;
export type ResolvedChannelDamage=Readonly<{
 channels:readonly ChannelDamage[];
 damage:number;
 unprotectedDamage:number;
 mitigatedByResistance:number;
}>;

const finiteNonnegative=(value:number,label:string)=>{
 if(!Number.isFinite(value)||value<0)
  throw new Error("Canal de daño inválido: "+label+".");
};
const resolveOne=(input:ResolvedChannelInput):ChannelDamage=>{
 for(const key of ["power","protection","damageMultiplier","defenseFactor",
  "finalMultiplier","typeFactor","racialFactor","reactionScale"] as const)
  finiteNonnegative(input[key],key);
 if(typeof input.contact!=="boolean"||typeof input.critical!=="boolean")
  throw new Error("El impacto y el crítico deben resolverse antes del daño.");
 const multiplier=input.critical?1.5:1;
 const full=input.power*input.damageMultiplier*multiplier*input.typeFactor;
 const protection=input.protection*input.defenseFactor*0.75;
 if(!Number.isFinite(full)||!Number.isFinite(protection))
  throw new Error("El daño supera el rango calculable.");
 const raw=Math.max(1,Math.round(full-protection));
 const rawWithoutResistance=Math.max(1,Math.round(full));
 const scale=input.reactionScale*input.finalMultiplier*input.racialFactor;
 if(!Number.isFinite(scale))throw new Error("La escala de daño es inválida.");
 const damage=input.contact?Math.max(0,Math.round(raw*scale)):0;
 const unprotectedDamage=input.contact?Math.max(0,
  Math.round(rawWithoutResistance*scale)):0;
 if(!Number.isSafeInteger(damage)||!Number.isSafeInteger(unprotectedDamage))
  throw new Error("El daño está fuera del rango seguro.");
 return {
  kind:input.kind,raw,rawWithoutResistance,damage,unprotectedDamage,
  mitigatedByResistance:Math.max(0,unprotectedDamage-damage),
 };
};

/** Aggregates separately validated, separately defended channel calculations.
 * Never infer a second channel from a single existing damage/defense result.
 */
export function resolveDamageChannels(inputs:readonly ResolvedChannelInput[]):ResolvedChannelDamage{
 if(inputs.length<1||inputs.length>2)
  throw new Error("Se requiere uno o dos canales de daño explícitos.");
 const used=new Set<DamageChannelKind>();
 const channels=inputs.map(input=>{
  if(input.kind!=="PHYSICAL"&&input.kind!=="MAGICAL")
   throw new Error("Tipo de canal de daño desconocido.");
  if(used.has(input.kind))throw new Error("Canal de daño duplicado.");
  used.add(input.kind);
  return resolveOne(input);
 });
 const damage=channels.reduce((sum,channel)=>sum+channel.damage,0);
 const unprotectedDamage=channels.reduce((sum,channel)=>sum+channel.unprotectedDamage,0);
 const mitigatedByResistance=channels.reduce(
  (sum,channel)=>sum+channel.mitigatedByResistance,0);
 if(!Number.isSafeInteger(damage)||!Number.isSafeInteger(unprotectedDamage)||
    !Number.isSafeInteger(mitigatedByResistance))
  throw new Error("Los canales sumados exceden el rango seguro.");
 return {channels,damage,unprotectedDamage,mitigatedByResistance};
}
