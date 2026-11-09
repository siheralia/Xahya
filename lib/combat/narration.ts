import type {CombatAttackType} from "./ticks.ts";
import type {CombatFighter,CombatLog,Side} from "./turn-engine.ts";

export const COMBAT_NARRATIVE_VERSION=4;
type Fighters=Record<Side,Pick<CombatFighter,"name">&Partial<Pick<CombatFighter,"hp"|"maxHp"|"characterId">>>;
type Beat=
 | {kind:"ATTACK";launch?:CombatLog;result?:CombatLog}
 | {kind:"EVENT";event:CombatLog};

const numbers=["cero","uno","dos","tres","cuatro","cinco","seis","siete","ocho","nueve",
 "diez","once","doce","trece","catorce","quince","dieciséis","diecisiete","dieciocho",
 "diecinueve","veinte"];
const quantity=(value:number)=>Number.isInteger(value)&&value>=0&&value<=20?numbers[value]:String(value);
const damagePhrase=(n:number)=>n===1?"un punto de daño":quantity(n)+" puntos de daño";
const noun=(type:CombatAttackType|undefined,magic=false,ranged=false,thrown=false,weapon?:string)=>{
 if(thrown)return "el lanzamiento de "+(weapon||"su arma");
 if(ranged)return type==="PIERCE"?"un proyectil perforante":type==="BLUNT"?"un proyectil contundente":"un proyectil cortante";
 if(magic)return type==="PIERCE"?"una explosión mágica perforante":type==="BLUNT"?"una explosión mágica contundente":"una explosión mágica cortante";
 return type==="PIERCE"?"una estocada":type==="BLUNT"?"un golpe contundente":"un corte";
};
const roundName=(n:number)=>({2:"segundo",3:"tercer",4:"cuarto",5:"quinto",6:"sexto",
 7:"séptimo",8:"octavo",9:"noveno",10:"décimo"} as Record<number,string>)[n]??String(n)+".º";
const other=(side:Side):Side=>side==="PLAYER"?"NPC":"PLAYER";
const isTrainingOpponent=(name:string)=>/^oponente de entrenamiento(?:\s*·\s*.+)?$/i.test(name.trim());
const trainingRaceNoun=(race:string):string|undefined=>({
 "gigantes":"gigante","elfos":"elfo","enanos":"enano","gatos":"gato",
 "humanos":"humano","dragones":"dragón","arborios":"arborio",
 "nómadas de viento":"nómada de viento","nómadas del viento":"nómada del viento",
 "sombríos":"sombrío","orcos":"orco","demonios":"demonio",
 "ángeles":"ángel","vampiros":"vampiro",
} as Record<string,string>)[race.trim().toLocaleLowerCase("es")];
/** The race suffix identifies training NPCs for the UI; it is not a spoken name. */
function opponentReference(fighter:Fighters["NPC"]){
 const full=fighter.name.trim();
 const suffix=full.match(/^(.+?)\s*·\s*(.+)$/);
 const training=fighter.characterId===null||isTrainingOpponent(full);
 const name=training&&suffix?suffix[1].trim():full;
 const race=training&&suffix?trainingRaceNoun(suffix[2]):undefined;
 if(isTrainingOpponent(name)){
  const noun=race??"rival";
  return {
   introduction:race?"un "+race+" de entrenamiento":"un oponente de entrenamiento",
   subject:"El "+noun,object:"el "+noun,genitive:"del "+noun,
  };
 }
 return {
  introduction:race?name+", un "+race+" de entrenamiento":name,
  subject:name,object:name,genitive:"de "+name,
 };
}
const sentence=(value:string)=>value.trim().replace(/\.+$/,"")+".";
const lowerArticle=(value:string)=>value.replace(/^(El|La|Un|Una)\b/,m=>m.toLowerCase());

/** Group a launch and its resolution into one narrative event, not two
 * independent repetitions. Other movements retain their original sequence.
 */
function beatsFromLog(log:ReadonlyArray<CombatLog>):Beat[]{
 const beats:Beat[]=[];
 let launched:CombatLog|undefined;
 for(const event of log){
  if(event.kind==="ATTACK"){
   if(launched)beats.push({kind:"ATTACK",launch:launched});
   launched=event;
  }else if(event.kind==="RESOLVE"){
   if(launched&&launched.by!==event.by){
    beats.push({kind:"ATTACK",launch:launched});
    launched=undefined;
   }
   beats.push({kind:"ATTACK",launch:launched,result:event});
   launched=undefined;
  }else{
   if((event.kind==="ROUND"||event.kind==="END")&&launched){
    beats.push({kind:"ATTACK",launch:launched});
    launched=undefined;
   }
   beats.push({kind:"EVENT",event});
  }
 }
 if(launched)beats.push({kind:"ATTACK",launch:launched});
 return beats;
}

