"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ManagementModal from "../_components/ManagementModal";

type Character = { id: number; name: string; flair: string | null };
type Contract = { id: number; character: Character | null };
type Position = {
  id: number;
  businessId: number | null;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  salary: number;
  salaryFrequency: string;
  salaryDayOfWeek: number;
  payerType: string;
  payerCharacterId: number | null;
  payerCharacter: Character | null;
  contracts: Contract[];
};
type Business = {
  id: number;
  name: string;
  description: string | null;
  ownerCharacterId: number;
  ownerCharacter: Character | null;
  passiveIncome: number;
  passiveFrequency: string;
  passiveDayOfWeek: number;
  passiveTime: string;
  active: boolean;
  positions: Position[];
};

const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const emptyBusiness = {
  name: "",
  description: "",
  ownerCharacterId: "",
  passiveIncome: 0,
  passiveFrequency: "WEEKLY",
  passiveDayOfWeek: 0,
  passiveTime: "18:00",
};

const emptyPosition = {
  businessId: "",
  title: "Encargado de tienda",
  description: "",
  startTime: "14:00",
  endTime: "15:00",
  salary: 500,
  salaryFrequency: "DAILY",
  salaryDayOfWeek: 0,
  payerType: "SYSTEM",
  payerCharacterId: "",
};

