"use client";

import { useEffect, useState } from "react";
import ManagementModal from "../management/_components/ManagementModal";

type Character = { id: number; name: string; flair: string | null };
type Contract = { id: number; character: Character | null };
type Position = { id: number; title: string; description: string | null; startTime: string; endTime: string; salary: number; salaryFrequency: string; contracts: Contract[] };
type Business = { id: number; name: string; ownerCharacter: Character | null; passiveIncome: number; passiveFrequency: string; balance: number; positions: Position[] };

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [candidates, setCandidates] = useState<Character[]>([]);
  const [hire, setHire] = useState({ businessId: "", positionId: "", characterId: "" });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/businesses", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudieron cargar tus negocios.");
      setBusinesses(data.businesses ?? []);
      setCandidates(data.candidates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar tus negocios.");
    }
  }
  useEffect(() => { load(); }, []);

  async function submit(action: "hire" | "fire", extra: Record<string, unknown>) {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/businesses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo completar la operación.");
      setOpen(false); setHire({ businessId: "", positionId: "", characterId: "" }); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo completar la operación."); }
    finally { setSaving(false); }
  }

  const selected = businesses.find((business) => String(business.id) === hire.businessId);
  const vacancies = selected?.positions.filter((position) => position.contracts.length === 0) ?? [];

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-4xl font-bold">Mis negocios</h1>
        <p className="mt-2 text-zinc-500">Contrata y administra empleados de los negocios de tus personajes.</p>
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
                  <button onClick={() => { setHire({ businessId: String(business.id), positionId: "", characterId: "" }); setOpen(true); }} className="rounded-lg bg-white px-4 py-2 font-medium text-black">Contratar</button>
                </div>
                <div className="mt-5 grid gap-3">
                  {business.positions.map((position) => {
                    const contract = position.contracts[0];
                    return <div key={position.id} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div><p className="font-semibold">{position.title}</p><p className="text-sm text-zinc-500">{position.startTime}–{position.endTime} · {position.salary.toLocaleString("en-US")} · {position.salaryFrequency === "WEEKLY" ? "semanal" : "diario"}</p></div>
                        {contract ? <span className="text-sm text-emerald-300">{contract.character?.name ?? "Empleado"}</span> : <span className="text-sm text-zinc-600">Vacante</span>}
                      </div>
                      {contract && <button onClick={() => submit("fire", { businessId: business.id, contractId: contract.id })} disabled={saving} className="mt-3 text-sm text-red-300">Terminar contrato</button>}
                    </div>;
                  })}
                </div>
              </section>
            ))
          }
        </div>
        <ManagementModal open={open} title="Contratar empleado" onClose={() => setOpen(false)} maxWidth="max-w-xl">
          <div className="grid gap-4">
            <label className="text-sm text-zinc-300">Negocio<select value={hire.businessId} onChange={(e) => setHire({ ...hire, businessId: e.target.value, positionId: "", characterId: "" })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3"><option value="">Selecciona negocio</option>{businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}</select></label>
            <label className="text-sm text-zinc-300">Plaza / turno<select value={hire.positionId} onChange={(e) => setHire({ ...hire, positionId: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3"><option value="">Selecciona plaza</option>{vacancies.map((position) => <option key={position.id} value={position.id}>{position.title} · {position.startTime}–{position.endTime}</option>)}</select></label>
            <label className="text-sm text-zinc-300">Personaje que conoces<select value={hire.characterId} onChange={(e) => setHire({ ...hire, characterId: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3"><option value="">Selecciona personaje</option>{candidates.map((character) => <option key={character.id} value={character.id}>{character.name} {character.flair ? `⟨${character.flair}⟩` : ""}</option>)}</select></label>
            <p className="text-xs text-zinc-500">Solo aparecen personajes que el dueño conoce y que no tienen otro empleo activo.</p>
            <div className="flex justify-end gap-3"><button onClick={() => setOpen(false)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Cancelar</button><button onClick={() => submit("hire", { businessId: Number(hire.businessId), positionId: Number(hire.positionId), characterId: Number(hire.characterId) })} disabled={saving || !hire.businessId || !hire.positionId || !hire.characterId} className="rounded-lg bg-emerald-400 px-5 py-2 font-semibold text-zinc-950 disabled:opacity-40">{saving ? "Contratando..." : "Contratar"}</button></div>
          </div>
        </ManagementModal>
      </div>
    </main>
  );
}
