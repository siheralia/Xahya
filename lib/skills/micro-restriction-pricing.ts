import type {EffectContainer,MicroCondition,MicroStep} from "../effects/micro-modules.ts";

/** Connectors and mandatory checks are not beneficial actions themselves. */
export const UNPRICED_MICRO_KINDS=[
 "READ_STAT","READ_STORED","CALCULATE","READ_ITEM","SELECT_TARGET",
 "SELECT_STAT","READ_HP_DAMAGE","READ_STATUSES","REQUIRE_CONTACT",
] as const;

/** Only concrete actions restricted at runtime earn a discount. */
const DISCOUNTABLE_ACTIONS=new Set<MicroStep["kind"]>([
 "HEAL","DAMAGE","MODIFIER","BONUS","REPAIR_DURABILITY",
 "APPLY_STATUS","APPLY_CHARGE_BUFF","SUMMON_ENTITY",
 "FUSE_SUMMONS","INVERT_STATUS","VARIABLE_RESISTANCE",
 "CHAOS_FIELD",
]);
const CONTACT_PERCENT=20;
const LOW_HP_PERCENT=15;
const PER_ACTION_DISCOUNT_CAP=30;
export type MicroRestrictionPricingVersion="V1"|"V2";
/** Only new approvals receive this price version. Existing V1 approvals are immutable. */
export const NEW_MODULAR_DISCOUNT_VERSION="V2" as const;

export function pricedMicroStepCount(effect:EffectContainer):number{
 return (Array.isArray(effect?.steps)?effect.steps:[]).filter(step=>
  !!step&&typeof step==="object"&&!UNPRICED_MICRO_KINDS.includes(step.kind as typeof UNPRICED_MICRO_KINDS[number])
 ).length;
}

/** HP must genuinely be below a quarter of MAX_HP; constants are not discounts. */
function isLowHpGate(value:MicroCondition):boolean {
 if(!value || !["LT","LTE"].includes(value.compare))return false;
 const left=value.left;
 const right=value.right;
 if(typeof left!=="object"||left===null||!("source" in left)||
    left.source!=="STAT"||left.key!=="HP")return false;
 if(typeof right!=="object"||right===null||!("operator" in right)||
    right.operator!=="PERCENT"||!Array.isArray(right.args)||right.args.length!==2)return false;
 const [maximum,percentage]=right.args;
 return typeof maximum==="object"&&maximum!==null&&"source" in maximum&&
  maximum.source==="STAT"&&maximum.key==="MAX_HP"&&
  typeof percentage==="number"&&Number.isFinite(percentage)&&
  percentage>0&&percentage<=25;
}

function isRestrictedToLowHp(conditions:MicroCondition[]|undefined):boolean{
 return Array.isArray(conditions)&&conditions.some(isLowHpGate);
}

export type MicroRestrictionQuote={
 grossPch:number;
 contactDiscountPch:number;
 lowHealthDiscountPch:number;
 discountPch:number;
 finalPch:number;
 pricedActions:number;
 contactGatedActions:number;
 lowHpGatedActions:number;
};

/**
 * A conservative, auditable discount. Contact is a *runtime* stopping gate:
 * unconditional SELECT_TARGET(OPPONENT) -> unconditional REQUIRE_CONTACT
 * -> subsequent effectful actions. Conditional or decorative checks pay nothing.
 * The low HP condition is equally executable by the server. Discounts never
 * apply to previous actions, never stack by duplicating gates, and never make
 * a paid effect free. V1 rounds down (legacy approvals). V2 rounds to the
 * nearest whole PCH within the original 30% cap, so restrictions on a 5-PCH
 * action can visibly save 1 PCH without ever exceeding the allowed cap.
 */
export function microRestrictionQuote(
 effect:EffectContainer,grossPch:number,version:MicroRestrictionPricingVersion="V1",
):MicroRestrictionQuote{
 const steps=Array.isArray(effect?.steps)?effect.steps:[];
 const paid=pricedMicroStepCount(effect);
 const seenOpponentTarget=new Set<string>();
 let contactRequired=false;
 let contactGatedActions=0;
 let lowHpGatedActions=0;
 let contactWeight=0;
 let lowHpWeight=0;
 const lowHpRequired=isRestrictedToLowHp(effect?.requirements);
 for(const step of steps){
  if(!step||typeof step!=="object")continue;
  if(step.kind==="SELECT_TARGET"&&step.selector==="OPPONENT"&&
    (!step.when||step.when.length===0))
    seenOpponentTarget.add(step.output);
  if(step.kind==="REQUIRE_CONTACT"&&step.target&&
    (!step.when||step.when.length===0)&&
    seenOpponentTarget.has(step.target.key))
    contactRequired=true;
  if(!DISCOUNTABLE_ACTIONS.has(step.kind))continue;
  const contact=contactRequired;
  const health=lowHpRequired||isRestrictedToLowHp(step.when);
  if(contact)contactGatedActions++;
  if(health)lowHpGatedActions++;
  const rate=Math.min(PER_ACTION_DISCOUNT_CAP,
    (contact?CONTACT_PERCENT:0)+(health?LOW_HP_PERCENT:0));
  if(rate===0)continue;
  // A double restriction is capped at 30%, apportioned to its two causes.
  contactWeight+=contact?Math.min(CONTACT_PERCENT,rate):0;
  lowHpWeight+=health?Math.max(0,rate-(contact?CONTACT_PERCENT:0)):0;
 }
 const validGross=Number.isSafeInteger(grossPch)&&grossPch>0?grossPch:1;
 const divisor=100*Math.max(1,paid);
 // V1 is preserved byte-for-byte for the prices of earlier approvals.
 const legacyContact=Math.floor(validGross*contactWeight/divisor);
 const legacyHealth=Math.floor(validGross*(contactWeight+lowHpWeight)/divisor)-legacyContact;
 const maximumValidDiscount=Math.min(validGross-1,
   Math.floor(validGross*PER_ACTION_DISCOUNT_CAP/100));
 const discountPch=version==="V2"
   ?Math.min(maximumValidDiscount,Math.round(validGross*(contactWeight+lowHpWeight)/divisor))
   :Math.min(validGross-1,legacyContact+legacyHealth);
 const contactDiscountPch=version==="V2"
   ?Math.min(discountPch,Math.round(validGross*contactWeight/divisor))
   :Math.min(discountPch,legacyContact);
 const lowHealthDiscountPch=discountPch-contactDiscountPch;
 return {grossPch:validGross,
  contactDiscountPch,lowHealthDiscountPch,
  discountPch,finalPch:validGross-discountPch,pricedActions:paid,
  contactGatedActions,lowHpGatedActions};
}