type Context={
 attacks:number;
 lastAttacker?:Side;
 lastMissed:boolean;
 damaged:Record<Side,number>;
 pushed?:Side;
 counts:Record<string,number>;
};
function describeAttack(
 beat:Extract<Beat,{kind:"ATTACK"}>,ctx:Context,
 fighters:Fighters,isFinalHit:boolean,
):string{
 const launch=beat.launch,impact=beat.result;
 const side=launch?.by??impact?.by??"PLAYER";
 const victim=launch?.against??impact?.against??other(side);
 const npc=opponentReference(fighters.NPC);
 const actor=side==="PLAYER"?fighters.PLAYER.name.split(/\s+/)[0]
  :opponentReference(fighters.NPC).subject;
 if(event.summary.includes("recuperó")){
  ctx.pushed=undefined;
  return sentence(event.summary);
 }
 const direction=event.movementDirection;
 if(direction==="TOWARD"){
  const recovering=ctx.pushed===side;
  ctx.pushed=undefined;
  return actor+(recovering?" avanzó para recuperar terreno.":" avanzó para acortar la distancia.");
 }
 if(direction==="AWAY"){ctx.pushed=undefined;return actor+" retrocedió para ganar espacio.";}
 if(direction==="WEAPON"){ctx.pushed=undefined;return actor+" se dirigió hacia su arma caída.";}
 if(direction==="VECTOR"){ctx.pushed=undefined;return actor+" cambió de posición.";}
 // Old encounters did not record movement metadata; preserve known text.
 return sentence(event.summary.replace(/-?\d+\.\d{6,}/g,x=>Number(x).toFixed(2)));
}

function ending(winner:Side,fighters:Fighters):string{
 const actor=fighters[winner];
 const hp=actor.hp,max=actor.maxHp;
 const name=actor.name;
 if(typeof hp!=="number"||typeof max!=="number"||!Number.isFinite(hp)||
   !Number.isFinite(max)||max<=0)return name+" se alzó con la victoria.";
 const safeHp=Math.max(0,Math.min(hp,max));
 if(safeHp<=max/3)return name+" obtuvo la victoria, aunque terminó con apenas "+
   quantity(safeHp)+" de sus "+quantity(max)+" puntos de vida.";
 return name+" obtuvo la victoria y terminó con "+quantity(safeHp)+" de sus "+
   quantity(max)+" puntos de vida.";
}

/** Rewrite only documented facts, using a compact prose grammar rather than
 * a log-entry-per-sentence dump. Stable output for replays and old encounters.
 */
export function narrateCombat(log:ReadonlyArray<CombatLog>,fighters:Fighters):string{
 const introduction=fighters.PLAYER.name+" se enfrentó a "+
   opponentReference(fighters.NPC).introduction+".";
 const paragraphs:string[]=[];
 const current:string[]=[introduction];
 const ctx:Context={attacks:0,lastMissed:false,damaged:{PLAYER:0,NPC:0},counts:{}};
 const beats=beatsFromLog(log);
 let roundLead:string|undefined;
 let ended=false;
 const flush=()=>{if(current.length){paragraphs.push(current.join(" "));current.length=0;}};
 const add=(value:string)=>{
  if(!value)return;
  current.push(roundLead?roundLead+lowerArticle(value):value);
  roundLead=undefined;
  if(current.length>=6)flush();
 };
 for(let i=0;i<beats.length;i++){
  const beat=beats[i];
  if(beat.kind==="ATTACK"){
   const next=beats[i+1];
   const lethal=Boolean(next?.kind==="EVENT"&&next.event.kind==="END");
   add(describeAttack(beat,ctx,fighters,lethal));
   continue;
  }
  const event=beat.event;
  if(ended)continue;
  if(event.kind==="ROUND"){
   flush();
   const explicit=Number(event.summary.match(/(?:turno|ronda)\s+(\d+)/i)?.[1]);
   const n=Number.isSafeInteger(explicit)&&explicit>1?explicit:2;
   roundLead="Al comenzar el "+roundName(n)+" turno, ";
  }else if(event.kind==="MOVE"){
   add(describeMove(event,ctx,fighters));
  }else if(event.kind==="POSITION"){
   // Movement metadata remains available in the original technical log.
   const next=beats[i+1],prev=beats[i-1];
   const attackSide=(candidate:Beat|undefined)=>candidate?.kind==="ATTACK"?
    candidate.launch?.by??candidate.result?.by:undefined;
   const actor=event.by==="PLAYER"?fighters.PLAYER.name.split(/\s+/)[0]:
     opponentReference(fighters.NPC).subject;
   const skill=event.skillName??event.summary.replace(/^.*?\busó\s+/i,"").replace(/\s+y recuperó.*$/,"");
   add(event.healingPoints&&event.healingPoints>0
    ?actor+" recurrió a "+skill+" para recuperar fuerzas."
    :actor+" activó "+skill+".");
  }else if(event.kind==="RECOVER"){
   add(sentence(event.summary));
  }else if(event.kind==="WAIT"){
   // Ordinary turn passes add noise without changing the story.
  }else if(event.kind==="END"){
   flush();
   paragraphs.push(ending(event.by,fighters));
   ended=true;
  }else if(event.summary){
   add(sentence(event.summary));
  }
 }
 if(!ended)flush();
 return paragraphs.join("\n\n");
}
