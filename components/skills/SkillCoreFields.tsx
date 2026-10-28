"use client";

import { SkillFieldHelp, type SkillHelpKey } from "./SkillFieldHelp";

export type SkillCore = {
  name: string; description: string; category: string; cost: number; duration: string; cooldown: string; speed: string;
  areaOfEffect: string; maxRangeMeters?: number; maintenanceCost: number; accumulationPerTick: number; accumulationCost: number; condition: string;
};
const categories = [["OFFENSIVE","Ofensiva"],["PASSIVE","Pasiva"],["SUPPORT","Soporte"],["UTILITY","Utilidad"],["BASIC","Básica"]];
const durations = ["Instantánea","1 turno","2 turnos","3 turnos","5 turnos","10 turnos","20 turnos","No termina"];
const speeds = [["DEFAULT","Predeterminada"],["Instantánea","Instantánea (+5 PCH)"],["1 turno","1 turno (+5 PCH)"],["2 turnos","2 turnos (+5 PCH)"],["3 turnos","3 turnos (+5 PCH)"],["No requiere","No requiere (+5 PCH)"]];
const cooldowns = ["Sin cooldown","1 turno","2 turnos","3 turnos","5 turnos","10 turnos","Una vez por combate","Igual a duración"];
export function SkillCoreFields<T extends SkillCore>({form,onChange}:{form:T;onChange:(next:T)=>void}) {
  const set = <K extends keyof SkillCore>(key:K,value:SkillCore[K]) => onChange({...form,[key]:value});
  const cls = "mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white";
  const wrap=(label:string,key:SkillHelpKey,control:React.ReactNode)=><label className="block text-sm text-zinc-400">{label}<SkillFieldHelp field={key}/>{control}</label>;
  const number=(key:"cost"|"maintenanceCost"|"accumulationPerTick"|"accumulationCost"|"maxRangeMeters",min=0,max?:number)=><input type="number" min={min} max={max} step="1" value={form[key]??5} onChange={e=>set(key,Number(e.target.value))} className={cls}/>;
  const select=(key:"category"|"duration"|"cooldown"|"speed"|"areaOfEffect",values:readonly (readonly [string,string])[])=><select value={form[key]} onChange={e=>set(key,e.target.value)} className={cls}>{values.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select>;
  return <div className="grid gap-4 sm:grid-cols-2">
    {wrap("Nombre","name",<input value={form.name} onChange={e=>set("name",e.target.value)} className={cls}/>)}
    {wrap("Descripción","description",<textarea rows={3} value={form.description} onChange={e=>set("description",e.target.value)} className={cls}/>)}
    {wrap("Categoría","category",select("category",categories))}
    {wrap("Maná por uso","cost",number("cost"))}
    {wrap("Duración","duration",select("duration",durations.map(x=>[x,x] as const)))}
    {wrap("Cooldown","cooldown",select("cooldown",cooldowns.map(x=>[x,x] as const)))}
    {wrap("Velocidad","speed",select("speed",speeds))}
    {wrap("Área de efecto","areaOfEffect",<input value={form.areaOfEffect} onChange={e=>set("areaOfEffect",e.target.value)} placeholder="Objetivo único / Área circular de 3 m" className={cls}/>)}
    {wrap("Distancia máxima (m)","maxRangeMeters",number("maxRangeMeters",1,100))}
    {form.duration !== "Instantánea" && wrap("Costo por turno","maintenanceCost",number("maintenanceCost"))}
    {wrap("Acumulaciones por tick","accumulationPerTick",number("accumulationPerTick"))}
    {form.accumulationPerTick>0 && wrap("Costo de acumulaciones","accumulationCost",number("accumulationCost"))}
    {form.category==="PASSIVE" && wrap("Condición","condition",<input value={form.condition} onChange={e=>set("condition",e.target.value)} className={cls}/>)}
  </div>;
}
