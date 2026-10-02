"use client";

import { useEffect, useState } from "react";

type Character = { id: number; name: string; flair: string | null };
type Contract = { id: number; character: Character | null };
type Position = {
  id: number; title: string; startTime: string; endTime: string; salary: number;
  salaryFrequency: string; salaryDayOfWeek: number; payerType: string; payerCharacter: Character | null;
  contracts: Contract[];
};
type Business = {
  id: number; name: string; description: string | null; ownerCharacterId: number;
  ownerCharacter: Character | null; passiveIncome: number; passiveFrequency: string;
  passiveDayOfWeek: number; passiveTime: string; active: boolean; positions: Position[];
};

const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function BusinessesManagementPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [business, setBusiness] = useState({ name: "", description: "", ownerCharacterId: "", passiveIncome: 0, passiveFrequency: "WEEKLY", passiveDayOfWeek: 0, passiveTime: "18:00" });
  const [position, setPosition] = useState({ businessId: "", title: "Encargado de tienda", description: "", startTime: "14:00", endTime: "15:00", salary: 500, salaryFrequency: "DAILY", salaryDayOfWeek: 0, payerType: "SYSTEM", payerCharacterId: "" });
  const [hire, setHire] = useState({ positionId: "", characterId: "" });

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/management/businesses", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudieron cargar los negocios.");
      setBusinesses(data.businesses ?? []);
      setCharacters(data.characters ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los negocios.");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function post(body: Record<string, unknown>, message: string) {
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/management/businesses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo completar la operación.");
      setSuccess(message);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la operación.");
      return false;
    } finally { setSaving(false); }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div>
          <h1 className="text-4xl font-bold">Negocios y empleos</h1>
          <p className="mt-2 text-zinc-500">Crea negocios, puestos, horarios, salarios y contratos. Los pagos se procesan automáticamente.</p>
        </div>

        {error && <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
        {success && <div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}

        <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold">Crear negocio</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label><span className="text-sm text-zinc-400">Nombre</span><input value={business.name} onChange={e=>setBusiness({...business,name:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
            <label><span className="text-sm text-zinc-400">Dueño</span><select value={business.ownerCharacterId} onChange={e=>setBusiness({...business,ownerCharacterId:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="">Selecciona personaje</option>{characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="md:col-span-2"><span className="text-sm text-zinc-400">Descripción</span><textarea value={business.description} onChange={e=>setBusiness({...business,description:e.target.value})} className="mt-2 min-h-20 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
            <label><span className="text-sm text-zinc-400">Ganancia pasiva</span><input type="number" min={0} value={business.passiveIncome} onChange={e=>setBusiness({...business,passiveIncome:Number(e.target.value)||0})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
            <label><span className="text-sm text-zinc-400">Frecuencia</span><select value={business.passiveFrequency} onChange={e=>setBusiness({...business,passiveFrequency:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="WEEKLY">Semanal</option><option value="DAILY">Diaria</option></select></label>
            {business.passiveFrequency === "WEEKLY" && <label><span className="text-sm text-zinc-400">Día de pago</span><select value={business.passiveDayOfWeek} onChange={e=>setBusiness({...business,passiveDayOfWeek:Number(e.target.value)})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">{days.map((d,i)=><option key={i} value={i}>{d}</option>)}</select></label>}
            <label><span className="text-sm text-zinc-400">Hora de pago</span><input type="time" value={business.passiveTime} onChange={e=>setBusiness({...business,passiveTime:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
          </div>
          <button disabled={saving} onClick={async()=>{if(await post({action:"createBusiness",...business,ownerCharacterId:Number(business.ownerCharacterId)},"Negocio creado.")) setBusiness({...business,name:"",description:"",ownerCharacterId:"",passiveIncome:0});}} className="mt-5 rounded-lg bg-white px-5 py-3 font-semibold text-black disabled:opacity-40">Crear negocio</button>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold">Crear puesto</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label><span className="text-sm text-zinc-400">Negocio</span><select value={position.businessId} onChange={e=>setPosition({...position,businessId:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="">Trabajo del sistema</option>{businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <label><span className="text-sm text-zinc-400">Puesto</span><input value={position.title} onChange={e=>setPosition({...position,title:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
            <label><span className="text-sm text-zinc-400">Inicio</span><input type="time" value={position.startTime} onChange={e=>setPosition({...position,startTime:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
            <label><span className="text-sm text-zinc-400">Fin</span><input type="time" value={position.endTime} onChange={e=>setPosition({...position,endTime:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
            <label><span className="text-sm text-zinc-400">Salario</span><input type="number" min={0} value={position.salary} onChange={e=>setPosition({...position,salary:Number(e.target.value)||0})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"/></label>
            <label><span className="text-sm text-zinc-400">Frecuencia</span><select value={position.salaryFrequency} onChange={e=>setPosition({...position,salaryFrequency:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="DAILY">Diario</option><option value="WEEKLY">Semanal</option></select></label>
            {position.salaryFrequency === "WEEKLY" && <label><span className="text-sm text-zinc-400">Día de pago</span><select value={position.salaryDayOfWeek} onChange={e=>setPosition({...position,salaryDayOfWeek:Number(e.target.value)})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2">{days.map((d,i)=><option key={i} value={i}>{d}</option>)}</select></label>}
            <label><span className="text-sm text-zinc-400">Pagador</span><select value={position.payerType} onChange={e=>setPosition({...position,payerType:e.target.value,payerCharacterId:""})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="SYSTEM">Sistema</option><option value="CHARACTER">Personaje</option></select></label>
            {position.payerType === "CHARACTER" && <label><span className="text-sm text-zinc-400">Personaje pagador</span><select value={position.payerCharacterId} onChange={e=>setPosition({...position,payerCharacterId:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="">Selecciona personaje</option>{characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
          </div>
          <button disabled={saving} onClick={()=>post({action:"createPosition",...position,businessId:Number(position.businessId),salaryDayOfWeek:Number(position.salaryDayOfWeek),salary:Number(position.salary),payerCharacterId:position.payerCharacterId?Number(position.payerCharacterId):null},"Puesto creado.")} className="mt-5 rounded-lg bg-white px-5 py-3 font-semibold text-black disabled:opacity-40">Crear puesto</button>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold">Contratar personaje</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label><span className="text-sm text-zinc-400">Puesto</span><select value={hire.positionId} onChange={e=>setHire({...hire,positionId:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="">Selecciona puesto</option>{businesses.flatMap(b=>b.positions.map(p=><option key={p.id} value={p.id}>{b.name} · {p.title}</option>))}</select></label>
            <label><span className="text-sm text-zinc-400">Personaje</span><select value={hire.characterId} onChange={e=>setHire({...hire,characterId:e.target.value})} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="">Selecciona personaje</option>{characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          </div>
          <button disabled={saving} onClick={async()=>{if(await post({action:"hire",positionId:Number(hire.positionId),characterId:Number(hire.characterId)},"Personaje contratado.")) setHire({positionId:"",characterId:""});}} className="mt-5 rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 disabled:opacity-40">Contratar</button>
        </section>

        <section className="mt-8 space-y-4">
          {loading ? <p className="text-zinc-500">Cargando...</p> : businesses.map(b=><article key={b.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-bold">{b.name}</h2><p className="mt-1 text-zinc-500">{b.description || "Sin descripción."}</p></div><div className="text-right text-sm text-zinc-400">Dueño: <span className="text-white">{b.ownerCharacter?.name ?? "—"}</span><br/>Ganancia: <span className="text-amber-300">◈ {Number(b.passiveIncome).toLocaleString("es-MX")}</span> {b.passiveFrequency === "WEEKLY" ? "semanal" : "diaria"}</div></div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">{b.positions.map(p=><div key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"><p className="font-semibold">{p.title}</p><p className="mt-1 text-xs text-zinc-500">{p.startTime}–{p.endTime} · ◈ {Number(p.salary).toLocaleString("es-MX")} {p.salaryFrequency === "WEEKLY" ? "semanal" : "diario"} · paga {p.payerType === "CHARACTER" ? p.payerCharacter?.name ?? "personaje" : "sistema"}</p>{p.contracts.map(c=><div key={c.id} className="mt-3 flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-2 text-sm"><span>{c.character?.name ?? "Personaje"}</span><button disabled={saving} onClick={()=>post({action:"fire",contractId:c.id},"Contrato terminado.")} className="text-red-300 hover:text-red-200">Terminar</button></div>)}{p.contracts.length===0&&<p className="mt-3 text-xs text-zinc-600">Vacante</p>}</div>)}</div>
          </article>)}
          {!loading && businesses.length===0 && <p className="text-zinc-600">No hay negocios creados.</p>}
        </section>
      </div>
    </main>
  );
}
