"use client";
import type { SkillMechanics, MechanicCondition, MechanicRule, MechanicAction, MechanicEvent } from "@/lib/skills/interaction-engine";
import type { AvailableSkill } from "./SkillPrerequisitesField";
import { VariableResistanceEditor } from "./VariableResistance";

const input = "mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-white";
const label = "block text-xs text-zinc-400";
const blankCondition = ():MechanicCondition => ({kind:"FIELD_MIN",material:"NEUTRAL",ppm:100});
const blankAction = ():MechanicAction => ({kind:"STATUS",status:"SLOWED",target:"OPPONENT",durationTurns:1,stat:"AGI",multiplier:0.8});
const blankRule = ():MechanicRule => ({event:"ACTIVATE",conditions:[],actions:[blankAction()]});
const conditionKinds = [["FIELD_MIN","Concentración mínima"],["EXPOSURE_MIN","Exposición acumulada"],["SKILL_ACTIVE","Habilidad activa"],["STATUS","Estado presente"],["EVENT","Evento"]] as const;
const actionKinds = [["CREATE_FIELD","Crear campo"],["CHANGE_FIELD","Consumir concentración"],["EXPOSE","Acumular exposición"],["CLEANSE","Limpiar exposición"],["STATUS","Aplicar estado / estadística"],["MANA_WARD","Revestimiento de maná"]] as const;
const events:MechanicEvent[]=["ACTIVATE","TURN","HIT","ENTER_FIELD"];
const eventLabels:Record<MechanicEvent,string>={
  ACTIVATE:"Al activar",TURN:"Al comenzar cada turno",
  HIT:"Al confirmar impacto",ENTER_FIELD:"Al entrar en el campo",
};
const targets = [["SELF","Usuario"],["OPPONENT","Oponente"],["ALL","Todos"]] as const;

