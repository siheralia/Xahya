"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ManagementModal from "../_components/ManagementModal";

type Item = {
  id: number;
  name: string;
  itemType: string;
  itemSubtype: string | null;
  allowedSlots: string[];
  effects: { stat?: string; type?: string }[];
  price: number;
};

type Condition = {
  itemId: string;
  itemType: string;
  itemSubtype: string;
  slot: string;
  stat: string;
  daysOfWeek: number[];
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
};

type Promotion = {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  adjustmentType: "PERCENT" | "FIXED";
  adjustmentValue: number;
  priority: number;
  condition: Omit<Condition, "itemId"> & { itemId: number | null };
  createdAt?: string;
  updatedAt?: string;
};

const itemTypes = [
  ["WEAPON", "Arma"], ["ARMOR", "Armadura"], ["ACCESSORY", "Accesorio"],
  ["CONSUMABLE", "Consumible"], ["MATERIAL", "Material"], ["OTHER", "Otro"],
];

const slots = [
  ["MAIN_HAND", "Mano principal"], ["OFF_HAND", "Mano secundaria"], ["HEAD", "Cabeza"],
  ["BODY", "Cuerpo"], ["ARMS", "Brazos"], ["FEET", "Pies"], ["BACK", "Espalda"],
  ["ACCESSORY_1", "Accesorio 1"], ["ACCESSORY_2", "Accesorio 2"],
];

const stats = [
  ["STR", "Fuerza"], ["AGI", "Agilidad"], ["CON", "Constitución"], ["INT", "Inteligencia"],
  ["WIS", "Sabiduría"], ["CHA", "Carisma"], ["SPI", "Espíritu"], ["LCK", "Suerte"],
  ["PHYS_ATK", "Ataque físico"], ["MAGIC_ATK", "Ataque mágico"], ["DEF", "Defensa física"],
  ["MAG_DEF", "Defensa mágica"], ["ATTACK_TOTAL", "Ataque total"], ["DAMAGE_REDUCTION_ALL", "Reducción de daño"],
];

