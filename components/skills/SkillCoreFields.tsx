"use client";

import {useEffect,useState,type ReactNode} from "react";
import { SkillFieldHelp, type SkillHelpKey } from "./SkillFieldHelp";
import type { SkillMechanics } from "@/lib/skills/interaction-engine";
import {COOLDOWN_OPTIONS,cooldownDiscountPercent} from "@/lib/skills/cooldown";
import {COMBAT_ATTACK_TYPE_OPTIONS,COMBAT_DEFENSE_TYPE_OPTIONS} from "@/lib/combat/matchup-types";
import {SKILL_AREA_OPTIONS,editorSkillArea,formatSkillArea} from "@/lib/skills/area-of-effect";

export type SkillCore = {
  name: string; description: string; category: string; cost: number; duration: string; cooldown: string; speed: string;
  areaOfEffect: string; attackType?: string | null; defenseType?: string | null; maxRangeMeters?: number; maintenanceCost: number; accumulationPerTick: number; accumulationCost: number; condition: string; mechanics?: SkillMechanics;
};
const categories: [string,string][] = [["OFFENSIVE","Ofensiva"],["PASSIVE","Pasiva"],["SUPPORT","Soporte"],["UTILITY","Utilidad"],["BASIC","Básica"]];
const durations = ["Instantánea","1 turno","2 turnos","3 turnos","5 turnos","10 turnos","20 turnos","No termina"];

