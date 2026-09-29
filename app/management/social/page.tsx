"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Character = { id: number; name: string; ownerName: string };

export default function SocialManagementPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterId, setCharacterId] = useState("");
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch("/api/management/characters")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "No se pudieron cargar los personajes.");
        setCharacters(data.characters ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar personajes."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!characterId) {
      setKnown(new Set());
      return;
    }
    setError("");
    fetch("/api/management/social?characterId=" + characterId)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "No se pudieron cargar las relaciones.");
        setKnown(new Set((data.knownCharacterIds ?? []).map(Number)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar las relaciones."));
  }, [characterId]);

  function toggle(id: number) {
    setKnown((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSuccess("");
  }

  async function save() {
    if (!characterId) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/management/social", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: Number(characterId), knownCharacterIds: [...known] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "No se pudieron guardar las relaciones.");
      setKnown(new Set((data.knownCharacterIds ?? []).map(Number)));
      setSuccess("Relaciones sociales actualizadas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron guardar las relaciones.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="min-h-screen bg-zinc-950 p-12 text-white"><p className="text-zinc-500">Cargando relaciones sociales...</p></main>;

  const selected = characters.find((character) => String(character.id) === characterId);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Relaciones sociales</h1>
            <p className="mt-2 text-zinc-500">Controla qué personajes conoce cada personaje. Solo GM y ADMIN.</p>
          </div>
          <Link href="/management" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900">← Gestión</Link>
        </div>

        {error && <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">{error}</div>}
        {success && <div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">{success}</div>}

        <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <label className="block text-sm font-medium text-zinc-300">Personaje</label>
          <select value={characterId} onChange={(event) => setCharacterId(event.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3">
            <option value="">Selecciona un personaje</option>
            {characters.map((character) => <option key={character.id} value={character.id}>{character.name} — {character.ownerName}</option>)}
          </select>
        </section>

        {selected && (
          <section className="mt-6 rounded-2xl border border-violet-500/20 bg-violet-950/10 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Personajes que conoce {selected.name}</h2>
                <p className="mt-1 text-sm text-zinc-500">La relación es independiente en cada dirección: conocer a alguien no implica que esa persona lo conozca.</p>
              </div>
              <span className="text-sm text-zinc-500">{known.size} conocidos</span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {characters.filter((character) => character.id !== selected.id).map((character) => (
                <label key={character.id} className={"flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition " + (known.has(character.id) ? "border-violet-400/40 bg-violet-950/20" : "border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900")}>
                  <input type="checkbox" checked={known.has(character.id)} onChange={() => toggle(character.id)} className="h-4 w-4" />
                  <span>
                    <span className="block font-medium">{character.name}</span>
                    <span className="block text-xs text-zinc-600">{character.ownerName}</span>
                  </span>
                </label>
              ))}
            </div>

            <button type="button" onClick={save} disabled={saving} className="mt-6 w-full rounded-lg bg-white px-5 py-3 font-medium text-black disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar relaciones"}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}
