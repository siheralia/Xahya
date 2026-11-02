"use client";

import {useEffect,useState,type ReactNode} from "react";
import { SkillFieldHelp, type SkillHelpKey } from "./SkillFieldHelp";
import type { SkillMechanics } from "@/lib/skills/interaction-engine";
import { isPassiveConditionMissing, PASSIVE_CONDITION_REQUIRED_MESSAGE } from "@/lib/skills/passive-condition";

export type SkillCore = {
  name: string; description: string; category: string; cost: number; duration: string; cooldown: string; speed: string;
  areaOfEffect: string; maxRangeMeters?: number; maintenanceCost: number; accumulationPerTick: number; accumulationCost: number; condition: string; mechanics?: SkillMechanics;
};
const categories: [string,string][] = [["OFFENSIVE","Ofensiva"],["PASSIVE","Pasiva"],["SUPPORT","Soporte"],["UTILITY","Utilidad"],["BASIC","Básica"]];
const durations = ["Instantánea","1 turno","2 turnos","3 turnos","5 turnos","10 turnos","20 turnos","No termina"];

const cooldowns = ["Sin cooldown","1 turno","2 turnos","3 turnos","5 turnos","10 turnos","Una vez por combate","Igual a duración"];
export function SkillCoreFields<T extends SkillCore>({form,onChange,effectEditor}:{form:T;onChange:(next:T)=>void;effectEditor?:ReactNode}) {
  const [speedSettings,setSpeedSettings]=useState<{defaultKey:string;stats:{key:string;name:string}[]}>({defaultKey:"agility",stats:[{key:"agility",name:"Agilidad"}]});
  useEffect(()=>{fetch("/api/management/effects").then(r=>r.ok?r.json():null).then(d=>{if(d?.attackSpeedStats?.length)setSpeedSettings({defaultKey:d.defaultAttackSpeedStat??"agility",stats:d.attackSpeedStats});}).catch(()=>{});},[]);
  const defaultSpeedName=speedSettings.stats.find(stat=>stat.key===speedSettings.defaultKey)?.name??speedSettings.defaultKey;
  const passiveConditionMissing = isPassiveConditionMissing(form.category, form.condition);
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
    {form.category==="PASSIVE" && (
      <div className="sm:col-span-2">
        <label htmlFor="skill-passive-condition" className="block text-sm text-zinc-300">
          Condición general de la pasiva (obligatoria) <span className="font-bold text-amber-300" aria-hidden="true">*</span>
          <SkillFieldHelp field="condition"/>
        </label>
        <input
          id="skill-passive-condition"
          type="text"
          value={form.condition}
          onChange={e=>set("condition",e.target.value)}
          required
          aria-required="true"
          aria-invalid={passiveConditionMissing}
          aria-describedby="skill-passive-condition-help"
          placeholder="Ej.: Sikatā aprendida y arena presente; se endurece ante impactos"
          className={cls+" "+(passiveConditionMissing?"border-amber-500 focus:border-amber-400":"")}
        />
        <p id="skill-passive-condition-help" role={passiveConditionMissing?"alert":undefined} className={"mt-1 text-xs "+(passiveConditionMissing?"text-amber-300":"text-zinc-400")}>
          {passiveConditionMissing?PASSIVE_CONDITION_REQUIRED_MESSAGE:"Este campo es obligatorio para pasivas. Es distinto de «Condición del efecto» y de «Condiciones para activar» en Mecánicas."}
        </p>
      </div>
    )}
    {effectEditor && <div className="sm:col-span-2">{effectEditor}</div>}
    {wrap("Maná por uso","cost",number("cost"))}
    {wrap("Duración","duration",select("duration",durations.map(x=>[x,x] as const)))}
    {wrap("Cooldown","cooldown",select("cooldown",cooldowns.map(x=>[x,x] as const)))}
    {wrap("Velocidad","speed",select("speed",speeds))}
    {wrap("Área de efecto","areaOfEffect",<input value={form.areaOfEffect} onChange={e=>set("areaOfEffect",e.target.value)} placeholder="Objetivo único / Área circular de 3 m" className={cls}/>)}
    {wrap("Distancia máxima (m)","maxRangeMeters",number("maxRangeMeters",0,100))}
    {form.duration !== "Instantánea" && wrap("Costo por turno","maintenanceCost",number("maintenanceCost"))}
    {wrap("Acumulaciones por tick","accumulationPerTick",number("accumulationPerTick"))}
    {form.accumulationPerTick>0 && wrap("Costo de acumulaciones","accumulationCost",number("accumulationCost"))}
  </div>;
}
