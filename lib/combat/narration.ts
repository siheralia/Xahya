import type {CombatAttackType} from "./ticks.ts";
import type {CombatFighter,CombatLog,Side} from "./turn-engine.ts";

type Fighters=Record<Side,Pick<CombatFighter,"name">&Partial<Pick<CombatFighter,"hp"|"maxHp">>>;
type Beat=
 | {kind:"ATTACK";launch?:CombatLog;result?:CombatLog}
 | {kind:"EVENT";event:CombatLog};

const numbers=["cero","uno","dos","tres","cuatro","cinco","seis","siete","ocho","nueve",
 "diez","once","doce","trece","catorce","quince","dieciséis","diecisiete","dieciocho",
 "diecinueve","veinte"];
const quantity=(value:number)=>Number.isInteger(value)&&value>=0&&value<=20?numbers[value]:String(value);
const damagePhrase=(n:number)=>n===1?"un punto de daño":quantity(n)+" puntos de daño";
const lifePhrase=(n:number)=>n===1?"un punto de vida":quantity(n)+" puntos de vida";
const noun=(type:CombatAttackType|undefined,magic=false,ranged=false,thrown=false,weapon?:string)=>{
 if(thrown)return "el lanzamiento de "+(weapon||"su arma");
 if(ranged)return type==="PIERCE"?"un proyectil perforante":type==="BLUNT"?"un proyectil contundente":"un proyectil cortante";
 if(magic)return type==="PIERCE"?"una explosión mágica perforante":type==="BLUNT"?"una explosión mágica contundente":"una explosión mágica cortante";
 return type==="PIERCE"?"una estocada":type==="BLUNT"?"un golpe contundente":"un corte";
};
const attackDefinite=(type:CombatAttackType|undefined)=>type==="PIERCE"?"la estocada":type==="BLUNT"?"el golpe":"el corte";
const roundName=(n:number)=>({2:"segundo",3:"tercer",4:"cuarto",5:"quinto",6:"sexto",
 7:"séptimo",8:"octavo",9:"noveno",10:"décimo"} as Record<number,string>)[n]??String(n)+".º";
