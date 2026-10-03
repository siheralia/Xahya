"use client";

import { useEffect, useState } from "react";
import ManagementModal from "../management/_components/ManagementModal";

type Character = { id: number; name: string; flair: string | null };
type PropertyItem = { id:number; name:string; description:string|null; imageUrl:string|null };
type Product = { id:number; itemId:number; purchasePrice:number; salePrice:number; stock:number; item:{id:number;name:string;imagePath:string|null}|null };
type SubscriptionPlan = { id:number; name:string; price:number; intervalValue:number; intervalUnit:string };
type Contract = { id: number; character: Character | null };
type Product = { id:number; itemId:number; purchasePrice:number; salePrice:number; stock:number; item:{id:number;name:string;description:string|null;itemType:string;imagePath:string|null}|null };
type SubscriptionPlan = { id:number; name:string; description:string|null; price:number; intervalValue:number; intervalUnit:string };
type Position = { id: number; title: string; description: string | null; startTime: string; endTime: string; salary: number; salaryFrequency: string; salaryDayOfWeek: number; payerType: string; payerCharacterId: number | null; contracts: Contract[] };
type Business = { id: number; name: string; ownerCharacter: Character | null; passiveIncome: number; passiveFrequency: string; balance: number; securityInvestment: number; growthInvestment: number; products: Product[]; subscriptionPlans: SubscriptionPlan[]; positions: Position[] };

