"use client";
import {useEffect,useState} from "react";
import {EFFECT_LABELS} from "@/lib/effects/catalog";
import {availableConstructionMaterials,type CombatSkillPreview} from "@/lib/combat/skill-preview";
import type {Side,CombatState} from "@/lib/combat/turn-engine";
import {combatChargeBalance} from "@/lib/combat/charge-pools";
import {combatSkillTargetOutOfRange} from "@/lib/combat/skill-target-range";
import {friendlyMicroKey} from "@/lib/effects/micro-labels";

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
 encounterId,side,authorized,canUseSkill,canUseAttackSkill,busy,round,mana,cooldowns,chargeState,onCast,onPrepareArea,preparedAreaSkillId,aimMode,magicAimReady,constructionAimReady,onConstructionMaterialsChange,onConstructionSkillsChange,categoryFilter,distanceMeters,constructionDistanceMeters,
}:{encounterId:string;side:Side;authorized:boolean;
 canUseSkill:boolean;canUseAttackSkill:boolean;busy:boolean;round:number;mana:number|null;cooldowns:Record<string,number>;
 chargeState?:CombatState|null;
 onCast:(skill:CombatSkillPreview,chargesToSpend?:number)=>void;
 onPrepareArea:(skill:CombatSkillPreview)=>void;preparedAreaSkillId:number|null;
 aimMode:"PHYSICAL"|"MAGIC_AREA";magicAimReady:boolean;constructionAimReady:boolean;
 onConstructionMaterialsChange:(side:Side,materials:string[])=>void;
 onConstructionSkillsChange?:(side:Side,skills:CombatSkillPreview[])=>void;
 categoryFilter?:string|null;distanceMeters?:number;constructionDistanceMeters?:number}) {
 const [skills,setSkills]=useState<Record<Side,CombatSkillPreview[]>>({PLAYER:[],NPC:[]});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [chargeChoices,setChargeChoices]=useState<Record<number,number>>({});
 useEffect(()=>{
  onConstructionMaterialsChange(side,authorized
   ?availableConstructionMaterials(skills[side]??[]):[]);
 },[side,skills,authorized,onConstructionMaterialsChange]);
 useEffect(()=>{
  onConstructionSkillsChange?.(side,authorized
   ?(skills[side]??[]).filter(skill=>skill.skillKind==="CONSTRUCTION"&&skill.executable&&skill.requirementsSatisfied)
   :[]);
 },[side,skills,authorized,onConstructionSkillsChange]);
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
      <span>Área: <b>{skill.attackArea?.shape==="SELF_FIELD"?`Barrido alrededor del usuario · ${skill.attackArea.radiusMeters} m`:skill.attackArea?.shape==="STRIP"?`Franja de ${skill.attackArea.lengthMeters} × ${skill.attackArea.widthMeters} m`
       :skill.attackArea?.shape==="CONE"?`Cono de ${skill.attackArea.radiusMeters} m · apertura ${skill.attackArea.openingDegrees}°`
       :skill.attackArea?.shape==="SWEEP"?`Barrido en arco de ${skill.attackArea.innerRadiusMeters} a ${skill.attackArea.outerRadiusMeters} m · apertura ${skill.attackArea.openingDegrees}°`
       :skill.attackArea?`Círculo de ${skill.attackArea.radiusMeters} m de radio`:skill.area}</b></span>
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
       // Construction/mirror creation does not include the prepared step that
       // an OFFENSE skill may use to close the distance.
       const outOfRange=combatSkillTargetOutOfRange(skill,{
        attackMeters:distanceMeters??Number.NaN,
        currentOpponentMeters:constructionDistanceMeters??Number.NaN,
       });
       const missingAim=skill.needsAim&&(skill.skillKind==="CONSTRUCTION"
         ?!constructionAimReady:skill.attackArea
          ?(preparedAreaSkillId!==skill.id||aimMode!=="MAGIC_AREA"||!magicAimReady)
          :skill.usesMagic&&(aimMode!=="MAGIC_AREA"||!magicAimReady));
       const availableCharges=skill.chargeBuff&&chargeState?
         combatChargeBalance(chargeState,side,skill.chargeBuff.accumulator):0;
       const selectedCharges=chargeChoices[skill.id]??skill.chargeBuff?.minCharges??1;
       const missingCharges=Boolean(skill.chargeBuff)&&
         (selectedCharges>availableCharges||selectedCharges<(skill.chargeBuff?.minCharges??1)||
           selectedCharges>(skill.chargeBuff?.maxCharges??6));
       const missingFusion=Boolean(skill.fusion)&&!skill.fusion!.sourceEntityKeys.every(key=>
         chargeState?.summons?.some(s=>s.owner===side&&s.entityKey===key&&
           s.integrity>0&&s.expiresAtRound>round));
       // Only OFFENSE skills inherit the movement+attack trace/PA checks.
       // Construction (including magic mirrors), summons and support skills
       // spend their own action without consuming a prepared movement trace.
       const invalidAttackMovement=skill.skillKind==="OFFENSE"&&!canUseAttackSkill;
       const blocked=!skill.requirementsSatisfied||!canUseSkill||invalidAttackMovement||busy||onCooldown||missingCharges||missingFusion||
         mana===null||mana<skill.manaCost||missingAim||outOfRange;
       const reason=missingFusion
         ?"Necesitas tener activas todas las criaturas que participarán en la fusión."
         :missingCharges
         ?"No tienes suficientes cargas para el número seleccionado." :outOfRange
         ?"Objetivo fuera del alcance de la habilidad ("+skill.rangeMeters+" m). Muévete primero."
         :onCooldown
         ? nextRound===-1?"Ya utilizada una vez en este encuentro.":"Cooldown hasta el turno "+nextRound
         : mana===null?"El encuentro no tiene maná de fase 2. Inicia uno nuevo."
         : mana<skill.manaCost?"Maná insuficiente"
         : missingAim?(skill.skillKind==="CONSTRUCTION"?"Marca la posición de la construcción en el terreno.":skill.attackArea?"Prepara esta área en el lienzo superior y marca el epicentro.":"Marca el centro en modalidad Explosión mágica del lienzo superior.")
         : !canUseSkill?"La habilidad está lista, pero debes esperar tu iniciativa o resolver una reacción pendiente."
         : invalidAttackMovement?"Para combinar movimiento y ataque necesitas un trazo válido y 2 PA. Ajusta el movimiento antes de lanzar esta técnica.":null;
       return <div className="space-y-2">
        {skill.modularHostileStatus&&<p className="rounded-lg border border-amber-600/40 bg-amber-950/20 p-3 text-xs text-amber-200">
         <b>Debilitamiento modular por impacto.</b> Este estado solo afecta al rival si
         {skill.hybridContact?.statusChannel
          ?" el componente "+(skill.hybridContact.statusChannel==="MAGICAL"?"mágico":"físico")+" del golpe imbuido le quita HP reales."
          :" el ataque "+(skill.usesMagic?"mágico":"físico")+" supera su reacción y le quita HP reales."}
         {" "}La esquiva y una barrera que detenga el impacto lo impiden;
         en los rayos mágicos también puede interceptar un espejo.
        </p>}
        {skill.hybridContact&&<p className="rounded-lg border border-violet-700/40 bg-violet-950/20 p-3 text-xs text-violet-200">
         <b>Golpe imbuido con magia.</b> Dibuja un ataque físico de contacto.
         La acción cuesta maná y PA una sola vez, pero el daño se reparte en
         {Math.round(skill.hybridContact.physicalMultiplier*100)} % físico y
         {Math.round(skill.hybridContact.magicalMultiplier*100)} % mágico.
         Cada parte usa su resistencia. Bloquear reduce el golpe físico;
         el campo mágico reduce la parte mágica. Una barrera en el camino
         puede detener el golpe completo. La magia está unida al contacto:
         no es un rayo reflejable.
         {skill.hybridContact.statusChannel&&<>
          {" "}El debilitamiento solo se activa con daño real del componente
          {skill.hybridContact.statusChannel==="MAGICAL"?" mágico":" físico"}.
         </>}
        </p>}
        {skill.modularSupport&&<p className="rounded-lg border border-cyan-700/40 bg-cyan-950/20 p-3 text-xs text-cyan-200">
         <b>Soporte modular aprobado.</b> Se aplica a tu personaje sin apuntar ni elegir enemigo.
         Al utilizarlo se cobran el maná, los PA y los ticks habituales; la curación y los bonos
         temporales y estados personales aparecen en el registro y en «Estado y estadísticas».
        </p>}
        {skill.fusion&&<div className="space-y-2 rounded-lg border border-fuchsia-700/40 bg-fuchsia-950/20 p-3 text-xs">
          <p className="font-semibold text-fuchsia-200">🌀 Fusión: {skill.fusion.summon.label}</p>
          <p className="text-zinc-300">Requiere: {skill.fusion.sourceEntityKeys.map(name=>{
            const present=chargeState?.summons?.some(s=>s.owner===side&&s.entityKey===name);
            return (present?"✓ ":"○ ")+friendlyMicroKey(name);
          }).join(", ")}</p>
          <p className="text-zinc-300">Mantenimiento: {skill.fusion.summon.maintenanceMana} maná/ronda · Duración: {skill.fusion.summon.durationTurns} turnos</p>
          {skill.fusion.chaosField&&<p className="text-violet-300">Campo: {skill.fusion.chaosField.radiusMeters} m · gira {skill.fusion.chaosField.rotationDegrees}°{skill.fusion.chaosField.rotateEachRound?" (cambia cada ronda)":""}.</p>}
        </div>}
        {skill.chargeBuff&&<div className="space-y-2 rounded-lg border border-violet-500/30 bg-violet-950/10 p-3">
          <p className="text-xs text-violet-200">
            🌙 Reserva: {availableCharges}/6 cargas · +{skill.chargeBuff.perChargePercent}% por carga durante {skill.chargeBuff.durationTurns} turnos
          </p>
          <label className="block text-xs">Cargas a consumir
            <select className="mt-1 w-full rounded-lg border border-violet-700 bg-zinc-900 p-2"
              value={selectedCharges} onChange={e=>setChargeChoices(v=>({...v,[skill.id]:Number(e.target.value)}))}>
              {Array.from({length:skill.chargeBuff.maxCharges-skill.chargeBuff.minCharges+1},
                (_,i)=>i+skill.chargeBuff!.minCharges).map(n=><option key={n} value={n}>
                {n} {n===1?"carga":"cargas"} · +{n*skill.chargeBuff!.perChargePercent}% a cada atributo
              </option>)}
            </select>
          </label>
          <p className="text-xs text-zinc-300">Afecta a: {skill.chargeBuff.stats.map(friendlyMicroKey).join(", ")}.</p>
        </div>}
        {reason&&<p className="text-xs text-amber-300">{reason}</p>}
        {skill.skillKind==="OFFENSE"&&skill.attackArea?.shape==="SELF_FIELD"&&
         <p className="text-xs text-cyan-300">La técnica barre alrededor de tu personaje. No necesitas marcar un epicentro ni dibujar una trayectoria; acércate hasta el alcance indicado.</p>}
        {skill.skillKind==="OFFENSE"&&!skill.usesMagic&&skill.attackType==="BLUNT"&&skill.attackArea?.shape!=="SELF_FIELD"&&
         <p className="text-xs text-cyan-300">Si esta técnica se ejecuta con una patada, selecciona «Pierna / patada» en el lienzo de trayectoria antes de lanzarla. Su alcance y maná provienen de la habilidad aprobada.</p>}
        {skill.skillKind==="OFFENSE"&&(["CIRCLE","STRIP","CONE","SWEEP"].includes(String(skill.attackArea?.shape)))&&<button type="button"
          onClick={()=>onPrepareArea(skill)}
          className="rounded-lg border border-violet-400 px-4 py-2 text-sm text-violet-200">
          {skill.attackArea?.shape==="STRIP"?`Preparar franja de ${skill.attackArea.lengthMeters} × ${skill.attackArea.widthMeters} m`
            :skill.attackArea?.shape==="CONE"?`Preparar cono de ${skill.attackArea.radiusMeters} m y ${skill.attackArea.openingDegrees}°`
            :skill.attackArea?.shape==="SWEEP"?`Preparar barrido en arco de ${skill.attackArea.innerRadiusMeters} a ${skill.attackArea.outerRadiusMeters} m`
            :skill.attackArea?.shape==="CIRCLE"?`Preparar área circular de ${skill.attackArea.radiusMeters} m de radio`:"Preparar área"}
         </button>}
        <button type="button" disabled={blocked}
         onClick={()=>onCast(skill,skill.chargeBuff?selectedCharges:undefined)}
         className="rounded-lg border border-cyan-400 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-40">
         {skill.skillKind==="OFFENSE"?(skill.attackArea?.shape==="SELF_FIELD"?"Ejecutar barrido":"Lanzar ataque de habilidad"):skill.skillKind==="CONSTRUCTION"?"Crear construcción":skill.skillKind==="SUMMON"?"Invocar criaturas":skill.skillKind==="CHARGE_BUFF"?"Activar potenciación":skill.skillKind==="FUSION"?"Fusionar criaturas":"Activar habilidad"}
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
