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

        setCurrentUserId(data.currentUserId);
        return data.users;
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
      <div className="mx-auto max-w-5xl px-6 py-12">
        <Link href="/management" className="text-sm text-zinc-500 hover:text-white">
          ← Gestión
        </Link>

        <h1 className="mt-6 text-4xl font-bold">Usuarios</h1>
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
                        <Link
                          href={"/management?characterId=" + character.id}
                          className="shrink-0 text-sm text-zinc-500 hover:text-white"
                        >
                          Gestionar →
                        </Link>
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
    </main>
  );
}