const weekdays = [
  [0, "Dom"], [1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"],
];

const emptyCondition = (): Condition => ({
  itemId: "", itemType: "", itemSubtype: "", slot: "", stat: "",
  daysOfWeek: [], startDate: "", endDate: "", startTime: "", endTime: "",
});

const emptyForm = () => ({
  name: "",
  description: "",
  active: true,
  adjustmentType: "PERCENT" as "PERCENT" | "FIXED",
  adjustmentValue: -10,
  priority: 0,
  condition: emptyCondition(),
});

function conditionIsEmpty(condition: Condition) {
  return !condition.itemId && !condition.itemType && !condition.itemSubtype && !condition.slot && !condition.stat
    && condition.daysOfWeek.length === 0 && !condition.startDate && !condition.endDate && !condition.startTime && !condition.endTime;
}

function adjustmentLabel(promotion: Promotion | ReturnType<typeof emptyForm>) {
  const value = Number(promotion.adjustmentValue);
  const sign = value > 0 ? "+" : "";
  return promotion.adjustmentType === "PERCENT" ? sign + value + "%" : sign + value.toLocaleString("es-MX") + " ◈";
}

function conditionSummary(promotion: Promotion, items: Item[]) {
  const c = promotion.condition;
  const parts: string[] = [];
  if (c.itemId) parts.push("Objeto: " + (items.find((item) => item.id === Number(c.itemId))?.name ?? "#" + c.itemId));
  if (c.itemType) parts.push("Categoría: " + (itemTypes.find(([value]) => value === c.itemType)?.[1] ?? c.itemType));
  if (c.itemSubtype) parts.push("Tipo: " + c.itemSubtype);
  if (c.slot) parts.push("Slot: " + (slots.find(([value]) => value === c.slot)?.[1] ?? c.slot));
  if (c.stat) parts.push("Atributo: " + (stats.find(([value]) => value === c.stat)?.[1] ?? c.stat));
  if (c.daysOfWeek?.length) parts.push("Días: " + c.daysOfWeek.map((day) => weekdays.find(([value]) => value === day)?.[1]).filter(Boolean).join(", "));
  if (c.startDate || c.endDate) parts.push("Fechas: " + (c.startDate || "inicio") + " → " + (c.endDate || "sin límite"));
  if (c.startTime || c.endTime) parts.push("Hora: " + (c.startTime || "00:00") + "–" + (c.endTime || "23:59"));
  return parts.length ? parts.join(" · ") : "Global · todos los objetos";
}

export default function StoreManagementPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const subtypeOptions = useMemo(
    () => Array.from(new Set(items.map((item) => String(item.itemSubtype ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")),
    [items],
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/management/store", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo cargar la gestión de tienda.");
      setPromotions(Array.isArray(data?.promotions) ? data.promotions : []);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la gestión de tienda.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
    setSuccess("");
    setModalOpen(true);
  }

  function openEdit(promotion: Promotion) {
    setEditingId(promotion.id);
    setForm({
      name: promotion.name,
      description: promotion.description ?? "",
      active: promotion.active,
      adjustmentType: promotion.adjustmentType,
      adjustmentValue: Number(promotion.adjustmentValue),
      priority: Number(promotion.priority ?? 0),
      condition: {
        itemId: promotion.condition.itemId ? String(promotion.condition.itemId) : "",
        itemType: promotion.condition.itemType ?? "",
        itemSubtype: promotion.condition.itemSubtype ?? "",
        slot: promotion.condition.slot ?? "",
        stat: promotion.condition.stat ?? "",
        daysOfWeek: Array.isArray(promotion.condition.daysOfWeek) ? promotion.condition.daysOfWeek.map(Number) : [],
        startDate: promotion.condition.startDate ?? "",
        endDate: promotion.condition.endDate ?? "",
        startTime: promotion.condition.startTime ?? "",
        endTime: promotion.condition.endTime ?? "",
      },
    });
    setError("");
    setSuccess("");
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    setSuccess("");

    const payload = {
      name: form.name,
      description: form.description,
      active: form.active,
      adjustmentType: form.adjustmentType,
      adjustmentValue: Number(form.adjustmentValue),
      priority: Math.trunc(Number(form.priority) || 0),
      condition: {
        ...form.condition,
        itemId: form.condition.itemId ? Number(form.condition.itemId) : null,
      },
    };

    try {
      const response = await fetch(editingId ? "/api/management/store/" + editingId : "/api/management/store", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar la regla.");
      setSuccess(editingId ? "Regla actualizada." : "Regla creada.");
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la regla.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(promotion: Promotion) {
    if (!confirm("¿Eliminar la regla \"" + promotion.name + "\"?")) return;
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/management/store/" + promotion.id, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo eliminar la regla.");
      setSuccess("Regla eliminada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la regla.");
    }
  }

  function toggleDay(day: number) {
    setForm((current) => ({
      ...current,
      condition: {
        ...current.condition,
        daysOfWeek: current.condition.daysOfWeek.includes(day)
          ? current.condition.daysOfWeek.filter((value) => value !== day)
          : [...current.condition.daysOfWeek, day].sort((a, b) => a - b),
      },
    }));
  }

  if (loading) return <main className="min-h-screen bg-zinc-950 p-12 text-white"><p className="text-zinc-500">Cargando gestión de tienda...</p></main>;

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/management" className="text-sm text-zinc-500 hover:text-white">← Gestión</Link>
            <h1 className="mt-3 text-4xl font-bold">Gestión de tienda</h1>
            <p className="mt-2 max-w-3xl text-zinc-500">Crea promociones, descuentos o aumentos que cambian el precio de compra en la tienda según el objeto, sus atributos y el momento.</p>
          </div>
          <button type="button" onClick={openNew} className="rounded-lg bg-white px-5 py-3 font-medium text-black">Nueva regla</button>
        </div>

        <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-5 text-sm text-zinc-300">
          <p className="font-semibold text-emerald-300">Cómo funcionan las reglas</p>
          <ul className="mt-2 space-y-1 text-zinc-400">
            <li>• Sin filtros de objeto, la regla es global.</li>
            <li>• Los filtros de una misma regla se combinan con <strong className="text-zinc-200">Y</strong>: deben cumplirse todos.</li>
            <li>• Si varias reglas coinciden, se aplican todas en orden de prioridad, de menor a mayor.</li>
            <li>• Un porcentaje negativo es descuento; uno positivo es aumento. Un ajuste fijo negativo resta ◈ y uno positivo suma ◈.</li>
            <li>• Las reglas de compra no cambian el precio base del objeto ni su valor de reventa.</li>
          </ul>
        </div>

        {error && <div className="mt-5 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
        {success && <div className="mt-5 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}

        <section className="mt-8 space-y-3">
          {promotions.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-500">No hay reglas de precios todavía.</div>
          ) : promotions.map((promotion) => (
            <article key={promotion.id} className={"rounded-2xl border p-5 " + (promotion.active ? "border-zinc-800 bg-zinc-900/40" : "border-zinc-800/60 bg-zinc-950/40 opacity-60")}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{promotion.name}</h2>
                    <span className={"rounded-full border px-2 py-0.5 text-xs " + (promotion.active ? "border-emerald-500/30 text-emerald-300" : "border-zinc-700 text-zinc-500")}>{promotion.active ? "Activa" : "Inactiva"}</span>
                    <span className={"rounded-full border px-2 py-0.5 text-xs " + (promotion.adjustmentValue < 0 ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-300")}>{adjustmentLabel(promotion)}</span>
                  </div>
                  {promotion.description && <p className="mt-2 text-sm text-zinc-400">{promotion.description}</p>}
                  <p className="mt-3 text-sm text-zinc-300">{conditionSummary(promotion, items)}</p>
                  <p className="mt-2 text-xs text-zinc-600">Prioridad {promotion.priority}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => openEdit(promotion)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">Editar</button>
                  <button type="button" onClick={() => remove(promotion)} className="rounded-lg border border-red-900/70 px-3 py-2 text-sm text-red-300 hover:bg-red-950/40">Eliminar</button>
                </div>
              </div>
            </article>
          ))}
        </section>

        <ManagementModal open={modalOpen} title={editingId ? "Editar regla de tienda" : "Nueva regla de tienda"} onClose={() => setModalOpen(false)} maxWidth="max-w-4xl">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="grid gap-4">
              <label>Nombre<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ej. Happy hour de espadas" className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" /></label>
              <label>Descripción<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={2} placeholder="Qué aplica esta regla..." className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" /></label>

              <div className="grid gap-4 sm:grid-cols-3">
                <label>Tipo de ajuste<select value={form.adjustmentType} onChange={(event) => setForm({ ...form, adjustmentType: event.target.value as "PERCENT" | "FIXED" })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="PERCENT">Porcentaje</option><option value="FIXED">Cantidad fija</option></select></label>
                <label>{form.adjustmentType === "PERCENT" ? "Porcentaje" : "Cantidad en ◈"}<input type="number" value={form.adjustmentValue} onChange={(event) => setForm({ ...form, adjustmentValue: Number(event.target.value) || 0 })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" /></label>
                <label>Prioridad<input type="number" value={form.priority} onChange={(event) => setForm({ ...form, priority: Math.trunc(Number(event.target.value) || 0) })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" /></label>
              </div>

              <label className="flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-3 text-sm text-zinc-300"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-4 w-4" /> Regla activa</label>

              <div className="rounded-2xl border border-zinc-800 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><h3 className="font-semibold">Qué objetos afecta</h3><p className="mt-1 text-xs text-zinc-500">{conditionIsEmpty(form.condition) ? "Sin filtros: esta regla será global." : "Los filtros seleccionados se tienen que cumplir todos."}</p></div>
                  {!conditionIsEmpty(form.condition) && <button type="button" onClick={() => setForm({ ...form, condition: emptyCondition() })} className="text-xs text-zinc-400 hover:text-white">Quitar todos los filtros</button>}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label>Objeto específico<select value={form.condition.itemId} onChange={(event) => setForm({ ...form, condition: { ...form.condition, itemId: event.target.value } })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="">Cualquier objeto</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · ◈ {item.price.toLocaleString("es-MX")}</option>)}</select></label>
                  <label>Categoría<select value={form.condition.itemType} onChange={(event) => setForm({ ...form, condition: { ...form.condition, itemType: event.target.value } })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="">Cualquier categoría</option>{itemTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label>Tipo específico<select value={form.condition.itemSubtype} onChange={(event) => setForm({ ...form, condition: { ...form.condition, itemSubtype: event.target.value } })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="">Cualquier tipo</option>{subtypeOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                  <label>Slot<select value={form.condition.slot} onChange={(event) => setForm({ ...form, condition: { ...form.condition, slot: event.target.value } })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="">Cualquier slot</option>{slots.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label>Atributo / efecto<select value={form.condition.stat} onChange={(event) => setForm({ ...form, condition: { ...form.condition, stat: event.target.value } })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"><option value="">Cualquier atributo</option>{stats.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 p-4">
                <h3 className="font-semibold">Cuándo aplica</h3>
                <p className="mt-1 text-xs text-zinc-500">La hora usa la zona horaria de Xahya: America/Chihuahua.</p>
                <div className="mt-4">
                  <p className="text-sm text-zinc-400">Días de la semana <span className="text-xs text-zinc-600">(sin selección = cualquier día)</span></p>
                  <div className="mt-2 flex flex-wrap gap-2">{weekdays.map(([day, label]) => <button type="button" key={day} onClick={() => toggleDay(Number(day))} className={"rounded-lg border px-3 py-2 text-sm " + (form.condition.daysOfWeek.includes(Number(day)) ? "border-violet-400 bg-violet-400/15 text-violet-200" : "border-zinc-700 text-zinc-400")}>{label}</button>)}</div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label>Fecha inicial<input type="date" value={form.condition.startDate} onChange={(event) => setForm({ ...form, condition: { ...form.condition, startDate: event.target.value } })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" /></label>
                  <label>Fecha final<input type="date" value={form.condition.endDate} onChange={(event) => setForm({ ...form, condition: { ...form.condition, endDate: event.target.value } })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" /></label>
                  <label>Hora inicial<input type="time" value={form.condition.startTime} onChange={(event) => setForm({ ...form, condition: { ...form.condition, startTime: event.target.value } })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" /></label>
                  <label>Hora final<input type="time" value={form.condition.endTime} onChange={(event) => setForm({ ...form, condition: { ...form.condition, endTime: event.target.value } })} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2" /></label>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm">
                <span className="text-zinc-500">Vista previa:</span>{" "}
                <span className={form.adjustmentValue < 0 ? "text-emerald-300" : "text-amber-300"}>{adjustmentLabel(form)}</span>
                {" · "}
                <span className="text-zinc-300">{conditionIsEmpty(form.condition) ? "todos los objetos" : "solo objetos que cumplan los filtros"}</span>
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="rounded-lg border border-zinc-700 px-5 py-3 text-zinc-300">Cancelar</button>
                <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-white px-5 py-3 font-medium text-black">{saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear regla"}</button>
              </div>
            </div>
          </section>
        </ManagementModal>
      </div>
    </main>
  );
}
