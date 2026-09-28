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
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGM, setIsGM] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteCountdown, setDeleteCountdown] = useState(5);
  const [deleting, setDeleting] = useState(false);
  const [characterId, setCharacterId] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [stats, setStats] = useState<Record<string, number>>(emptyStats);
  const [karma, setKarma] = useState(0);
  const [money, setMoney] = useState(0);
  const [levelUpPoints, setLevelUpPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [globalOpen, setGlobalOpen] = useState(false);
  const [globalKarma, setGlobalKarma] = useState(0);
  const [globalMoney, setGlobalMoney] = useState(0);
  const [globalLevelUpPoints, setGlobalLevelUpPoints] = useState(0);
  const [globalSaving, setGlobalSaving] = useState(false);

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
      .then((data) => {
        setCharacters(data.characters ?? data);
        setIsAdmin(Boolean(data.isAdmin));
        setIsGM(Boolean(data.isGM));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar personajes."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!deleteOpen) return;
    setDeleteCountdown(5);
    const timer = window.setInterval(() => {
      setDeleteCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deleteOpen]);

  useEffect(() => {
    const requestedCharacterId = new URLSearchParams(window.location.search).get("characterId");
    if (requestedCharacterId && characters.some((character) => String(character.id) === requestedCharacterId)) {
      selectCharacter(requestedCharacterId);
    }
  }, [characters]);

  function selectCharacter(value: string) {
    setCharacterId(value);
    const selected = characters.find((character) => String(character.id) === value);
    setCharacterName(selected?.name ?? "");
  }

  async function renameCharacter() {
    if (!isAdmin || !characterId) return;

    const name = characterName.trim();

    if (!name || name.length > 80) {
      setError("El nombre debe tener entre 1 y 80 caracteres.");
      return;
    }

    setSavingName(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/management/characters/" + characterId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "No se pudo cambiar el nombre.");
      }

      setCharacters((current) =>
        current.map((character) =>
          String(character.id) === characterId
            ? { ...character, name }
            : character,
        ),
      );
      setCharacterName(name);
      setSuccess("Nombre actualizado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el nombre.");
    } finally {
      setSavingName(false);
    }
  }

  function updateStat(stat: string, value: string) {
    const parsed = Number(value);
    setStats((current) => ({
      ...current,
      [stat]: Number.isFinite(parsed) ? Math.trunc(parsed) : 0,
    }));
  }

  async function deleteCharacter() {
    if (!characterId || deleteCountdown > 0 || !isAdmin) return;

    setDeleting(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/management/characters/" + characterId, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "No se pudo borrar el personaje.");
      }

      const deletedName = characters.find((character) => String(character.id) === characterId)?.name ?? "Personaje";
      setCharacters((current) => current.filter((character) => String(character.id) !== characterId));
      setCharacterId("");
      setCharacterName("");
      setDeleteOpen(false);
      setSuccess("\"" + deletedName + "\" fue eliminado correctamente.");
      setStats(emptyStats());
      setKarma(0);
      setMoney(0);
      setLevelUpPoints(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar el personaje.");
    } finally {
      setDeleting(false);
    }
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
          levelUpPoints,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "No se pudieron aplicar los cambios.");
      }

      setStats(emptyStats());
      setKarma(0);
      setMoney(0);
      setLevelUpPoints(0);
      setSuccess("Cambios aplicados correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron aplicar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  async function applyGlobalResources() {
    if (!globalKarma && !globalMoney && !globalLevelUpPoints) {
      setError("Indica al menos un recurso para entregar.");
      return;
    }

    setGlobalSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/management/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allCharacters: true,
          karma: globalKarma,
          money: globalMoney,
          levelUpPoints: globalLevelUpPoints,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "No se pudo hacer la entrega global.");

      setGlobalKarma(0);
      setGlobalMoney(0);
      setGlobalLevelUpPoints(0);
      setGlobalOpen(false);
      setSuccess("Entrega global aplicada a " + (data.updatedCharacters ?? 0) + " personajes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo hacer la entrega global.");
    } finally {
      setGlobalSaving(false);
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
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-zinc-500">{isAdmin ? "Otorga cambios permanentes a las estadísticas base y recursos." : "Otorga recursos y puntos de Level Up a los personajes."}</p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/management/logs"
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
            >
              Ver logs
            </Link>

            {isAdmin && (
              <Link
                href="/management/users"
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
              >
                Ver usuarios
              </Link>
            )}
          </div>
        </div>

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

        {isAdmin && (
          <section className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-950/10 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Entrega global</h2>
                <p className="mt-1 text-sm text-zinc-500">Entrega Karma, Dinero o Puntos de Level Up a todos los personajes de jugadores.</p>
              </div>
              <button type="button" onClick={() => setGlobalOpen(true)} className="rounded-lg bg-amber-400 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-amber-300">
                Dar a todos
              </button>
            </div>
          </section>
        )}

        <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <label className="block text-sm font-medium text-zinc-300">
            Personaje
          </label>

          <select
            value={characterId}
            onChange={(event) => selectCharacter(event.target.value)}
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

        {isAdmin && characterId && (
          <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
            <h2 className="text-xl font-semibold">Nombre del personaje</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Solo el ADMIN puede cambiarlo.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                maxLength={80}
                value={characterName}
                onChange={(event) => setCharacterName(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-zinc-500"
              />
              <button
                type="button"
                onClick={renameCharacter}
                disabled={savingName || !characterName.trim()}
                className="rounded-lg bg-white px-5 py-2 font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {savingName ? "Guardando..." : "Cambiar nombre"}
              </button>
            </div>
          </section>
        )}

        {isAdmin && (
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
        )}

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

            <label className="block">
              <span className="text-sm text-zinc-400">Puntos de Level Up</span>
              <input
                type="number"
                value={levelUpPoints}
                onChange={(event) => setLevelUpPoints(Math.trunc(Number(event.target.value) || 0))}
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-zinc-500"
              />
            </label>
          </div>
        </section>

        <div className="mt-6">
          <button
            type="button"
            onClick={applyChanges}
            disabled={saving || !characterId}
            className="mt-6 w-full rounded-lg bg-white px-6 py-3 font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Aplicando..." : "Aplicar cambios"}
          </button>

          {isAdmin && characterId && (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={saving || deleting}
              className="rounded-lg border border-red-900/70 px-6 py-3 font-medium text-red-300 transition hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Borrar personaje
            </button>
          )}
        </div>

        {globalOpen && isAdmin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
            <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
              <h2 className="text-xl font-semibold">Dar recursos a todos</h2>
              <p className="mt-2 text-sm text-zinc-500">Los valores se sumarán al saldo actual de cada personaje. No modifica estadísticas base.</p>
              <div className="mt-5 grid gap-4">
                <label className="block"><span className="text-sm text-zinc-400">Karma</span><input type="number" value={globalKarma} onChange={(e) => setGlobalKarma(Math.trunc(Number(e.target.value) || 0))} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" /></label>
                <label className="block"><span className="text-sm text-zinc-400">Dinero</span><input type="number" value={globalMoney} onChange={(e) => setGlobalMoney(Math.trunc(Number(e.target.value) || 0))} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" /></label>
                <label className="block"><span className="text-sm text-zinc-400">Puntos de Level Up</span><input type="number" value={globalLevelUpPoints} onChange={(e) => setGlobalLevelUpPoints(Math.trunc(Number(e.target.value) || 0))} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" /></label>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setGlobalOpen(false)} disabled={globalSaving} className="rounded-lg border border-zinc-700 px-4 py-2 text-zinc-300">Cancelar</button>
                <button type="button" onClick={applyGlobalResources} disabled={globalSaving} className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-zinc-950 disabled:opacity-40">{globalSaving ? "Entregando..." : "Confirmar entrega"}</button>
              </div>
            </div>
          </div>
        )}
        {isAdmin && deleteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
            <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
              <h2 className="text-xl font-semibold">¿Borrar personaje?</h2>
              <p className="mt-3 text-zinc-400">
                Esta acción eliminará permanentemente a{" "}
                <span className="font-medium text-white">
                  {characters.find((character) => String(character.id) === characterId)?.name ?? "este personaje"}
                </span>{" "}
                y sus datos.
              </p>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleting}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={deleteCharacter}
                  disabled={deleteCountdown > 0 || deleting}
                  className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {deleting
                    ? "Borrando..."
                    : deleteCountdown > 0
                      ? "Confirmar en " + deleteCountdown + "s"
                      : "Confirmar borrado"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
