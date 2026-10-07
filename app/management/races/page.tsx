"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ManagementModal from "../_components/ManagementModal";

type Perk = { id: number; name: string; description: string | null };
type Race = { id: number; name: string; description: string | null; imagePath: string | null; imageUrl?: string | null; active: boolean; perkIds: number[] };

async function compressImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); throw new Error("No se pudo preparar la imagen."); }
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo comprimir la imagen."))), "image/webp", 0.84),
  );
}

export default function RacesManagementPage() {
  const [races, setRaces] = useState<Race[]>([]);
  const [perks, setPerks] = useState<Perk[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPerks, setSelectedPerks] = useState<number[]>([]);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const response = await fetch("/api/management/races", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error ?? "No se pudieron cargar las razas.");
    setRaces(data.races ?? []);
    setPerks(data.perks ?? []);
  }

  useEffect(() => { load().catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar.")); }, []);
  useEffect(() => () => { if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function clearForm() {
    setEditingId(null); setName(""); setDescription(""); setSelectedPerks([]);
    setSelectedImage(null); setPreviewUrl(null); setModalOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function edit(race: Race) {
    setEditingId(race.id); setName(race.name); setDescription(race.description ?? "");
    setSelectedPerks(race.perkIds ?? []); setSelectedImage(null); setPreviewUrl(race.imageUrl ?? null);
    setError(""); setSuccess(""); setModalOpen(true);
  }

  function chooseImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Selecciona una imagen válida."); return; }
    if (file.size > 20 * 1024 * 1024) { setError("La imagen original no puede superar 20 MB."); return; }
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setSelectedImage(file); setPreviewUrl(URL.createObjectURL(file)); setError("");
  }

  function togglePerk(id: number) {
    setSelectedPerks((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function uploadImage(raceId: number, file: File) {
    const form = new FormData();
    form.append("file", await compressImage(file), "race.webp");
    form.append("raceId", String(raceId));
    const response = await fetch("/api/management/races/image", { method: "POST", body: form });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? "No se pudo subir la imagen.");
  }

  async function save() {
    setError(""); setSuccess("");
    if (!name.trim()) { setError("La raza necesita un nombre."); return; }
    setBusy(true);
    try {
      const url = editingId ? "/api/management/races/" + editingId : "/api/management/races";
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description, perkIds: selectedPerks }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo guardar la raza.");
      const raceId = editingId ?? Number(data?.id);
      if (selectedImage && Number.isInteger(raceId) && raceId > 0) await uploadImage(raceId, selectedImage);
      setSuccess(editingId ? "Raza actualizada." : "Raza creada.");
      clearForm(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar la raza."); }
    finally { setBusy(false); }
  }

  async function removeImage() {
    if (!editingId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/management/races/image", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raceId: editingId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo quitar la imagen.");
      setSelectedImage(null); setPreviewUrl(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo quitar la imagen."); }
    finally { setBusy(false); }
  }

  async function toggleActive(race: Race) {
    const response = await fetch("/api/management/races/" + race.id, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !race.active }),
    });
    if (response.ok) await load(); else setError("No se pudo cambiar el estado.");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <Link href="/management" className="text-sm text-zinc-500 hover:text-cyan-300">← Gestión</Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-4xl font-bold">Gestión de Razas</h1><p className="mt-2 text-zinc-500">Imágenes, descripción y perks de cada raza.</p></div>
          <button onClick={() => { clearForm(); setModalOpen(true); }} className="rounded-lg bg-white px-5 py-3 font-semibold text-black">Nueva raza</button>
        </div>
        {error && <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
        {success && <div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {races.map((race) => (
            <article key={race.id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
              <div className="aspect-[4/3] bg-zinc-950">
                {race.imageUrl ? <img src={race.imageUrl} alt={race.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-zinc-700">Sin imagen</div>}
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{race.name}</h2><span className={race.active ? "text-emerald-400" : "text-zinc-600"}>{race.active ? "Activa" : "Inactiva"}</span></div>
                <p className="mt-2 text-sm text-zinc-500">{race.description ?? "Sin descripción."}</p>
                <p className="mt-3 text-xs text-zinc-600">{race.perkIds.length} perk{race.perkIds.length === 1 ? "" : "s"}</p>
                <div className="mt-4 flex gap-2"><button onClick={() => edit(race)} className="rounded-lg border border-cyan-400/40 px-3 py-2 text-sm text-cyan-300">Editar</button><button onClick={() => toggleActive(race)} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">{race.active ? "Desactivar" : "Activar"}</button></div>
              </div>
            </article>
          ))}
          {!races.length && <p className="text-zinc-600">Todavía no hay razas.</p>}
        </section>

        <ManagementModal open={modalOpen} title={editingId ? "Editar raza" : "Nueva raza"} onClose={() => { if (!busy) setModalOpen(false); }} maxWidth="max-w-4xl">
          <div className="grid gap-4">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la raza" className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción" rows={3} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-white" />

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h3 className="font-semibold">Imagen de la raza</h3><p className="mt-1 text-xs text-zinc-600">Se comprime automáticamente a WebP antes de subirla.</p></div>
                <div className="flex gap-2">
                  <label className="cursor-pointer rounded-lg border border-cyan-400/40 px-3 py-2 text-sm text-cyan-300 hover:bg-cyan-400/10">
                    {selectedImage || previewUrl ? "Cambiar imagen" : "Subir imagen"}
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => { chooseImage(e.target.files?.[0]); e.currentTarget.value = ""; }} />
                  </label>
                  {editingId && previewUrl && <button type="button" onClick={removeImage} disabled={busy} className="rounded-lg border border-red-400/30 px-3 py-2 text-sm text-red-300 disabled:opacity-40">Quitar</button>}
                </div>
              </div>
              {previewUrl ? <img src={previewUrl} alt="Vista previa de la raza" className="mt-4 aspect-[4/3] max-h-72 w-full rounded-xl object-cover" /> : <div className="mt-4 flex aspect-[4/3] max-h-72 items-center justify-center rounded-xl border border-dashed border-zinc-800 text-sm text-zinc-700">Sin imagen</div>}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <h3 className="font-semibold">Perks de la raza</h3>
              <p className="mt-1 text-xs text-zinc-600">Selecciona las perks existentes del catálogo.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{perks.map((perk) => <label key={perk.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-800 p-3"><input type="checkbox" checked={selectedPerks.includes(perk.id)} onChange={() => togglePerk(perk.id)} className="mt-1" /><span><span className="font-medium">{perk.name}</span>{perk.description && <span className="mt-1 block text-xs text-zinc-500">{perk.description}</span>}</span></label>)}</div>
            </div>

            <div className="flex justify-end gap-3"><button onClick={() => setModalOpen(false)} disabled={busy} className="rounded-lg border border-zinc-700 px-4 py-3 text-zinc-300 disabled:opacity-40">Cancelar</button><button onClick={save} disabled={busy} className="rounded-lg bg-white px-5 py-3 font-semibold text-black disabled:opacity-40">{busy ? "Procesando..." : editingId ? "Guardar cambios" : "Crear raza"}</button></div>
          </div>
        </ManagementModal>
      </div>
    </main>
  );
}
