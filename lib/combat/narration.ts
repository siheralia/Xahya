import type {CombatFighter, CombatLog, Side} from "./turn-engine.ts";

type Fighters=Record<Side,Pick<CombatFighter,"name">>;
const attackVerbs={CUT:"trazó un corte",BLUNT:"descargó un golpe contundente",PIERCE:"lanzó una estocada"} as const;
const defenses={
 DODGE:"esquivó",BLOCK:"intentó bloquear",ENDURE:"resistió",REPEL:"intentó repeler",
 DEFLECT:"intentó desviar",MAGIC_FIELD:"levantó un campo mágico",NONE:"no interpuso defensa"
} as const;
const movement={TOWARD:"avanzó",AWAY:"retrocedió",WEAPON:"se dirigió hacia su arma caída"} as const;

/** Repeatable, template-based chronicle derived solely from persisted actions.
 * No generative service, random wording, or fabricated combat events.
 */
export function narrateCombat(log:ReadonlyArray<CombatLog>,fighters:Fighters):string {
 const names=(side:Side|undefined)=>side?fighters[side]?.name??(side==="PLAYER"?"Combatiente":"Oponente"):"el rival";
 const title="Crónica del encuentro: "+names("PLAYER")+" contra "+names("NPC")+".";
 const paragraphs:string[]=[title];
 const sentences:string[]=[];
 let actionIndex=0;
 const flush=()=>{if(sentences.length){paragraphs.push(sentences.join("\n"));sentences.length=0;}};
 for(const event of log){
  const actor=names(event.by),target=names(event.against);
  let phrase="";
  switch(event.kind){
   case "ROUND":
    flush();
    paragraphs.push(event.summary.startsWith("Comienza el turno")?event.summary+".":event.summary);
    break;
   case "ATTACK": {
    const label=attackVerbs[event.attackType??"CUT"]??"atacó";
    if(event.usesMagic||event.summary.includes("lanzó magia")){
     phrase=actor+" conjuró una ofensiva mágica de "+(event.attackType==="PIERCE"?"perforación":event.attackType==="BLUNT"?"impacto":"corte")+" contra "+target+".";
    }else if(event.thrownWeapon||event.summary.includes("lanzó el arma")){
     phrase=actor+" arrojó "+(event.weaponName??"su arma")+" hacia "+target+".";
    }else if(event.rangedPhysical||event.summary.includes("proyectil")){
     phrase=actor+" disparó un proyectil hacia "+target+".";
    }else{
     const instrument=event.weaponName?" con "+event.weaponName:"";
     phrase=actor+" "+label+instrument+" contra "+target+".";
    }
    break;
   }
   case "RESOLVE": {
    const reacted=event.defense?defenses[event.defense]:"respondió";
    const damage=Math.max(0,event.damage??0);
    if(!event.contact){
      phrase=event.defense==="DODGE"
       ?target+" esquivó a tiempo y salió ileso."
       :target+" "+reacted+", y el ataque no encontró su objetivo.";
    }else if(damage===0){
      phrase=target+" "+reacted+" y logró evitar cualquier daño.";
    }else{
      const openings=["El impacto alcanzó a ","El golpe encontró a ","La ofensiva hirió a "];
      phrase=openings[actionIndex%openings.length]+target+" y le causó "+damage+" puntos de daño.";
      if(event.critical)phrase+=" Fue un impacto crítico.";
      if((event.knockbackMeters??0)>0)phrase+=" El choque lo desplazó "+event.knockbackMeters+" m.";
      if(event.defense&&event.defense!=="NONE")phrase+=" Su defensa fue "+reacted+".";
    }
    if(event.predictionMatched===true)phrase+=" La posición del impacto había sido anticipada.";
    break;
   }
   case "MOVE": {
    if(event.summary.includes("recuperó")){
      phrase=event.summary.replace(/\.$/,"")+".";
    }else if(event.movementDirection){
      phrase=actor+" "+movement[event.movementDirection]+(event.movementDirection==="WEAPON"?"":" "+(event.moveMeters??0)+" m")+".";
    }else{
      phrase=event.summary.replace(/\.$/,"")+".";
    }
    break;
   }
   case "SKILL":
    phrase=event.skillName
      ?actor+" activó "+event.skillName+(event.healingPoints?" y recuperó hasta "+event.healingPoints+" puntos de vida":"")+"."
      :event.summary.replace(/\.$/,"")+".";
    break;
   case "WAIT":
    phrase=actor+" cedió el resto de su turno.";
    break;
   case "RECOVER":
    phrase=event.summary.replace(/\.$/,"")+".";
    break;
   case "END":
    flush();
    paragraphs.push("Finalmente, "+actor+" se alzó con la victoria sobre "+target+".");
    break;
   default:
    // Unknown future actions remain visible instead of disappearing.
    if(event.summary)phrase=event.summary.replace(/\.$/,"")+".";
  }
  if(phrase){sentences.push(phrase);actionIndex++;}
 }
 flush();
 return paragraphs.join("\n\n");
}