const cooldowns = COOLDOWN_OPTIONS.map(option=>option.value);
const cooldownName=(value:string)=>value==="Sin cooldown"?"Sin tiempo de espera":value;
export function SkillCoreFields<T extends SkillCore>({form,onChange,effectEditor}:{form:T;onChange:(next:T)=>void;effectEditor?:ReactNode}) {
  const [speedSettings,setSpeedSettings]=useState<{defaultKey:string;stats:{key:string;name:string}[]}>({defaultKey:"agility",stats:[{key:"agility",name:"Agilidad"}]});
  useEffect(()=>{fetch("/api/management/effects").then(r=>r.ok?r.json():null).then(d=>{if(d?.attackSpeedStats?.length)setSpeedSettings({defaultKey:d.defaultAttackSpeedStat??"agility",stats:d.attackSpeedStats});}).catch(()=>{});},[]);
  const defaultSpeedName=speedSettings.stats.find(stat=>stat.key===speedSettings.defaultKey)?.name??speedSettings.defaultKey;
  const areaState=editorSkillArea(form.areaOfEffect);
  const speeds:[string,string][]=[["DEFAULT",`Predeterminada (${defaultSpeedName})`],...speedSettings.stats.map(stat=>[stat.key,`${stat.name} (+5 PCH)`] as [string,string])];
  if(form.speed&&!speeds.some(([key])=>key===form.speed))speeds.push([form.speed,`${form.speed} (valor anterior)`]);
  const set = <K extends keyof SkillCore>(key:K,value:SkillCore[K]) => onChange({...form,[key]:value});
  const cls = "mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white";
  const wrap=(label:string,key:SkillHelpKey,control:ReactNode)=><label className="block text-sm text-zinc-400">{label}<SkillFieldHelp field={key}/>{control}</label>;
  const number=(key:"cost"|"maintenanceCost"|"accumulationPerTick"|"accumulationCost"|"maxRangeMeters",min=0,max?:number)=><input type="number" min={min} max={max} step="1" value={form[key]??5} onChange={e=>set(key,Number(e.target.value))} className={cls}/>;
  const select=(key:"category"|"duration"|"cooldown"|"speed"|"areaOfEffect",values:readonly (readonly [string,string])[])=><select value={form[key]} onChange={e=>set(key,e.target.value)} className={cls}>{values.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select>;
  return <div className="grid gap-4 sm:grid-cols-2">
    {wrap("Nombre","name",<input value={form.name} onChange={e=>set("name",e.target.value)} className={cls}/>)}
    {wrap("Descripción","description",<textarea rows={3} value={form.description} onChange={e=>set("description",e.target.value)} className={cls}/>)}
    {wrap("Categoría","category",select("category",categories))}
    <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
      <label className="block text-sm text-zinc-400">Tipo de ataque
        <select value={form.attackType??""} onChange={e=>set("attackType",e.target.value||null)} className={cls}>
          <option value="">No aplica</option>
          {COMBAT_ATTACK_TYPE_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="block text-sm text-zinc-400">Tipo de defensa
        <select value={form.defenseType??""} onChange={e=>set("defenseType",e.target.value||null)} className={cls}>
          <option value="">No aplica</option>
          {COMBAT_DEFENSE_TYPE_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <p className="text-xs text-zinc-500 sm:col-span-2">Tipos para los enfrentamientos del combate, independientes de los ataques y defensas básicos del personaje. Una habilidad puede atacar, defender, hacer ambas cosas o ninguna. No representan su elemento ni cambian su PCH.</p>
    </div>
    {Boolean(form.condition?.trim()) && (
      <div className="sm:col-span-2">
        <label htmlFor="skill-legacy-condition" className="block text-sm text-zinc-300">
          Condición narrativa anterior <span className="text-xs text-zinc-500">(solo informativa)</span>
        </label>
        <input id="skill-legacy-condition" type="text" value={form.condition}
          onChange={e=>set("condition",e.target.value)}
          className={cls} />
        <p className="mt-1 text-xs text-zinc-500">Es un texto heredado: no activa efectos automáticamente. Puedes borrarlo; usa las condiciones de los módulos para reglas ejecutables.</p>
        <button type="button" onClick={()=>set("condition","")} className="mt-2 text-xs text-zinc-400 underline hover:text-white">Eliminar condición narrativa anterior</button>
      </div>
    )}
    {effectEditor && <div className="sm:col-span-2">{effectEditor}</div>}
    {wrap("Maná por uso","cost",number("cost"))}
    {wrap("Duración","duration",select("duration",durations.map(x=>[x,x] as const)))}
    {wrap("Tiempo de espera entre usos","cooldown",<><select value={form.cooldown} onChange={e=>set("cooldown",e.target.value)} className={cls}>{cooldowns.map(c=><option key={c} value={c}>{cooldownName(c)}{cooldownDiscountPercent(c,form.duration,form.category)>0?" (−"+cooldownDiscountPercent(c,form.duration,form.category)+"% PCH)":""}</option>)}</select>{form.cooldown==="Igual a duración" && cooldownDiscountPercent(form.cooldown,form.duration,form.category)===0 && <span className="mt-1 block text-xs text-amber-300">La duración no es finita en turnos, por lo que no aplica descuento.</span>}</>)}
    {wrap("Velocidad","speed",select("speed",speeds))}
    {wrap("Área de efecto","areaOfEffect",<div className="space-y-2">
      <select value={areaState.kind} aria-label="Tipo de área de la habilidad"
        onChange={e=>set("areaOfEffect",formatSkillArea(e.target.value as Exclude<typeof areaState.kind,"LEGACY">,
         e.target.value==="CIRCLE"?areaState.radiusMeters:undefined))}
        className={cls}>
        {SKILL_AREA_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
        {areaState.kind==="LEGACY"&&<option value="LEGACY" disabled>Descripción anterior (pendiente de clasificar)</option>}
      </select>
      {areaState.kind==="CIRCLE"&&<label className="block text-xs text-zinc-300">
       Radio del círculo (m)
       <input type="number" aria-label="Radio del área circular en metros"
         min={0.1} max={10} step={0.1} value={areaState.radiusMeters}
         onChange={e=>{const n=Number(e.target.value);
          if(Number.isFinite(n)&&n>=0.1&&n<=10&&Math.abs(Math.round(n*100)-n*100)<=1e-7)
           set("areaOfEffect",formatSkillArea("CIRCLE",n));}}
         className={cls}/>
       <span className="mt-1 block text-zinc-500">El radio es distinto del alcance de lanzamiento. En el combate se representa sobre un lienzo local de 10 × 10 m.</span>
      </label>}
      {areaState.kind==="LEGACY"&&<p className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-2 text-xs text-amber-200">
       Área antigua: «{areaState.legacyValue}». Se conserva sin alterar hasta que selecciones una categoría normalizada. No se interpretará como círculo automáticamente.
      </p>}
      {areaState.kind==="SELF_FIELD"&&<p className="text-xs text-zinc-400">Campo centrado en el usuario. Sus dimensiones mecánicas requieren una habilidad compatible; no presupone un radio.</p>}
    </div>)}
    {wrap("Distancia máxima (m)","maxRangeMeters",number("maxRangeMeters",0,100))}
    {form.duration !== "Instantánea" && wrap("Costo por turno","maintenanceCost",number("maintenanceCost"))}
    {wrap("Acumulaciones por tick","accumulationPerTick",number("accumulationPerTick"))}
    {form.accumulationPerTick>0 && wrap("Costo de acumulaciones","accumulationCost",number("accumulationCost"))}
  </div>;
}
