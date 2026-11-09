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
/** Training labels may include a race suffix for the UI, not for spoken dialogue. */
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
/** Old event summaries may still contain the technical training label. */
const narratedSummary=(summary:string,fighters:Fighters):string=>{
 const npc=opponentReference(fighters.NPC);
 const normalized=npc.object===fighters.NPC.name?summary:
  summary.split(fighters.NPC.name).join(npc.object);
 return sentence(normalized.replace(/^./,first=>first.toLocaleUpperCase("es")));
};

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
 const actor=side==="PLAYER"?fighters.PLAYER.name.split(/\s+/)[0]:npc.subject;
 const target=victim==="PLAYER"?fighters.PLAYER.name.split(/\s+/)[0]:npc.object;
 const addressedTarget=target.startsWith("el ")?"al "+target.slice(3):"a "+target;
 const genitiveActor=side==="PLAYER"?"de "+actor:npc.genitive;
 const genitiveTarget=victim==="PLAYER"?"de "+target:npc.genitive;
 const magic=Boolean(launch?.usesMagic||launch?.summary?.includes("lanzó magia")||
  launch?.summary?.includes("explosión mágica"));
 const thrown=Boolean(launch?.thrownWeapon||launch?.summary?.includes("lanzó el arma"));
 const ranged=Boolean(launch?.rangedPhysical||launch?.summary?.includes("proyectil"));
 const type=launch?.attackType??impact?.attackType;
 const technique=launch?.skillName;
 // Historic mirror logs (before mirrorShot existed) explicitly say the
 // construction launched a ray. Reconstruct their chronicles correctly too.
 const mirrorShot=Boolean(launch?.mirrorShot||impact?.mirrorShot||
  /invocó .+ y lanzó un rayo mágico|proyectó un rayo mágico/i.test(launch?.summary??""));
 const descriptor=mirrorShot?"un rayo mágico perforante desde el espejo":
  launch?.attackArea?.shape==="STRIP"?`una franja de ${launch.attackArea.lengthMeters} × ${launch.attackArea.widthMeters} m`:
   launch?.attackArea?.shape==="CONE"?`un cono de ${launch.attackArea.radiusMeters} m con apertura de ${launch.attackArea.openingDegrees}°`:
   launch?.attackArea?.shape==="SWEEP"?`un barrido en arco de ${launch.attackArea.innerRadiusMeters} a ${launch.attackArea.outerRadiusMeters} m con apertura de ${launch.attackArea.openingDegrees}°`:
  launch?.attackArea?.shape==="SELF_FIELD"?`un barrido de ${launch.attackArea.radiusMeters} m alrededor del usuario`:
  launch?.attackArea?`un ataque circular de ${launch.attackArea.radiusMeters} m de radio`:
  noun(type,magic,ranged,thrown,launch?.weaponName);
 const withWeapon=!magic&&!ranged&&!thrown&&launch?.weaponName?descriptor+" con "+launch.weaponName:descriptor;
 const act=technique?"la técnica «"+technique+"» ("+withWeapon+")":withWeapon;
 const key=side+":"+(launch?.attackArea?"AREA":magic?"MAGIC":ranged?"RANGED":"PHYSICAL")+":"+(type??"OTHER");
 ctx.counts[key]=(ctx.counts[key]??0)+1;
 const repeat=ctx.counts[key];
 const first=ctx.attacks===0;
 const counter=ctx.lastAttacker!==undefined&&ctx.lastAttacker!==side;
 const followingMiss=ctx.lastAttacker===side&&ctx.lastMissed;
 const damage=typeof impact?.damage==="number"?Math.max(0,impact.damage):0;
 const landed=Boolean(impact?.contact&&damage>0);
 const avoided=Boolean(impact&&/evitó el ataque|escapó de la explosión|esquivó el rayo/i.test(impact.summary));
 const defended=impact?.defense;
 const reaction=defended==="DEFLECT"?"al intento de desvío":
  defended==="BLOCK"?"al bloqueo":
  defended==="ENDURE"?"a la resistencia":
  defended==="REPEL"?"al intento de repelerlo":
  defended==="DODGE"?"a la maniobra evasiva":
  defended==="MAGIC_FIELD"?"al campo defensivo":undefined;
 const pushed=landed&&(impact?.knockbackMeters??0)>0;
 const damageBefore=ctx.damaged[victim]>0;
 const stem=thrown?actor+" arrojó "+(launch?.weaponName??"su arma"):
  first?actor+" abrió el combate con "+act:
  counter?actor+" respondió con "+act:
  followingMiss?actor+" insistió con "+act:
  actor+" atacó con "+act;
 let phrase="";
 if(!impact){
  phrase=stem+", aunque no quedó registrada la resolución del ataque.";
 }else if(!landed){
  if(avoided&&defended==="DEFLECT")phrase=stem+", pero "+target+" logró desviar el ataque.";
  else if(avoided&&defended==="DODGE")phrase=stem+", pero "+target+" logró esquivar el ataque.";
  else if(avoided)phrase=stem+", pero "+target+" evitó el impacto.";
  else if(impact.contact&&damage===0)phrase=stem+", aunque "+target+" no sufrió daño.";
  else phrase=stem+", pero el ataque no alcanzó a "+target+".";
 }else if(isFinalHit&&followingMiss){
  phrase="Sin embargo, su siguiente ataque encontró una abertura: un impacto de "+
   damagePhrase(damage)+" que terminó el combate.";
 }else if(magic&&defended==="MAGIC_FIELD"){
  phrase=stem+". Ni siquiera el campo defensivo "+genitiveTarget+
   " pudo impedir que recibiera "+damagePhrase(damage)+".";
 }else if(repeat>1&&type==="CUT"&&!magic&&!ranged){
  phrase=(repeat===2?"Un segundo corte ":"Otro corte ")+genitiveActor+" volvió a alcanzar "+addressedTarget+
   " y causó "+damagePhrase(damage)+".";
 }else if(first){
  phrase=stem+" que"+(reaction?", pese "+reaction+",":"")+
   " causó "+damagePhrase(damage)+" "+addressedTarget+
   (pushed?" y provocó que retrocediera":"")+".";
 }else if(reaction){
  phrase=stem+". Pese "+reaction+" "+genitiveTarget+", "+
   (damageBefore?"recibió otros ":"recibió ")+damagePhrase(damage)+".";
 }else if(magic){
  phrase=stem+" y alcanzó "+addressedTarget+", causándole "+
   (damageBefore?"otros ":"")+damagePhrase(damage)+".";
 }else{
  phrase=stem+" y alcanzó "+addressedTarget+", causándole "+damagePhrase(damage)+".";
 }
 if(landed&&impact?.critical)phrase+=" Fue un impacto crítico.";
 if(landed&&pushed&&!(first&&phrase.includes("retrocediera")))
  phrase+=" El impacto hizo que retrocediera.";
 if(isFinalHit&&landed&&!phrase.includes("terminó el combate"))
  phrase+=" Ese golpe puso fin al enfrentamiento.";
 ctx.attacks++;
 ctx.lastAttacker=side;
 ctx.lastMissed=!landed;
 if(landed)ctx.damaged[victim]++;
 if(pushed)ctx.pushed=victim;
 return phrase;
}