const emptyPosition = { businessId: "", title: "Encargado de tienda", description: "", startTime: "14:00", endTime: "15:00", salary: 500, salaryFrequency: "DAILY", salaryDayOfWeek: 0, payerType: "SYSTEM", payerCharacterId: "" };

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [propertyItems, setPropertyItems] = useState<PropertyItem[]>([]);
  const [candidates, setCandidates] = useState<Character[]>([]);
  const [hire, setHire] = useState({ businessId: "", positionId: "", characterId: "" });
  const [open, setOpen] = useState(false);
  const [positionOpen, setPositionOpen] = useState(false);
  const [positionId, setPositionId] = useState<number | null>(null);
  const [position, setPosition] = useState({ ...emptyPosition });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [investmentForms, setInvestmentForms] = useState<Record<number,{type:string;sourceType:string;amount:number}>>({});
  const [propertyForms, setPropertyForms] = useState<Record<number,{itemId:string;quantity:number;purchasePrice:number;salePrice:number}>>({});
  const [planForms, setPlanForms] = useState<Record<number,{name:string;price:number;intervalValue:number;intervalUnit:string}>>({});

  async function load() {
    try {
      const response = await fetch("/api/businesses", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudieron cargar tus negocios.");
      setBusinesses(data.businesses ?? []);
      setPropertyItems(data.propertyItems ?? []);
      setCandidates(data.candidates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar tus negocios.");
    }
  }
  useEffect(() => { load(); }, []);

  async function submit(action: string, extra: Record<string, unknown>) {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/businesses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo completar la operación.");
      setOpen(false); setPositionOpen(false); setHire({ businessId: "", positionId: "", characterId: "" }); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo completar la operación."); }
    finally { setSaving(false); }
  }

  function newPosition(businessId: number) {
    setPositionId(null);
    setPosition({ ...emptyPosition, businessId: String(businessId) });
    setError("");
    setPositionOpen(true);
  }

  function editPosition(businessId: number, item: Position) {
    setPositionId(item.id);
    setPosition({
      businessId: String(businessId),
      title: item.title,
      description: item.description ?? "",
      startTime: item.startTime,
      endTime: item.endTime,
      salary: Number(item.salary),
      salaryFrequency: item.salaryFrequency,
      salaryDayOfWeek: Number(item.salaryDayOfWeek),
      payerType: item.payerType,
      payerCharacterId: item.payerCharacterId == null ? "" : String(item.payerCharacterId),
    });
    setError("");
    setPositionOpen(true);
  }

  const selected = businesses.find((business) => String(business.id) === hire.businessId);
  function invForm(id:number){return investmentForms[id]??{type:"SECURITY",sourceType:"BUSINESS",amount:0};}
  function propForm(id:number){return propertyForms[id]??{itemId:"",quantity:1,purchasePrice:0,salePrice:0};}
  function planForm(id:number){return planForms[id]??{name:"",price:0,intervalValue:1,intervalUnit:"MONTH"};}
  async function invest(businessId:number){const f=invForm(businessId);await submit("invest",{businessId,...f,amount:Number(f.amount)});}
  async function stockProperty(businessId:number){const f=propForm(businessId);await submit("stockProperty",{businessId,itemId:Number(f.itemId),quantity:Number(f.quantity),purchasePrice:Number(f.purchasePrice),salePrice:Number(f.salePrice)});}
  async function createPlan(businessId:number){const f=planForm(businessId);await submit("createPlan",{businessId,...f,price:Number(f.price),intervalValue:Number(f.intervalValue)});}

  const vacancies = selected?.positions.filter((p) => p.contracts.length === 0) ?? [];

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-4xl font-bold">Mis negocios</h1>
        <p className="mt-2 text-zinc-500">Administra los puestos, turnos y empleados de los negocios de tus personajes.</p>
        {error && <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}

        <div className="mt-8 space-y-5">
          {businesses.length === 0 ? <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-zinc-500">Ninguno de tus personajes es dueño de un negocio.</div> :
            businesses.map((business) => (
              <section key={business.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold">{business.name}</h2>
                    <p className="mt-1 text-sm text-zinc-500">Dueño: {business.ownerCharacter?.name ?? "Personaje"} · {business.passiveIncome > 0 ? `Ingreso pasivo: ${business.passiveIncome} · ${business.passiveFrequency === "WEEKLY" ? "semanal" : "diario"}` : "Sin ingreso pasivo"}</p>
                    <p className="mt-1 text-xs text-zinc-600">Saldo del negocio: {business.balance.toLocaleString("en-US")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => newPosition(business.id)} className="rounded-lg border border-zinc-700 px-4 py-2 font-medium text-zinc-200 hover:bg-zinc-800">＋ Crear puesto</button>
                    <button onClick={() => { setHire({ businessId: String(business.id), positionId: "", characterId: "" }); setOpen(true); }} className="rounded-lg bg-white px-4 py-2 font-medium text-black">Contratar</button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><p className="text-xs text-zinc-500">Seguridad</p><p className="mt-1 text-xl font-bold text-blue-300">◈ {Number(business.securityInvestment??0).toLocaleString("es-MX")}</p><p className="mt-1 text-xs text-zinc-600">Inversión acumulada</p></div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><p className="text-xs text-zinc-500">Crecimiento</p><p className="mt-1 text-xl font-bold text-emerald-300">◈ {Number(business.growthInvestment??0).toLocaleString("es-MX")}</p><p className="mt-1 text-xs text-zinc-600">+◈ {Math.floor(Number(business.growthInvestment??0)*0.1).toLocaleString("es-MX")} por semana</p></div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><p className="text-xs text-zinc-500">Propiedades</p><p className="mt-1 text-xl font-bold">× {business.products?.reduce((n,p)=>n+Number(p.stock),0)??0}</p><p className="mt-1 text-xs text-zinc-600">En inventario para reventa</p></div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-zinc-800 p-4"><h3 className="font-semibold">Invertir</h3><div className="mt-3 grid gap-2"><select value={invForm(business.id).type} onChange={e=>setInvestmentForms(v=>({...v,[business.id]:{...invForm(business.id),type:e.target.value}}))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"><option value="SECURITY">Seguridad</option><option value="GROWTH">Crecimiento</option></select><select value={invForm(business.id).sourceType} onChange={e=>setInvestmentForms(v=>({...v,[business.id]:{...invForm(business.id),sourceType:e.target.value}}))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"><option value="BUSINESS">Caja del negocio</option><option value="OWNER">Dinero del dueño</option></select><input type="number" min={1} placeholder="Cantidad" value={invForm(business.id).amount||""} onChange={e=>setInvestmentForms(v=>({...v,[business.id]:{...invForm(business.id),amount:Number(e.target.value)||0}}))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"/><button onClick={()=>invest(business.id)} disabled={saving||invForm(business.id).amount<=0} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black disabled:opacity-40">Invertir</button></div></div>
                  <div className="rounded-xl border border-zinc-800 p-4"><h3 className="font-semibold">Comprar propiedades</h3><div className="mt-3 grid gap-2"><select value={propForm(business.id).itemId} onChange={e=>setPropertyForms(v=>({...v,[business.id]:{...propForm(business.id),itemId:e.target.value}}))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"><option value="">Propiedad</option>{propertyItems.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="grid grid-cols-3 gap-2"><input type="number" min={1} value={propForm(business.id).quantity} onChange={e=>setPropertyForms(v=>({...v,[business.id]:{...propForm(business.id),quantity:Number(e.target.value)||1}}))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm" placeholder="Cantidad"/><input type="number" min={0} value={propForm(business.id).purchasePrice} onChange={e=>setPropertyForms(v=>({...v,[business.id]:{...propForm(business.id),purchasePrice:Number(e.target.value)||0}}))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm" placeholder="Compra"/><input type="number" min={0} value={propForm(business.id).salePrice} onChange={e=>setPropertyForms(v=>({...v,[business.id]:{...propForm(business.id),salePrice:Number(e.target.value)||0}}))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm" placeholder="Venta"/></div><button onClick={()=>stockProperty(business.id)} disabled={saving||!propForm(business.id).itemId} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black disabled:opacity-40">Comprar inventario</button></div></div>
                  <div className="rounded-xl border border-zinc-800 p-4"><h3 className="font-semibold">Nueva suscripción</h3><div className="mt-3 grid gap-2"><input value={planForm(business.id).name} onChange={e=>setPlanForms(v=>({...v,[business.id]:{...planForm(business.id),name:e.target.value}}))} placeholder="Nombre del plan" className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"/><div className="grid grid-cols-3 gap-2"><input type="number" min={0} value={planForm(business.id).price} onChange={e=>setPlanForms(v=>({...v,[business.id]:{...planForm(business.id),price:Number(e.target.value)||0}}))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm" placeholder="Precio"/><input type="number" min={1} value={planForm(business.id).intervalValue} onChange={e=>setPlanForms(v=>({...v,[business.id]:{...planForm(business.id),intervalValue:Number(e.target.value)||1}}))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm" placeholder="Cada"/><select value={planForm(business.id).intervalUnit} onChange={e=>setPlanForms(v=>({...v,[business.id]:{...planForm(business.id),intervalUnit:e.target.value}}))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm"><option value="DAY">día</option><option value="WEEK">semana</option><option value="MONTH">mes</option></select></div><button onClick={()=>createPlan(business.id)} disabled={saving||!planForm(business.id).name.trim()} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black disabled:opacity-40">Crear plan</button></div></div>
                </div>
                <div className="mt-5 grid gap-3">
                  {business.positions.map((item) => {
                    const contract = item.contracts[0];
                    return <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div><p className="font-semibold">{item.title}</p><p className="text-sm text-zinc-500">{item.startTime}–{item.endTime} · {item.salary.toLocaleString("en-US")} · {item.salaryFrequency === "WEEKLY" ? "semanal" : "diario"} · paga {item.payerType === "CHARACTER" ? "personaje" : "sistema"}</p></div>
                        <div className="flex items-center gap-3">
                          {contract ? <span className="text-sm text-emerald-300">{contract.character?.name ?? "Empleado"}</span> : <span className="text-sm text-zinc-600">Vacante</span>}
                          <button onClick={() => editPosition(business.id, item)} className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">Editar</button>
                        </div>
                      </div>
                      {item.description && <p className="mt-2 text-xs text-zinc-500">{item.description}</p>}
                      {contract && <button onClick={() => submit("fire", { businessId: business.id, contractId: contract.id })} disabled={saving} className="mt-3 text-sm text-red-300">Terminar contrato</button>}
                    </div>;
                  })}
                  {business.positions.length === 0 && <p className="text-sm text-zinc-600">Este negocio todavía no tiene puestos.</p>}
                </div>
              </section>
            ))
          }
        </div>

        <ManagementModal open={positionOpen} title={positionId ? "Editar puesto / turno" : "Crear puesto / turno"} onClose={() => setPositionOpen(false)} maxWidth="max-w-2xl">
          <div className="grid gap-4">
            <p className="text-sm text-zinc-500">Cada puesto es una plaza independiente. Puedes crear el mismo puesto varias veces con horarios diferentes.</p>
            <label className="text-sm text-zinc-300">Negocio<select value={position.businessId} onChange={(e) => setPosition({ ...position, businessId: e.target.value })} disabled={!!positionId} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3"><option value="">Selecciona negocio</option>{businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <label className="text-sm text-zinc-300">Nombre del puesto<input value={position.title} onChange={(e) => setPosition({ ...position, title: e.target.value })} maxLength={100} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3" /></label>
            <label className="text-sm text-zinc-300">Descripción<textarea value={position.description} onChange={(e) => setPosition({ ...position, description: e.target.value })} rows={3} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3" /></label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-zinc-300">Inicio<input type="time" value={position.startTime} onChange={(e) => setPosition({ ...position, startTime: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3" /></label>
              <label className="text-sm text-zinc-300">Fin<input type="time" value={position.endTime} onChange={(e) => setPosition({ ...position, endTime: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3" /></label>
              <label className="text-sm text-zinc-300">Salario<input type="number" min={0} value={position.salary} onChange={(e) => setPosition({ ...position, salary: Number(e.target.value) || 0 })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3" /></label>
              <label className="text-sm text-zinc-300">Frecuencia<select value={position.salaryFrequency} onChange={(e) => setPosition({ ...position, salaryFrequency: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3"><option value="DAILY">Diario</option><option value="WEEKLY">Semanal</option></select></label>
              {position.salaryFrequency === "WEEKLY" && <label className="text-sm text-zinc-300">Día de pago<select value={position.salaryDayOfWeek} onChange={(e) => setPosition({ ...position, salaryDayOfWeek: Number(e.target.value) })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">{["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"].map((d, i) => <option key={i} value={i}>{d}</option>)}</select></label>}
              <label className="text-sm text-zinc-300">Quién paga<select value={position.payerType} onChange={(e) => setPosition({ ...position, payerType: e.target.value, payerCharacterId: "" })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3"><option value="SYSTEM">Sistema</option><option value="CHARACTER">Personaje</option></select></label>
              {position.payerType === "CHARACTER" && <label className="text-sm text-zinc-300">Personaje pagador<select value={position.payerCharacterId} onChange={(e) => setPosition({ ...position, payerCharacterId: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3"><option value="">Selecciona personaje</option>{[...candidates, ...businesses.map(b => b.ownerCharacter).filter((c): c is Character => !!c)].filter((c, i, arr) => arr.findIndex(x => x.id === c.id) === i).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
            </div>
            <div className="flex justify-end gap-3"><button onClick={() => setPositionOpen(false)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Cancelar</button><button onClick={() => submit(positionId ? "updatePosition" : "createPosition", { ...(positionId ? { positionId } : {}), ...position, businessId: Number(position.businessId), salary: Number(position.salary), salaryDayOfWeek: Number(position.salaryDayOfWeek), payerCharacterId: position.payerCharacterId ? Number(position.payerCharacterId) : null })} disabled={saving || !position.businessId || !position.title.trim()} className="rounded-lg bg-white px-5 py-2 font-semibold text-black disabled:opacity-40">{saving ? "Guardando..." : positionId ? "Guardar cambios" : "Crear puesto"}</button></div>
          </div>
        </ManagementModal>

        <ManagementModal open={open} title="Contratar empleado" onClose={() => setOpen(false)} maxWidth="max-w-xl">
          <div className="grid gap-4">
            <label className="text-sm text-zinc-300">Negocio<select value={hire.businessId} onChange={(e) => setHire({ ...hire, businessId: e.target.value, positionId: "", characterId: "" })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3"><option value="">Selecciona negocio</option>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select></label>
            <label className="text-sm text-zinc-300">Plaza / turno<select value={hire.positionId} onChange={(e) => setHire({ ...hire, positionId: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3"><option value="">Selecciona plaza</option>{vacancies.map((p) => <option key={p.id} value={p.id}>{p.title} · {p.startTime}–{p.endTime}</option>)}</select></label>
            <label className="text-sm text-zinc-300">Personaje que conoces<select value={hire.characterId} onChange={(e) => setHire({ ...hire, characterId: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3"><option value="">Selecciona personaje</option>{candidates.map((c) => <option key={c.id} value={c.id}>{c.name} {c.flair ? `⟨${c.flair}⟩` : ""}</option>)}</select></label>
            <p className="text-xs text-zinc-500">Solo aparecen personajes que el dueño conoce y que no tienen otro empleo activo.</p>
            <div className="flex justify-end gap-3"><button onClick={() => setOpen(false)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Cancelar</button><button onClick={() => submit("hire", { businessId: Number(hire.businessId), positionId: Number(hire.positionId), characterId: Number(hire.characterId) })} disabled={saving || !hire.businessId || !hire.positionId || !hire.characterId} className="rounded-lg bg-emerald-400 px-5 py-2 font-semibold text-zinc-950 disabled:opacity-40">{saving ? "Contratando..." : "Contratar"}</button></div>
          </div>
        </ManagementModal>
      </div>
    </main>
  );
}
