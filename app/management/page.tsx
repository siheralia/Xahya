"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Character = {
  id: number;
  name: string;
  ownerName: string;
};

const statLabels: Record<string, string> = {
  strength: "Fuerza",
  agility: "Agilidad",
  constitution: "Constitución",
  intelligence: "Inteligencia",
  wisdom: "Sabiduría",
  charisma: "Carisma",
  spirit: "Espíritu",
  luck: "Suerte",
};

const statNames = Object.keys(statLabels);

function emptyStats() {
  return Object.fromEntries(statNames.map((stat) => [stat, 0])) as Record<string, number>;
}

export default function ManagementPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [characterId, setCharacterId] = useState("");
  const [stats, setStats] = useState<Record<string, number>>(emptyStats);
  const [karma, setKarma] = useState(0);
  const [money, setMoney] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch("/api/management/characters")
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(
            data?.error === "Forbidden"
              ? "No tienes permisos para acceder a esta pantalla."
              : "No se pudieron cargar los personajes.",
          );
        }

        return response.json();
      })
      .then((data) => setCharacters(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar personajes."))
      .finally(() => setLoading(false));
  }, []);

  function updateStat(stat: string, value: string) {
    const parsed = Number(value);
    setStats((current) => ({
      ...current,
      [stat]: Number.isFinite(parsed) ? Math.trunc(parsed) : 0,
    }));
  }

  async function applyChanges() {
    if (!characterId) {
      setError("Selecciona un personaje.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/management/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: Number(characterId),
          stats,
          karma,
          money,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "No se pudieron aplicar los cambios.");
      }

      setStats(emptyStats());
      setKarma(0);
      setMoney(0);
      setSuccess("Cambios aplicados correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron aplicar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 p-12 text-white">
        <p className="text-zinc-500">Cargando gestión...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <Link href="/" className="text-sm text-zinc-500 hover:text-white">
          ← Inicio
        </Link>

        <h1 className="mt-6 text-4xl font-bold">Gestión de personajes</h1>
        <p className="mt-2 text-zinc-500">
          Otorga cambios permanentes a las estadísticas base y recursos.
        </p>

        {error && (
          <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">
            {success}
          </div>
        )}

        <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <label className="block text-sm font-medium text-zinc-300">
            Personaje
          </label>

          <select
            value={characterId}
            onChange={(event) => setCharacterId(event.target.value)}
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-zinc-500"
          >
            <option value="">Selecciona un personaje</option>
            {characters.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name} — {character.ownerName}
              </option>
            ))}
          </select>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold">Estadísticas base</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Escribe cuánto quieres sumar o restar.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {statNames.map((stat) => (
              <label key={stat} className="block">
                <span className="text-sm text-zinc-400">{statLabels[stat]}</span>
                <input
                  type="number"
                  value={stats[stat]}
                  onChange={(event) => updateStat(stat, event.target.value)}
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-zinc-500"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold">Recursos</h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm text-zinc-400">Karma</span>
              <input
                type="number"
                value={karma}
                onChange={(event) => setKarma(Math.trunc(Number(event.target.value) || 0))}
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-zinc-500"
              />
            </label>

            <label className="block">
              <span className="text-sm text-zinc-400">Dinero</span>
              <input
                type="number"
                value={money}
                onChange={(event) => setMoney(Math.trunc(Number(event.target.value) || 0))}
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-zinc-500"
              />
            </label>
          </div>
        </section>

        <button
          type="button"
          onClick={applyChanges}
          disabled={saving || !characterId}
          className="mt-6 w-full rounded-lg bg-white px-6 py-3 font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Aplicando..." : "Aplicar cambios"}
        </button>
      </div>
    </main>
  );
}
