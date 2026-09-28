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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

        return data;
      })
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar usuarios."))
      .finally(() => setLoading(false));
  }, []);

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

        <div className="mt-8 space-y-4">
          {users.map((user) => (
            <section key={user.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{user.name}</h2>
                  <p className="mt-1 text-sm text-zinc-500">{user.email}</p>
                </div>
                <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
                  {user.role}
                </span>
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
