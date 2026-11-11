/**
 * V2 advance declarations: a defender spends one PA on a defensive posture
 * lasting real time, not a fresh PA per incoming hit. An authorized reaction
 * is read from the private declaration escrow; the attacker cannot supply it.
 *
 * The V1 calculator still decides hit, RPS, deflect-angle alignment,
 * resistance and forced movement. Incompatible reactions do not magically
 * defend unrelated attack families (e.g. physical REPEL vs magical blast).
 */
import type {CombatCommand} from "./turn-engine.ts";
import {
 activeTimelineReactionAt,type ContinuousCombatTimeline,
} from "./action-timeline.ts";
import type {
 TimelineCombatCommand,TimelinePreparedReaction,
} from "./combat-timeline-adapter.ts";
import type {Side} from "./turn-engine.ts";
export type TimelineIncomingAttack={usesMagic:boolean;isArea:boolean;hybrid?:boolean};
export type ReactionLookup=(eventId:string,owner:Side)=>TimelineCombatCommand|undefined;

export function preparedTimelineReactionAt(
 clock:ContinuousCombatTimeline,side:Side,impactTick:number,
 lookup:ReactionLookup,
):TimelinePreparedReaction|null{
 const event=activeTimelineReactionAt(clock,side,impactTick);
 if(!event)return null;
 const command=lookup(event.id,side);
 if(!command||command.kind!=="PREPARE_REACTION")
   throw new Error("La reacción temporal perdió su declaración privada.");
 return command;
}

export function timelineDefenseForImpact(
 reaction:TimelinePreparedReaction|null,
 incoming:TimelineIncomingAttack,
):Extract<CombatCommand,{kind:"DEFEND"}>{
 const none:Extract<CombatCommand,{kind:"DEFEND"}>={kind:"DEFEND",defense:"NONE"};
 if(!reaction)return none;
 const defense=reaction.defense;
 if((incoming.usesMagic||incoming.hybrid)&&
   !["DODGE","ENDURE","MAGIC_FIELD"].includes(defense))return none;
 if(!incoming.usesMagic&&!incoming.hybrid&&defense==="MAGIC_FIELD")return none;
 if(incoming.isArea&&defense==="DEFLECT")return none;
 if(defense==="DODGE")
   return {kind:"DEFEND",defense:"DODGE",
     ...(reaction.predictedCenter?{predictedCenter:{...reaction.predictedCenter}}:{})};
 if(defense==="DEFLECT")
   return {kind:"DEFEND",defense:"DEFLECT",defenseAngle:reaction.defenseAngle};
 return {kind:"DEFEND",defense};
}
