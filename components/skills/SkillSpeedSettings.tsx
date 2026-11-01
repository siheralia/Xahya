"use client";
import {useEffect,useState} from "react";
export function SkillSpeedSettings(){
 const [stats,setStats]=useState<{key:string;name:string}[]>([]);
 const [selected,setSelected]=useState("agility");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 useEffect(()=>{fetch("/api/management/effects").then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error??"Error al cargar");return d;}).then(d=>{setStats(d.attackSpeedStats??[]);setSelected(d.defaultAttackSpeedStat??"agility");}).catch(e=>setNotice(String(e)));},[]);
 async function save(){setBusy(true);setNotice("");try{const r=await fetch("/api/management/effects",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"default-attack-speed",statKey:selected})});const d=await r.json();if(!r.ok)throw Error(d.error??"Error al guardar");setSelected(d.defaultAttackSpeedStat);setNotice("Velocidad predeterminada guardada.");}catch(e){setNotice(e instanceof Error?e.message:"Error");}finally{setBusy(false);}}
 return <section className="rounded-xl border border-zinc-700 p-4"><h2 className="font-semibold">Velocidad predeterminada de habilidades</h2><p className="my-2 text-sm text-zinc-400">Estadística usada para determinar la velocidad de ejecución o desplazamiento del ataque. Elegir otra estadística en una habilidad cuesta 5 PCH adicionales.</p><div className="flex flex-wrap gap-2"><select aria-label="Estadística predeterminada de velocidad" value={selected} onChange={e=>setSelected(e.target.value)} className="rounded bg-zinc-900 p-2">{stats.map(s=><option key={s.key} value={s.key}>{s.name}</option>)}</select><button type="button" disabled={busy||!stats.length} onClick={save} className="rounded bg-cyan-700 px-3 py-2 disabled:opacity-50">Guardar</button></div>{notice&&<p role="status" className="mt-2 text-sm text-cyan-300">{notice}</p>}</section>;
}
