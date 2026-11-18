/**
 * The original V1 client keeps rendering every HUD, modal, canvas and item.
 * The timeline transports declarations; it must not become a second UI or
 * second calculator of combat rules.
 */
import type {CombatCommand,CombatState,Side} from "./turn-engine.ts";

export type SharedClockDisplay={
 tick:number;round:number;waitingFor:Side[];
 pa:Record<Side,{used:number;limit:number}>;
 running:Array<{owner:Side;kind:string;startsAtTick:number;endsAtTick:number}>;
};
export type TimelineEncounterResponse={
 mode:"EXPERIMENTAL_V2";state:CombatState;
 viewerSide?:Side|"SPECTATOR";pvp?:boolean;
 timeline:SharedClockDisplay;
 skills?:Array<{id:number;name:string}>;
 batches?:number;replayed?:boolean;
};
export type V1TemporalView={
 state:CombatState;permissions:Record<Side,boolean>;
 canMove:Record<Side,boolean>;
 timeline:SharedClockDisplay;
 karma?:Partial<Record<Side,number>>;
 boostStats?:Array<{key:string;label:string}>;
};
export function projectTimelineToV1(
 response:TimelineEncounterResponse,
):V1TemporalView {
 if(response?.mode!=="EXPERIMENTAL_V2"||!response.state||
   !response.timeline||!Array.isArray(response.timeline.waitingFor))
   throw new Error("El servidor no devolvió un estado temporal válido.");
 const viewer=response.viewerSide;
 const permissions={PLAYER:viewer==="PLAYER",NPC:viewer==="NPC"};
 const canMove={PLAYER:false,NPC:false};
 for(const side of ["PLAYER","NPC"] as const){
   const pa=response.timeline.pa?.[side];
   canMove[side]=permissions[side]&&
     response.state.status==="ACTIVE"&&response.state.actors[side].hp>0&&
     !!pa&&pa.used<pa.limit&&response.timeline.waitingFor.includes(side);
 }
 return {state:response.state,permissions,canMove,
   timeline:response.timeline};
}
export type V1ClientIntent=CombatCommand|{kind:"ADVANCE";requestId?:string};
export type TimelineSubmittedIntent=Record<string,unknown>;
const own=(data:Record<string,unknown>)=>
 Object.fromEntries(Object.entries(data)
   .filter(([key,value])=>key!=="requestId"&&value!==undefined));
/** Translate V1 controls into clock declarations, never resolve a hit here. */
export function v1IntentToTimeline(
 command:V1ClientIntent,
):TimelineSubmittedIntent {
 if(command.kind==="ADVANCE")return {kind:"ADVANCE"};
 if(command.kind==="DEFEND"){
   const d=command;
   if(d.defense==="BLOCK"){
     if(!d.weaponSlot)throw new Error("Selecciona el arma o escudo para mantener la guardia.");
     return {kind:"GUARD",weaponSlot:d.weaponSlot};
   }
   if(d.defense==="NONE")return {kind:"WAIT"};
   if(d.defense==="CONSTRUCTION")
     throw new Error("La construcción defensiva todavía no tiene una declaración temporal compatible.");
   if(d.planarMove!==undefined)
     throw new Error("El movimiento de defensa debe reservarse como esquiva temporal; no se puede añadir gratis.");
   if(d.defense==="DODGE"){
     if(!d.predictedCenter)
       throw new Error("Marca una predicción de impacto antes de preparar la esquiva.");
     if(d.dodgeDirection==="WEAPON")
       throw new Error("Esquivar hacia un arma arrojada requiere una trayectoria temporal autorizada.");
     return {kind:"PREPARE_REACTION",defense:"DODGE",
       predictedCenter:d.predictedCenter,
       ...(d.dodgeDirection?{dodgeDirection:d.dodgeDirection}:{})};
   }
   if(d.defense==="DEFLECT")
     return {kind:"PREPARE_REACTION",defense:"DEFLECT",
       defenseAngle:d.defenseAngle??90};
   if(d.defense==="COUNTER")
     return {kind:"PREPARE_REACTION",defense:"COUNTER",
       counterMagic:d.counterMagic??false};
   if(d.defense==="ENDURE"||d.defense==="REPEL"||d.defense==="MAGIC_FIELD")
     return {kind:"PREPARE_REACTION",defense:d.defense};
   throw new Error("La defensa no está admitida por la línea temporal.");
 }
 if(command.kind==="BOOST_KARMA")
   throw new Error("El impulso de karma requiere autorización de cartera antes de su ejecución temporal.");
 const payload=own(command as unknown as Record<string,unknown>);
 if(command.kind==="MOVE"&&command.direction===undefined)payload.direction="TOWARD";
 if(command.kind==="CAST_SKILL"||command.kind==="USE_ITEM")
   payload.requestId=command.requestId;
 return payload;
}
