"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Character = {
  id: number;
  name: string;
  userId: number;
};

export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/characters")
      .then((response) => {
        if (!response.ok) {
          throw new Error("No se pudieron cargar los personajes");
        }

        return response.json();
      })
      .then((data) => setCharacters(data))
      .catch(() => setError("No se pudieron cargar los personajes."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">Personajes</h1>
          <Link
            href="/"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
          >
            ← Volver a Xahya
          </Link>
        </div>

        <p className="mt-2 text-zinc-400">
          Personajes registrados en Xahya.
        </p>

        {loading && (
          <p className="mt-8 text-zinc-500">Cargando personajes...</p>
        )}

        {error && <p className="mt-8 text-red-400">{error}</p>}

        {!loading && !error && characters.length === 0 && (
          <p className="mt-8 text-zinc-500">
            Todavía no hay personajes registrados.
          </p>
        )}

        {!loading && !error && characters.length > 0 && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {characters.map((character) => (
              <Link
                key={character.id}
                href={`/characters/${character.id}`}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition hover:border-zinc-600 hover:bg-zinc-900"
              >
                <h2 className="text-xl font-semibold">{character.name}</h2>
                <p className="mt-2 text-sm text-zinc-500">
                  Personaje #{character.id}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
