"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  characters: {
    id: number;
    name: string;
  }[];
};

export default function ManagementUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingRole, setSavingRole] = useState<number | null>(null);
  const [deletingUser, setDeletingUser] = useState<number | null>(null);
  const [transferCharacter, setTransferCharacter] = useState<{ id: number; name: string; ownerId: number } | null>(null);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/management/users")
      .then(async (response) => {
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.error === "Forbidden"
              ? "No tienes permisos para ver los usuarios."
              : "No se pudieron cargar los usuarios.",
          );
        }

        if (Array.isArray(data)) {
          setCurrentUserId(null);
          return data as User[];
        }

        if (!data || !Array.isArray(data.users)) {
          throw new Error("La respuesta de usuarios no es válida.");
        }

        setCurrentUserId(typeof data.currentUserId === "number" ? data.currentUserId : null);
        return data.users as User[];
      })
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar usuarios."))
      .finally(() => setLoading(false));
  }, []);

  async function changeRole(userId: number, role: "PLAYER" | "GM") {
    setSavingRole(userId);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/management/users/" + userId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "No se pudo cambiar el rol.");
      }

      setUsers((current) =>
        current.map((user) => user.id === userId ? { ...user, role: data.role } : user),
      );
      setMessage("Rol actualizado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el rol.");
    } finally {
      setSavingRole(null);
    }
  }

  function openTransfer(character: { id: number; name: string }, ownerId: number) {
    setTransferCharacter({ ...character, ownerId });
    setTransferTargetId("");
    setError("");
    setMessage("");
  }

  async function transferCharacterToUser() {
    if (!transferCharacter || !transferTargetId) return;

    setTransferring(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        "/api/management/characters/" + transferCharacter.id + "/transfer",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: Number(transferTargetId) }),
        },
      );
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "No se pudo transferir el personaje.");
      }

      const targetId = Number(transferTargetId);

      setUsers((current) =>
        current.map((user) => {
          if (user.id === transferCharacter.ownerId) {
            return {
              ...user,
              characters: user.characters.filter(
                (character) => character.id !== transferCharacter.id,
              ),
            };
          }

          if (user.id === targetId) {
            return {
              ...user,
              characters: [
                ...user.characters,
                { id: transferCharacter.id, name: transferCharacter.name },
              ],
            };
          }

          return user;
        }),
      );

      setTransferCharacter(null);
      setTransferTargetId("");
      setMessage(
        `“${transferCharacter.name}” fue transferido a ${data.userName}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo transferir el personaje.");
    } finally {
      setTransferring(false);
    }
  }

  async function deleteUser(user: User) {
    if (user.role === "SYSTEM" || user.id === currentUserId) return;

    const confirmed = window.confirm(
      `¿Eliminar a ${user.name}? Sus ${user.characters.length} personaje(s) pasarán al usuario Sistema y su cuenta de Clerk será eliminada.`,
    );

    if (!confirmed) return;

    setDeletingUser(user.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/management/users/" + user.id, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error ?? "No se pudo eliminar el usuario.");
      }

      setUsers((current) => current.filter((item) => item.id !== user.id));
      setMessage(
        data?.warning ??
          `Usuario eliminado. ${data?.transferredCharacters ?? user.characters.length} personaje(s) fueron transferidos a Sistema.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el usuario.");
    } finally {
      setDeletingUser(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 p-12 text-white">
        <p className="text-zinc-500">Cargando usuarios...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <h1 className="text-4xl font-bold">Usuarios</h1>
        <p className="mt-2 text-zinc-500">
          Usuarios registrados en Xahya y sus personajes.
        </p>

        {error && (
          <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-red-300">
            {error}
          </div>
        )}
        {message && (
          <div className="mt-6 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4 text-emerald-300">
            {message}
          </div>
        )}

        <div className="mt-8 space-y-4">
          {users.map((user) => (
            <section key={user.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{user.name}</h2>
                  <p className="mt-1 text-sm text-zinc-500">{user.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
                    {user.role}
                  </span>
                  {user.role === "SYSTEM" ? (
                    <span className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-500">
                      Usuario protegido
                    </span>
                  ) : user.role === "PLAYER" ? (
                    <button
                      type="button"
                      onClick={() => changeRole(user.id, "GM")}
                      disabled={savingRole === user.id}
                      className="rounded-lg border border-cyan-900/70 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-950/40 disabled:opacity-40"
                    >
                      Dar GM
                    </button>
                  ) : user.role === "GM" ? (
                    <button
                      type="button"
                      onClick={() => changeRole(user.id, "PLAYER")}
                      disabled={savingRole === user.id}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                    >
                      Quitar GM
                    </button>
                  ) : null}
                  {user.role !== "SYSTEM" && user.id !== currentUserId && (
                    <button
                      type="button"
                      onClick={() => deleteUser(user)}
                      disabled={deletingUser === user.id}
                      className="rounded-lg border border-red-900/70 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-950/40 disabled:opacity-40"
                    >
                      {deletingUser === user.id ? "Eliminando..." : "Eliminar"}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-5">
                <h3 className="text-sm font-medium text-zinc-400">
                  Personajes ({user.characters.length})
                </h3>

                {user.characters.length > 0 ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {user.characters.map((character) => (
                      <div
                        key={character.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3"
                      >
                        <Link
                          href={"/characters/" + character.id}
                          className="min-w-0 truncate text-zinc-200 hover:text-white"
                        >
                          {character.name}
                        </Link>
                        <div className="flex shrink-0 items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openTransfer(character, user.id)}
                            className="text-sm text-cyan-400 hover:text-cyan-300"
                          >
                            Transferir
                          </button>
                          <Link
                            href={"/management?characterId=" + character.id}
                            className="text-sm text-zinc-500 hover:text-white"
                          >
                            Gestionar →
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-zinc-600">Sin personajes.</p>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
      {transferCharacter && (
        <div className="xahya-modal-overlay flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">
              Transferir personaje
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {transferCharacter.name}
            </h2>
            <p className="mt-4 text-sm text-zinc-500">
              Selecciona el nuevo propietario. Esta acción solo cambia quién posee el personaje.
            </p>

            <label className="mt-6 block text-sm font-medium text-zinc-300">
              Nuevo propietario
              <select
                value={transferTargetId}
                onChange={(event) => setTransferTargetId(event.target.value)}
                disabled={transferring}
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-cyan-700"
              >
                <option value="">Selecciona un usuario...</option>
                {users
                  .filter(
                    (user) =>
                      user.id !== transferCharacter.ownerId,
                  )
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} — {user.role}
                    </option>
                  ))}
              </select>
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!transferring) {
                    setTransferCharacter(null);
                    setTransferTargetId("");
                  }
                }}
                disabled={transferring}
                className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={transferCharacterToUser}
                disabled={!transferTargetId || transferring}
                className="rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {transferring ? "Transfiriendo..." : "Transferir"}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