export function SkillMechanicsEditor({
 value,onChange,characterId,availableSkills=[],editingSkillId,statistics=[],
}:{
 value:SkillMechanics;onChange:(v:SkillMechanics)=>void;characterId?:number;
 availableSkills?:AvailableSkill[];editingSkillId?:number|null;
 statistics?:{key:string;name:string;kind:"basic"|"derived";active?:boolean}[];
}) {
 const mechanics=value??{};
 const rules=mechanics.rules??[];
 const skills=availableSkills.filter(s=>s.status==="APPROVED" && s.characterId===characterId && s.id!==editingSkillId);
 const setRule=(i:number,next:MechanicRule)=>onChange({...mechanics,rules:rules.map((r,k)=>k===i?next:r)});
 const setConditions=(conditions:MechanicCondition[])=>onChange({...mechanics,activationConditions:conditions});
 const renderConditions=(items:MechanicCondition[],set:(value:MechanicCondition[])=>void)=>(
  <div className="space-y-2">
   {items.map((c,i)=><div key={i} className="grid gap-2 rounded-lg border border-zinc-800 p-2 sm:grid-cols-3">
    <label className={label}>Condición<select className={input} value={c.kind} onChange={e=>{
      const kind=e.target.value;
      const next:MechanicCondition=kind==="FIELD_MIN"?{kind,material:"NEUTRAL",ppm:100}:kind==="EXPOSURE_MIN"?{kind,material:"NEUTRAL",amount:100}:kind==="SKILL_ACTIVE"?{kind,skillId:skills[0]?.id??1}:kind==="STATUS"?{kind:"STATUS",status:"SLOWED"}:{kind:"EVENT",event:"ACTIVATE"};
      set(items.map((x,j)=>i===j?next:x));
    }}>{conditionKinds.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label>
    {(c.kind==="FIELD_MIN"||c.kind==="EXPOSURE_MIN")&&<>
      <label className={label}>Material (identificador avanzado)<input className={input} value={c.material} onChange={e=>set(items.map((x,j)=>i===j?{...c,material:e.target.value.toUpperCase()}:x))}/></label>
      <label className={label}>{c.kind==="FIELD_MIN"?"ppm mínimos":"Acumulación mínima"}<input className={input} type="number" min="0" value={c.kind==="FIELD_MIN"?c.ppm:c.amount} onChange={e=>set(items.map((x,j)=>i===j?(c.kind==="FIELD_MIN"?{...c,ppm:Number(e.target.value)}:{...c,amount:Number(e.target.value)}):x))}/></label>
    </>}
    {c.kind==="SKILL_ACTIVE"&&<label className={label}>Habilidad requerida<select className={input} value={c.skillId} onChange={e=>set(items.map((x,j)=>i===j?{...c,skillId:Number(e.target.value)}:x))}>{skills.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
    {c.kind==="STATUS"&&<label className={label}>Estado (identificador avanzado)<input className={input} value={c.status} onChange={e=>set(items.map((x,j)=>i===j?{...c,status:e.target.value.toUpperCase()}:x))}/></label>}
    {c.kind==="EVENT"&&<label className={label}>Evento<select className={input} value={c.event} onChange={e=>set(items.map((x,j)=>i===j?{...c,event:e.target.value as MechanicEvent}:x))}>{events.map(e=><option key={e} value={e}>{eventLabels[e]}</option>)}</select></label>}
    <button type="button" className="self-end rounded border border-red-900 px-2 py-2 text-xs text-red-300" onClick={()=>set(items.filter((_,j)=>j!==i))}>Eliminar condición</button>
   </div>)}
   <button type="button" className="rounded border border-zinc-700 px-3 py-2 text-xs" disabled={items.length>=10} onClick={()=>set([...items,blankCondition()])}>+ Añadir condición</button>
  </div>
 );
 const updateAction=(ri:number,ai:number,action:MechanicAction)=>setRule(ri,{...rules[ri],actions:rules[ri].actions.map((a,k)=>k===ai?action:a)});
 return <section className="space-y-4 rounded-xl border border-violet-700/50 p-4">
  <h3 className="text-lg font-semibold">Mecánicas y habilidades vinculadas</h3>
  <p className="text-xs text-zinc-400">Reglas configurables para pasivas, campos, exposición, estados y técnicas combinadas. No crea habilidades automáticamente. Los materiales usan claves como ARENA o FUEGO.</p>
  <div className="grid gap-3 sm:grid-cols-2">
   <label className={label}>Familia de habilidades<input className={input} maxLength={80} placeholder="Ej. Control elemental" value={mechanics.family??""} onChange={e=>onChange({...mechanics,family:e.target.value})}/></label>
   <label className={label}>Habilidad madre<select className={input} value={mechanics.parentSkillId??""} onChange={e=>onChange({...mechanics,parentSkillId:e.target.value?Number(e.target.value):undefined})}><option value="">Ninguna</option>{skills.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
  </div>
  <details className="rounded-lg border border-violet-800/50 p-3 text-xs text-zinc-300">
   <summary className="cursor-pointer font-medium text-violet-200">
    Golpe imbuido: marca por contacto o daño real
   </summary>
   <p className="mt-2 text-zinc-400">
    Solo para una técnica ofensiva de contacto aprobada que reparta el 100 %
    entre daño físico y mágico, y tenga un tercer efecto modular COMPOSED
    con debilitamiento revisado. Para exigir daño real, configura el
    micromódulo con disparador «Al activar» y elige un canal aquí.
    Para una marca que requiere solo contacto, cambia el disparador del
    micromódulo a «Impacto» y su tipo a «Personaje»; deja «No configurar»
    en este selector. Las esquivas, los desvíos y las barreras que detienen
    el golpe impiden la marca de contacto.
   </p>
   <label className={label+" mt-3"}>Canal de daño que activa el debilitamiento
    <select className={input} value={mechanics.hybridStatusChannel??""}
     onChange={e=>onChange({...mechanics,
      hybridStatusChannel:e.target.value?
       e.target.value as "PHYSICAL"|"MAGICAL":undefined,
      hybridStatusMinimumHp:e.target.value?mechanics.hybridStatusMinimumHp:undefined})}>
     <option value="">No configurar</option>
     <option value="PHYSICAL">Daño físico real</option>
     <option value="MAGICAL">Daño mágico real</option>
    </select>
   </label>
   <label className={label+" mt-3"}>
    Mínimo de HP reales perdidos por el canal seleccionado
    <select className={input} disabled={!mechanics.hybridStatusChannel}
     value={mechanics.hybridStatusMinimumHp??1}
     onChange={e=>onChange({...mechanics,
      hybridStatusMinimumHp:Number(e.target.value)===1?undefined:Number(e.target.value)})}>
     {[1,2,3,5,10,20].map(n=><option key={n} value={n}>
      {n} HP {n===1?"(predeterminado)":""}
     </option>)}
    </select>
   </label>
   <p className="mt-2 text-zinc-500">
    Este mínimo se calcula después de resistencias, esquiva y cobertura,
    usando solamente el HP que realmente perdió el objetivo. No altera
    cuánto daño causa el golpe ni cambia el precio ya aprobado.
   </p>
  </details>
  <VariableResistanceEditor value={mechanics.variableResistance} statistics={statistics} onChange={variableResistance=>onChange({...mechanics,variableResistance})}/>
  <div><p className="mb-2 text-sm font-semibold">Condiciones para activar</p>{renderConditions(mechanics.activationConditions??[],setConditions)}</div>
  <div className="space-y-3">
   <div className="flex items-center justify-between"><h4 className="font-semibold">Reglas de interacción ({rules.length}/12)</h4><button type="button" disabled={rules.length>=12} className="rounded border border-violet-600 px-3 py-2 text-xs" onClick={()=>onChange({...mechanics,rules:[...rules,blankRule()]})}>+ Nueva regla</button></div>
   {rules.map((rule,ri)=><div key={ri} className="space-y-3 rounded-xl border border-zinc-700 p-3">
    <div className="grid gap-3 sm:grid-cols-2">
     <label className={label}>Cuándo se ejecuta<select className={input} value={rule.event} onChange={e=>setRule(ri,{...rule,event:e.target.value as MechanicEvent})}>{events.map(e=><option key={e} value={e}>{eventLabels[e]}</option>)}</select></label>
     <label className={label}>Habilidad vinculada (opcional)<select className={input} value={rule.linkedSkillId??""} onChange={e=>setRule(ri,{...rule,linkedSkillId:e.target.value?Number(e.target.value):undefined})}><option value="">Ninguna</option>{skills.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    </div>
    <p className="text-sm font-medium">Condiciones adicionales</p>
    {renderConditions(rule.conditions??[],v=>setRule(ri,{...rule,conditions:v}))}
    <p className="text-sm font-medium">Acciones</p>
    {rule.actions.map((a,ai)=><div key={ai} className="space-y-2 rounded-lg bg-zinc-900/60 p-3">
     <div className="flex gap-2"><label className={label+" flex-1"}>Acción<select className={input} value={a.kind} onChange={e=>{
       const kind=e.target.value;
       const next:MechanicAction=kind==="CREATE_FIELD"?{kind,material:"NEUTRAL",rings:[{radius:5,ppm:100}]}:kind==="CHANGE_FIELD"?{kind,material:"NEUTRAL",ppm:100}:kind==="EXPOSE"?{kind,material:"NEUTRAL",amount:100,target:"OPPONENT",fromField:true}:kind==="CLEANSE"?{kind,material:"NEUTRAL",amount:100,target:"SELF"}:kind==="MANA_WARD"?{kind,level:1,manaInvestment:10,target:"SELF",durationTurns:1}:blankAction();
       updateAction(ri,ai,next);
     }}>{actionKinds.map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label>
      <button type="button" className="self-end rounded border border-red-900 px-2 py-2 text-xs" onClick={()=>setRule(ri,{...rule,actions:rule.actions.filter((_,j)=>ai!==j)})}>Quitar</button></div>
     {a.kind==="CREATE_FIELD"&&<>
      <label className={label}>Material<input className={input} value={a.material} onChange={e=>updateAction(ri,ai,{...a,material:e.target.value.toUpperCase()})}/></label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {a.rings.map((ring,i)=><div key={i} className="space-y-1">
       <label className={label}>Radio exterior (m)<input className={input} type="number" min="0.01" value={ring.radius} onChange={e=>updateAction(ri,ai,{...a,rings:a.rings.map((r,j)=>j===i?{...r,radius:Number(e.target.value)}:r)})}/></label>
       <label className={label}>Concentración ppm<input className={input} type="number" min="0" value={ring.ppm} onChange={e=>updateAction(ri,ai,{...a,rings:a.rings.map((r,j)=>j===i?{...r,ppm:Number(e.target.value)}:r)})}/></label>
      </div>)}</div>
      <button type="button" disabled={a.rings.length>=12} onClick={()=>updateAction(ri,ai,{...a,rings:[...a.rings,{radius:(a.rings.at(-1)?.radius??0)+5,ppm:100}]})} className="rounded border border-zinc-700 px-2 py-1 text-xs">+ Anillo</button>
      <div className="grid gap-2 sm:grid-cols-3">
       <label className={label}>Dispersión (m/turno)<input className={input} type="number" min="0" value={a.spreadMeters??0} onChange={e=>updateAction(ri,ai,{...a,spreadMeters:Number(e.target.value)})}/></label>
       <label className={label}>Transferencia (%)<input className={input} type="number" min="0" max="100" value={a.transferPercent??50} onChange={e=>updateAction(ri,ai,{...a,transferPercent:Number(e.target.value)})}/></label>
       <label className={label}>Duración (turnos; vacío = persistente)<input className={input} type="number" min="1" value={a.durationTurns??""} onChange={e=>updateAction(ri,ai,{...a,durationTurns:e.target.value?Number(e.target.value):undefined})}/></label>
      </div>
     </>}
     {(a.kind==="EXPOSE"||a.kind==="CLEANSE"||a.kind==="CHANGE_FIELD")&&<>
      <label className={label}>Material<input className={input} value={a.material} onChange={e=>updateAction(ri,ai,{...a,material:e.target.value.toUpperCase()} as MechanicAction)}/></label>
      <label className={label}>Cantidad {a.kind==="CHANGE_FIELD"?"ppm":"unidades"}<input className={input} type="number" min="0" value={a.kind==="CHANGE_FIELD"?a.ppm:a.amount} onChange={e=>updateAction(ri,ai,{...a,[a.kind==="CHANGE_FIELD"?"ppm":"amount"]:Number(e.target.value)} as MechanicAction)}/></label>
     </>}
     {(a.kind==="EXPOSE"||a.kind==="CLEANSE"||a.kind==="STATUS")&&<label className={label}>Objetivo<select className={input} value={a.target} onChange={e=>updateAction(ri,ai,{...a,target:e.target.value} as MechanicAction)}>{targets.map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label>}
     {a.kind==="EXPOSE"&&<label className="flex gap-2 text-xs text-zinc-300"><input type="checkbox" checked={Boolean(a.fromField)} onChange={e=>updateAction(ri,ai,{...a,fromField:e.target.checked})}/>Usar ppm del campo según distancia real del objetivo</label>}
     {a.kind==="STATUS"&&<div className="grid gap-2 sm:grid-cols-4">
      <label className={label}>Estado<input className={input} value={a.status} onChange={e=>updateAction(ri,ai,{...a,status:e.target.value.toUpperCase()})}/></label>
      <label className={label}>Duración (turnos)<input className={input} type="number" min="1" value={a.durationTurns} onChange={e=>updateAction(ri,ai,{...a,durationTurns:Number(e.target.value)})}/></label>
      <label className={label}>Estadística (opcional)<input className={input} value={a.stat??""} onChange={e=>updateAction(ri,ai,{...a,stat:e.target.value.toUpperCase()||undefined})}/></label>
      <label className={label}>Multiplicador (0.8 = −20%)<input className={input} type="number" step="0.05" min="0" value={a.multiplier??1} onChange={e=>updateAction(ri,ai,{...a,multiplier:Number(e.target.value)})}/></label>
     </div>}
     {a.kind==="MANA_WARD"&&<div className="grid gap-2 sm:grid-cols-3">
      <label className={label}>Maná dedicado<input className={input} type="number" min="1" value={a.manaInvestment} onChange={e=>updateAction(ri,ai,{...a,manaInvestment:Number(e.target.value)})}/></label>
      <label className={label}>Nivel<input className={input} type="number" min="1" value={a.level} onChange={e=>updateAction(ri,ai,{...a,level:Number(e.target.value)})}/></label>
      <label className={label}>Duración (turnos)<input className={input} type="number" min="1" value={a.durationTurns} onChange={e=>updateAction(ri,ai,{...a,durationTurns:Number(e.target.value)})}/></label>
     </div>}
    </div>)}
    <div className="flex gap-2">
     <button type="button" disabled={rule.actions.length>=10} className="rounded border border-zinc-600 px-3 py-2 text-xs" onClick={()=>setRule(ri,{...rule,actions:[...rule.actions,blankAction()]})}>+ Acción</button>
     <button type="button" className="rounded border border-red-800 px-3 py-2 text-xs text-red-300" onClick={()=>onChange({...mechanics,rules:rules.filter((_,i)=>i!==ri)})}>Eliminar regla</button>
    </div>
   </div>)}
  </div>
 </section>;
}