export default function BusinessesManagementPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [systemPositions, setSystemPositions] = useState<Position[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [businessModal, setBusinessModal] = useState(false);
  const [businessId, setBusinessId] = useState<number | null>(null);
  const [business, setBusiness] = useState(emptyBusiness);

  const [positionModal, setPositionModal] = useState(false);
  const [positionId, setPositionId] = useState<number | null>(null);
  const [position, setPosition] = useState(emptyPosition);

  const [hireModal, setHireModal] = useState(false);
  const [hire, setHire] = useState({ positionId: "", characterId: "" });

  const allPositions = useMemo(
    () => [
      ...systemPositions.map((p) => ({ ...p, businessName: "Sistema" })),
      ...businesses.flatMap((b) => b.positions.map((p) => ({ ...p, businessName: b.name }))),
    ],
    [businesses, systemPositions],
  );

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/management/businesses", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudieron cargar los negocios.");
      setBusinesses(data.businesses ?? []);
      setSystemPositions(data.systemPositions ?? []);
      setCharacters(data.characters ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los negocios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function post(body: Record<string, unknown>, message: string) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/management/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo completar la operación.");
      setSuccess(message);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la operación.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function openNewBusiness() {
    setBusinessId(null);
    setBusiness({ ...emptyBusiness });
    setError("");
    setBusinessModal(true);
  }

  function editBusiness(item: Business) {
    setBusinessId(item.id);
    setBusiness({
      name: item.name,
      description: item.description ?? "",
      ownerCharacterId: String(item.ownerCharacterId),
      passiveIncome: Number(item.passiveIncome),
      passiveFrequency: item.passiveFrequency,
      passiveDayOfWeek: Number(item.passiveDayOfWeek),
      passiveTime: item.passiveTime,
    });
    setError("");
    setBusinessModal(true);
  }

  async function saveBusiness() {
    const ok = await post(
      {
        action: businessId ? "updateBusiness" : "createBusiness",
        ...(businessId ? { id: businessId } : {}),
        ...business,
        ownerCharacterId: Number(business.ownerCharacterId),
        passiveIncome: Number(business.passiveIncome),
        passiveDayOfWeek: Number(business.passiveDayOfWeek),
      },
      businessId ? "Negocio actualizado." : "Negocio creado.",
    );
    if (ok) {
      setBusinessModal(false);
      setBusinessId(null);
      setBusiness({ ...emptyBusiness });
    }
  }

  function openNewPosition() {
    setPositionId(null);
    setPosition({ ...emptyPosition });
    setError("");
    setPositionModal(true);
  }

  function editPosition(item: Position) {
    setPositionId(item.id);
    setPosition({
      businessId: item.businessId == null ? "" : String(item.businessId),
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
    setPositionModal(true);
  }

  async function savePosition() {
    const ok = await post(
      {
        action: positionId ? "updatePosition" : "createPosition",
        ...(positionId ? { id: positionId } : {}),
        ...position,
        businessId: position.businessId ? Number(position.businessId) : null,
        salary: Number(position.salary),
        salaryDayOfWeek: Number(position.salaryDayOfWeek),
        payerCharacterId: position.payerCharacterId ? Number(position.payerCharacterId) : null,
      },
      positionId ? "Puesto actualizado." : "Puesto creado.",
    );
    if (ok) {
      setPositionModal(false);
      setPositionId(null);
      setPosition({ ...emptyPosition });
    }
  }

  async function hireCharacter() {
    const ok = await post(
      { action: "hire", positionId: Number(hire.positionId), characterId: Number(hire.characterId) },
      "Personaje contratado.",
    );
    if (ok) {
      setHireModal(false);
      setHire({ positionId: "", characterId: "" });
    }
  }

  async function fire(contractId: number) {
    await post({ action: "fire", contractId }, "Contrato terminado.");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Negocios y empleos</h1>
            <p className="mt-2 text-zinc-500">
              Crea negocios, puestos, turnos, salarios y contratos. Los pagos se procesan automáticamente.
            </p>
          </div>
          <Link href="/management" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900">
            ← Gestión
          </Link>
        </div>

        {error && <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
        {success && <div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}

        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <button onClick={() => setHireModal(true)} className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 px-4 py-3 font-medium text-emerald-300 hover:bg-emerald-950/40">
            Contratar personaje
          </button>
          <button onClick={openNewPosition} className="rounded-lg border border-zinc-700 px-4 py-3 font-medium text-zinc-200 hover:bg-zinc-900">
            Nuevo puesto / turno
          </button>
          <button onClick={openNewBusiness} className="rounded-lg bg-white px-5 py-3 font-semibold text-black">
            Nuevo negocio
          </button>
        </div>

        <ManagementModal
          open={businessModal}
          title={businessId ? "Editar negocio" : "Nuevo negocio"}
          onClose={() => setBusinessModal(false)}
          maxWidth="max-w-2xl"
        >
          <div className="grid gap-4">
            <label className="text-sm text-zinc-300">
              Nombre
              <input value={business.name} onChange={(e) => setBusiness({ ...business, name: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3" />
            </label>
            <label className="text-sm text-zinc-300">
              Dueño
              <select value={business.ownerCharacterId} onChange={(e) => setBusiness({ ...business, ownerCharacterId: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
                <option value="">Selecciona personaje</option>
                {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-300">
              Descripción
              <textarea value={business.description} onChange={(e) => setBusiness({ ...business, description: e.target.value })} rows={4} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-zinc-300">
                Ganancia pasiva
                <input type="number" min={0} value={business.passiveIncome} onChange={(e) => setBusiness({ ...business, passiveIncome: Number(e.target.value) || 0 })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3" />
              </label>
              <label className="text-sm text-zinc-300">
                Frecuencia
                <select value={business.passiveFrequency} onChange={(e) => setBusiness({ ...business, passiveFrequency: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
                  <option value="WEEKLY">Semanal</option>
                  <option value="DAILY">Diaria</option>
                </select>
              </label>
              {business.passiveFrequency === "WEEKLY" && (
                <label className="text-sm text-zinc-300">
                  Día de pago
                  <select value={business.passiveDayOfWeek} onChange={(e) => setBusiness({ ...business, passiveDayOfWeek: Number(e.target.value) })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
                    {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </label>
              )}
              <label className="text-sm text-zinc-300">
                Hora de pago
                <input type="time" value={business.passiveTime} onChange={(e) => setBusiness({ ...business, passiveTime: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3" />
              </label>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setBusinessModal(false)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Cancelar</button>
              <button onClick={saveBusiness} disabled={saving || !business.name.trim() || !business.ownerCharacterId} className="rounded-lg bg-white px-5 py-2 font-medium text-black disabled:opacity-40">
                {saving ? "Guardando..." : businessId ? "Guardar cambios" : "Crear negocio"}
              </button>
            </div>
          </div>
        </ManagementModal>

        <ManagementModal
          open={positionModal}
          title={positionId ? "Editar puesto / turno" : "Nuevo puesto / turno"}
          onClose={() => setPositionModal(false)}
          maxWidth="max-w-2xl"
        >
          <div className="grid gap-4">
            <p className="text-sm text-zinc-500">
              Cada puesto es una plaza/turno independiente. Puedes crear dos puestos con el mismo nombre, por ejemplo Encargado de tienda 14:00–22:00 y Encargado de tienda 22:00–06:00.
            </p>
            <label className="text-sm text-zinc-300">
              Negocio
              <select value={position.businessId} onChange={(e) => setPosition({ ...position, businessId: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
                <option value="">Trabajo del sistema</option>
                {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-300">
              Puesto
              <input value={position.title} onChange={(e) => setPosition({ ...position, title: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3" />
            </label>
            <label className="text-sm text-zinc-300">
              Descripción del turno
              <textarea value={position.description} onChange={(e) => setPosition({ ...position, description: e.target.value })} rows={3} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-zinc-300">Inicio<input type="time" value={position.startTime} onChange={(e) => setPosition({ ...position, startTime: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3" /></label>
              <label className="text-sm text-zinc-300">Fin<input type="time" value={position.endTime} onChange={(e) => setPosition({ ...position, endTime: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3" /></label>
              <label className="text-sm text-zinc-300">Salario<input type="number" min={0} value={position.salary} onChange={(e) => setPosition({ ...position, salary: Number(e.target.value) || 0 })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3" /></label>
              <label className="text-sm text-zinc-300">Frecuencia<select value={position.salaryFrequency} onChange={(e) => setPosition({ ...position, salaryFrequency: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3"><option value="DAILY">Diario</option><option value="WEEKLY">Semanal</option></select></label>
              {position.salaryFrequency === "WEEKLY" && <label className="text-sm text-zinc-300">Día de pago<select value={position.salaryDayOfWeek} onChange={(e) => setPosition({ ...position, salaryDayOfWeek: Number(e.target.value) })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">{days.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></label>}
              <label className="text-sm text-zinc-300">Pagador<select value={position.payerType} onChange={(e) => setPosition({ ...position, payerType: e.target.value, payerCharacterId: "" })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3"><option value="SYSTEM">Sistema</option><option value="CHARACTER">Personaje</option></select></label>
              {position.payerType === "CHARACTER" && <label className="text-sm text-zinc-300">Personaje pagador<select value={position.payerCharacterId} onChange={(e) => setPosition({ ...position, payerCharacterId: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3"><option value="">Selecciona personaje</option>{characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setPositionModal(false)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Cancelar</button>
              <button onClick={savePosition} disabled={saving || !position.title.trim()} className="rounded-lg bg-white px-5 py-2 font-medium text-black disabled:opacity-40">{saving ? "Guardando..." : positionId ? "Guardar cambios" : "Crear puesto"}</button>
            </div>
          </div>
        </ManagementModal>

        <ManagementModal open={hireModal} title="Contratar personaje" onClose={() => setHireModal(false)} maxWidth="max-w-xl">
          <div className="grid gap-4">
            <p className="text-sm text-zinc-500">Elige una plaza concreta. Los turnos con el mismo puesto se distinguen por su horario.</p>
            <label className="text-sm text-zinc-300">
              Puesto / turno
              <select value={hire.positionId} onChange={(e) => setHire({ ...hire, positionId: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
                <option value="">Selecciona puesto</option>
                {allPositions.map((p) => <option key={p.id} value={p.id}>{p.businessName} · {p.title} · {p.startTime}–{p.endTime}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-300">
              Personaje
              <select value={hire.characterId} onChange={(e) => setHire({ ...hire, characterId: e.target.value })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3">
                <option value="">Selecciona personaje</option>
                {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-3">
              <button onClick={() => setHireModal(false)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">Cancelar</button>
              <button onClick={hireCharacter} disabled={saving || !hire.positionId || !hire.characterId} className="rounded-lg bg-emerald-400 px-5 py-2 font-semibold text-zinc-950 disabled:opacity-40">{saving ? "Contratando..." : "Contratar"}</button>
            </div>
          </div>
        </ManagementModal>

        {loading ? (
          <p className="mt-8 text-zinc-500">Cargando...</p>
        ) : (
          <section className="mt-8 space-y-4">
            {systemPositions.length > 0 && (
              <article className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-6">
                <h2 className="text-2xl font-bold">Trabajos del sistema</h2>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {systemPositions.map((p) => (
                    <PositionCard key={p.id} position={p} saving={saving} onEdit={() => editPosition(p)} onFire={fire} />
                  ))}
                </div>
              </article>
            )}

            {businesses.map((b) => (
              <article key={b.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold">{b.name}</h2>
                    <p className="mt-1 text-zinc-500">{b.description || "Sin descripción."}</p>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="text-right text-sm text-zinc-400">
                      Dueño: <span className="text-white">{b.ownerCharacter?.name ?? "—"}</span><br />
                      Ganancia: <span className="text-amber-300">◈ {Number(b.passiveIncome).toLocaleString("es-MX")}</span> {b.passiveFrequency === "WEEKLY" ? "semanal" : "diaria"}
                    </div>
                    <button onClick={() => editBusiness(b)} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">Editar</button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {b.positions.map((p) => (
                    <PositionCard key={p.id} position={p} saving={saving} onEdit={() => editPosition(p)} onFire={fire} />
                  ))}
                </div>
                {b.positions.length === 0 && <p className="mt-4 text-sm text-zinc-600">Este negocio todavía no tiene puestos.</p>}
              </article>
            ))}

            {!businesses.length && <p className="text-zinc-600">No hay negocios creados.</p>}
          </section>
        )}
      </div>
    </main>
  );
}

function PositionCard({
  position,
  saving,
  onEdit,
  onFire,
}: {
  position: Position;
  saving: boolean;
  onEdit: () => void;
  onFire: (contractId: number) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{position.title}</p>
          {position.description && <p className="mt-1 text-xs text-zinc-500">{position.description}</p>}
        </div>
        <button disabled={saving} onClick={onEdit} className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900">Editar</button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {position.startTime}–{position.endTime} · ◈ {Number(position.salary).toLocaleString("es-MX")} {position.salaryFrequency === "WEEKLY" ? "semanal" : "diario"} · paga {position.payerType === "CHARACTER" ? position.payerCharacter?.name ?? "personaje" : "sistema"}
      </p>
      {position.contracts.map((contract) => (
        <div key={contract.id} className="mt-3 flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-2 text-sm">
          <span>{contract.character?.name ?? "Personaje"}</span>
          <button disabled={saving} onClick={() => onFire(contract.id)} className="text-red-300 hover:text-red-200">Terminar</button>
        </div>
      ))}
      {position.contracts.length === 0 && <p className="mt-3 text-xs text-zinc-600">Vacante</p>}
    </div>
  );
}