function describeMove(event:CombatLog,ctx:Context,fighters:Fighters):string{
 const side=event.by;
 const actor=side==="PLAYER"?fighters.PLAYER.name.split(/\s+/)[0]
  :opponentReference(fighters.NPC).subject;
 if(event.summary.includes("recuperó")){
  ctx.pushed=undefined;
  return narratedSummary(event.summary,fighters);
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
 return narratedSummary(event.summary.replace(/-?\d+\.\d{6,}/g,x=>Number(x).toFixed(2)),fighters);
}

function ending(winner:Side,fighters:Fighters):string{
 const actor=fighters[winner];
 const hp=actor.hp,max=actor.maxHp;
 const name=winner==="NPC"?opponentReference(fighters.NPC).subject:actor.name;
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
   // Exact meters remain in the technical log, not the prose narration.
   const next=beats[i+1],prev=beats[i-1];
   const attackSide=(candidate:Beat|undefined)=>candidate?.kind==="ATTACK"?
    candidate.launch?.by??candidate.result?.by:undefined;
   const actor=event.by==="PLAYER"?fighters.PLAYER.name.split(/\s+/)[0]:
    opponentReference(fighters.NPC).subject;
   const beforeAttack=attackSide(next)===event.by;
   const afterAttack=attackSide(prev)===event.by;
   add(actor+(beforeAttack?" ajustó su posición antes de atacar.":
    afterAttack?" cambió de posición tras atacar.":" cambió de posición."));
   if(ctx.pushed===event.by)ctx.pushed=undefined;
  }else if(event.kind==="SKILL"){
   const actor=event.by==="PLAYER"?fighters.PLAYER.name.split(/\s+/)[0]:
     opponentReference(fighters.NPC).subject;
   const skill=event.skillName??event.summary.replace(/^.*?\busó\s+/i,"").replace(/\s+y recuperó.*$/,"");
   add(event.healingPoints&&event.healingPoints>0
    ?actor+" recurrió a "+skill+" para recuperar fuerzas."
    :actor+" activó "+skill+".");
  }else if(event.kind==="RECOVER"){
   add(narratedSummary(event.summary,fighters));
  }else if(event.kind==="WAIT"){
   // Ordinary turn passes add noise without changing the story.
  }else if(event.kind==="END"){
   flush();
   paragraphs.push(ending(event.by,fighters));
   ended=true;
  }else if(event.summary){
   add(narratedSummary(event.summary,fighters));
  }
 }
 if(!ended)flush();
 return paragraphs.join("\n\n");
}
