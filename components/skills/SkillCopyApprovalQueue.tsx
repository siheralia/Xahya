"use client";

import {useCallback,useEffect,useState} from "react";

type CopyRequest={
  id:number;characterId:number;copierSkillId:number;sourceSkillId:number;
  characterName:string;copierName:string;sourceName:string;sourceCharacterName:string;
  mode:"PERMANENT"|"TEMPORARY"|"IMITATION"|"COLLECTION";status:string;
  createdAtText:string;copiedSkillId:number|null;
};
const MODES:Record<CopyRequest["mode"],string>={
  PERMANENT:"Permanente",TEMPORARY:"Temporal",IMITATION:"Imitación",COLLECTION:"Colección",
};

export function SkillCopyApprovalQueue(){
  const [requests,setRequests]=useState<CopyRequest[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<number|null>(null);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    try{
      const response=await fetch("/api/management/skills/copies",{cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error??"No se pudieron cargar las solicitudes de copia.");
      setRequests(Array.isArray(data.requests)?data.requests:[]);
    }catch(e){setError(e instanceof Error?e.message:"No se pudieron cargar las solicitudes de copia.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  async function review(id:number,decision:"APPROVED"|"REJECTED"){
    if(busy!==null)return;
    setBusy(id);setError("");setMessage("");
    try{
      const response=await fetch("/api/management/skills/copies/"+id,{
        method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision})
      });
      const data=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(data?.error??"No se pudo revisar la solicitud.");
      setMessage(decision==="APPROVED"
        ?"Copia aprobada y concedida al personaje."
        :"Solicitud de copia rechazada; no se concedió ninguna habilidad.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"No se pudo revisar la solicitud.");}
    finally{setBusy(null);}
  }
  const pending=requests.filter(r=>r.status==="PENDING");
  return <section className="mt-6 rounded-xl border border-purple-700/40 p-5">
    <h2 className="text-xl font-semibold">Solicitudes de copia de habilidades</h2>
    <p className="mt-1 text-sm text-zinc-400">Aprobar o rechazar cada intento de copia. No se entrega ninguna habilidad hasta su aprobación.</p>
    {error&&<p role="alert" className="mt-3 rounded-lg border border-red-700/40 p-3 text-sm text-red-300">{error}</p>}
    {message&&<p role="status" className="mt-3 rounded-lg border border-emerald-700/40 p-3 text-sm text-emerald-300">{message}</p>}
    {loading?<p className="mt-4 text-sm text-zinc-400">Cargando solicitudes…</p>:
      <div className="mt-4 space-y-3">
        {pending.map(r=><article key={r.id} className="rounded-lg border border-purple-800/50 bg-purple-950/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-zinc-100">{r.characterName} quiere copiar «{r.sourceName}»</p>
              <p className="mt-1 text-xs text-zinc-400">
                Habilidad de copia: {r.copierName} · Modalidad: {MODES[r.mode]??r.mode}
              </p>
              <p className="mt-1 text-xs text-zinc-400">Origen: {r.sourceCharacterName} · Solicitud #{r.id}</p>
            </div>
            <span className="rounded-full border border-amber-500/30 px-2 py-1 text-xs text-amber-200">Pendiente</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy!==null} onClick={()=>review(r.id,"APPROVED")}
              className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50">Aprobar copia</button>
            <button type="button" disabled={busy!==null} onClick={()=>review(r.id,"REJECTED")}
              className="rounded-lg border border-red-700 px-4 py-2 text-sm text-red-300 disabled:opacity-50">Rechazar</button>
          </div>
        </article>)}
        {pending.length===0&&<p className="text-sm text-zinc-500">No hay solicitudes de copia pendientes.</p>}
      </div>}
  </section>;
}