const other=(side:Side):Side=>side==="PLAYER"?"NPC":"PLAYER";
const isTrainingOpponent=(name:string)=>/^oponente de entrenamiento$/i.test(name.trim());
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
 const actor=side==="PLAYER"?fighters.PLAYER.name.split(/\s+/)[0]
  :isTrainingOpponent(fighters.NPC.name)?"El rival":fighters.NPC.name;
 const target=victim==="PLAYER"?fighters.PLAYER.name.split(/\s+/)[0]
  :isTrainingOpponent(fighters.NPC.name)?"el rival":fighters.NPC.name;
 const magic=Boolean(launch?.usesMagic||launch?.summary?.includes("lanzó magia")||
  launch?.summary?.includes("explosión mágica"));
 const thrown=Boolean(launch?.thrownWeapon||launch?.summary?.includes("lanzó el arma"));
 const ranged=Boolean(launch?.rangedPhysical||launch?.summary?.includes("proyectil"));
 const type=launch?.attackType??impact?.attackType;
 const technique=launch?.skillName;
 const descriptor=noun(type,magic,ranged,thrown,launch?.weaponName);
 const act=technique?"la técnica «"+technique+"» ("+descriptor+")":descriptor;
 const key=side+":"+(magic?"MAGIC":ranged?"RANGED":"PHYSICAL")+":"+(type??"OTHER");
 ctx.counts[key]=(ctx.counts[key]??0)+1;
 const repeat=ctx.counts[key];
 const first=ctx.attacks===0;
 const counter=ctx.lastAttacker!==undefined&&ctx.lastAttacker!==side;
 const followingMiss=ctx.lastAttacker===side&&ctx.lastMissed;
 const damage=typeof impact?.damage==="number"?Math.max(0,impact.damage):0;
 const landed=Boolean(impact?.contact&&damage>0);
 const avoided=Boolean(impact&&/evitó el ataque|escapó de la explosión/i.test(impact.summary));
 const defended=impact?.defense;
 const reaction=defended==="DEFLECT"?"intento de desvío":
  defended==="BLOCK"?"bloqueo":
  defended==="ENDURE"?"resistencia":
  defended==="REPEL"?"intento de repelerlo":
  defended==="DODGE"?"maniobra evasiva":
  defended==="MAGIC_FIELD"?"campo defensivo":undefined;
 const pushed=landed&&(impact?.knockbackMeters??0)>0;
 const damageBefore=ctx.damaged[victim]>0;
 const stem=first?actor+" abrió el combate con "+act:
  counter?actor+" respondió con "+act:
  followingMiss?actor+" insistió con "+act:
  actor+" atacó con "+act;
 let phrase="";
 if(!impact){
  phrase=stem+", aunque no quedó registrada la resolución del ataque.";
 }else if(!landed){
  if(avoided&&defended==="DEFLECT")phrase=stem+", pero "+target+" logró desviarlo.";
  else if(avoided&&defended==="DODGE")phrase=stem+", pero "+target+" logró esquivarlo.";
  else if(avoided)phrase=stem+", pero "+target+" evitó el impacto.";
  else if(impact.contact&&damage===0)phrase=stem+", aunque "+target+" no sufrió daño.";
  else phrase=stem+", pero el ataque no alcanzó a "+target+".";
 }else if(isFinalHit&&followingMiss){
  phrase="Sin embargo, su siguiente ataque encontró una abertura: un impacto de "+
   damagePhrase(damage)+" que terminó el combate.";
 }else if(magic&&defended==="MAGIC_FIELD"){
  phrase=stem+". Ni siquiera el campo defensivo de "+target+
   " pudo impedir que recibiera "+damagePhrase(damage)+".";
 }else if(repeat>1&&type==="CUT"&&!magic&&!ranged){
  phrase="Un segundo corte de "+actor+" volvió a alcanzar a "+target+
   " y causó "+damagePhrase(damage)+".";
 }else if(first){
  phrase=stem+" que "+(reaction?", pese al "+reaction+", ":"")+
   "causó "+damagePhrase(damage)+" a "+target+
   (pushed?" y obligó a "+target+" a retroceder":"")+".";
 }else if(reaction){
  phrase=stem+". Pese al "+reaction+" de "+target+", "+
   (damageBefore?"recibió otros ":"recibió ")+damagePhrase(damage)+".";
 }else if(magic){
  phrase=stem+" y alcanzó a "+target+", arrebatándole "+
   (damageBefore?"otros ":"")+damagePhrase(damage)+".";
 }else{
  phrase=stem+" y alcanzó a "+target+", causándole "+damagePhrase(damage)+".";
 }
 if(landed&&impact?.critical)phrase+=" Fue un impacto crítico.";
 if(landed&&pushed&&!(first&&phrase.includes("retroceder")))
  phrase+=" La fuerza del impacto obligó a "+target+" a retroceder.";
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
  :isTrainingOpponent(fighters.NPC.name)?"El oponente":fighters.NPC.name;
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
 const opponent=fighters.NPC.name;
 const introduction=fighters.PLAYER.name+" se enfrentó a "+
   (isTrainingOpponent(opponent)?"un oponente de entrenamiento":opponent)+".";
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
  if(event.kind==="ROUND"){
   flush();
   const explicit=Number(event.summary.match(/(?:turno|ronda)\s+(\d+)/i)?.[1]);
   const n=Number.isSafeInteger(explicit)&&explicit>1?explicit:2;
   roundLead="Al comenzar el "+roundName(n)+" turno, ";
  }else if(event.kind==="MOVE"){
   add(describeMove(event,ctx,fighters));
  }else if(event.kind==="SKILL"){
   const actor=event.by==="PLAYER"?fighters.PLAYER.name.split(/\s+/)[0]:
     (isTrainingOpponent(fighters.NPC.name)?"El rival":fighters.NPC.name);
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
