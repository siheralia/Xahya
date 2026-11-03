"use client";
import {useEffect,useState} from "react";
import {EFFECT_LABELS} from "@/lib/effects/catalog";
import {availableConstructionMaterials,type CombatSkillPreview} from "@/lib/combat/skill-preview";
import type {Side} from "@/lib/combat/turn-engine";

type RosterResponse={skills:Record<Side,CombatSkillPreview[]>};
const categories:Record<string,string>={
 OFFENSIVE:"Ofensiva",SUPPORT:"Soporte",UTILITY:"Utilidad",
 PASSIVE:"Pasiva",BASIC:"Básica",
};
const attackTypes:Record<string,string>={CUT:"Corte",BLUNT:"Contundente",PIERCE:"Penetración"};
const actionNames:Record<string,string>={
 CREATE_FIELD:"Crear campo",CHANGE_FIELD:"Modificar campo",
 EXPOSE:"Exponer",CLEANSE:"Limpiar",STATUS:"Estado",
 MANA_WARD:"Barrera de maná",
};

export default function CombatSkillLoadout({
 encounterId,side,authorized,canUseSkill,busy,round,mana,cooldowns,onCast,aimMode,magicAimReady,constructionAimReady,onConstructionMaterialsChange,categoryFilter,
}:{encounterId:string;side:Side;authorized:boolean;
 canUseSkill:boolean;busy:boolean;round:number;mana:number|null;cooldowns:Record<string,number>;
 onCast:(skill:CombatSkillPreview)=>void;aimMode:"PHYSICAL"|"MAGIC_AREA";magicAimReady:boolean;constructionAimReady:boolean;
 onConstructionMaterialsChange:(side:Side,materials:string[])=>void;categoryFilter?:string|null}) {
 const [skills,setSkills]=useState<Record<Side,CombatSkillPreview[]>>({PLAYER:[],NPC:[]});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{
  onConstructionMaterialsChange(side,authorized
   ?availableConstructionMaterials(skills[side]??[]):[]);
 },[side,skills,authorized,onConstructionMaterialsChange]);
 useEffect(()=>{
  if(!authorized)return;
  let live=true;
  setLoading(true);setError("");
  (async()=>{
   try{
    const r=await fetch("/api/combat/"+encounterId+"/skills",{cache:"no-store"});
    const payload=await r.json() as RosterResponse&{error?:string};
    if(!r.ok)throw new Error(payload.error||"No se pudieron consultar las habilidades.");
    if(live)setSkills(payload.skills);
   }catch(e){
    if(live)setError(e instanceof Error?e.message:"Error de consulta.");
   }finally{if(live)setLoading(false);}
  })();
  return()=>{live=false;};
 },[encounterId,authorized,side]);
 if(!authorized)return null;
 const roster=(skills[side]??[]).filter(skill=>!categoryFilter||skill.category===categoryFilter);
 return <section className="mt-5 rounded-xl border border-zinc-700 bg-zinc-950 p-4">
  <h2 className="text-lg font-semibold">{categoryFilter?("Habilidades "+(categories[categoryFilter]??categoryFilter)):"Habilidades del personaje"}</h2>
  <p className="mt-1 text-sm text-zinc-400">Habilidades aprobadas de tu ficha. Los ataques compatibles usan el lienzo de arriba y consumen maná, PA y ticks del encuentro; los efectos no implementados siguen bloqueados.</p>
  {loading?<p className="mt-3 text-sm text-zinc-400">Consultando habilidades aprobadas…</p>
  :error?<p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>
  :roster.length===0?<p className="mt-3 text-sm text-zinc-400">Este personaje no tiene habilidades aprobadas y disponibles para consultar.</p>
  :<div className="mt-4 space-y-2">
   {roster.map(skill=><details key={skill.id} className="rounded-lg border border-zinc-700 bg-zinc-900/70 p-3">
    <summary className="cursor-pointer font-medium">
     {skill.name} <span className="text-xs font-normal text-zinc-400">· {categories[skill.category]??skill.category} · {skill.manaCost} maná configurado</span>
     {skill.active&&<span className="ml-2 text-xs text-cyan-300">Activa</span>}
     {!skill.requirementsSatisfied&&<span className="ml-2 text-xs text-amber-300">Requisitos no cumplidos</span>}
    </summary>
    <div className="mt-3 space-y-2 text-sm text-zinc-300">
     {skill.description&&<p className="whitespace-pre-line">{skill.description}</p>}
     <div className="grid gap-1 sm:grid-cols-2">
      <span>Maná configurado: <b>{skill.manaCost}</b></span>
      <span>Mantenimiento: <b>{skill.maintenanceCost}</b></span>
      <span>Acumulación: <b>{skill.accumulationCost}</b></span>
      <span>Alcance: <b>{skill.rangeMeters===null?"Por definir":skill.rangeMeters+" m"}</b></span>
      <span>Área: <b>{skill.area}</b></span>
      <span>Velocidad: <b>{skill.speed==="DEFAULT"?"Predeterminada":skill.speed}</b></span>
      <span>Duración: <b>{skill.duration??"Sin especificar"}</b></span>
      <span>Cooldown: <b>{skill.cooldown??"Sin cooldown"}</b></span>
      {skill.attackType&&<span>Tipo de ataque: <b>{attackTypes[skill.attackType]}</b></span>}
      {skill.defenseType&&<span>Tipo de defensa: <b>{skill.defenseType}</b></span>}
     </div>
     {skill.effectTypes.length>0&&<p>Efectos: {skill.effectTypes.map(type=>(EFFECT_LABELS as Record<string,string>)[type]??type).join(", ")}</p>}
     {skill.mechanicActions.length>0&&<p>Acciones mecánicas: {skill.mechanicActions.map(type=>actionNames[type]??type).join(", ")}</p>}
     {skill.executable?<>
      {(()=>{
       const nextRound=cooldowns[String(skill.id)]??0;
       const onCooldown=nextRound===-1||nextRound>round;
       const missingAim=skill.needsAim&&(skill.skillKind==="CONSTRUCTION"
         ?!constructionAimReady:skill.usesMagic&&(aimMode!=="MAGIC_AREA"||!magicAimReady));
       const blocked=!skill.requirementsSatisfied||!canUseSkill||busy||onCooldown||
         mana===null||mana<skill.manaCost||missingAim;
       const reason=onCooldown
         ? nextRound===-1?"Ya utilizada una vez en este encuentro.":"Cooldown hasta el turno "+nextRound
         : mana===null?"El encuentro no tiene maná de fase 2. Inicia uno nuevo."
         : mana<skill.manaCost?"Maná insuficiente"
         : missingAim?(skill.skillKind==="CONSTRUCTION"?"Marca la posición de la construcción en el terreno.":"Marca el centro en modalidad Explosión mágica del lienzo superior.")
         : !canUseSkill?"La habilidad está lista, pero debes esperar tu iniciativa o resolver una reacción pendiente.":null;
       return <div className="space-y-2">
        {reason&&<p className="text-xs text-amber-300">{reason}</p>}
        {skill.skillKind==="OFFENSE"&&!skill.usesMagic&&skill.attackType==="BLUNT"&&
         <p className="text-xs text-cyan-300">Si esta técnica se ejecuta con una patada, selecciona «Pierna / patada» en el lienzo de trayectoria antes de lanzarla. Su alcance y maná provienen de la habilidad aprobada.</p>}
        <button type="button" disabled={blocked}
         onClick={()=>onCast(skill)}
         className="rounded-lg border border-cyan-400 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-40">
         {skill.skillKind==="OFFENSE"?"Lanzar ataque de habilidad":skill.skillKind==="CONSTRUCTION"?"Crear construcción":"Activar habilidad"}
        </button>
       </div>;
      })()}
     </>:<p className="text-xs text-amber-300">No ejecutable todavía: {skill.disabledReason??"Efectos pendientes de implementación"}</p>}
     <p className="text-xs text-zinc-500">El coste PCH de construcción no se cobra en combate. El maná usado aquí queda dentro de este encuentro.</p>
    </div>
   </details>)}
  </div>}
 </section>;
}
