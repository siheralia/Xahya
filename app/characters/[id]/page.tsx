"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Character = {
  id: number;
  name: string;
  stats: {
    strength: number;
    agility: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
    spirit: number;
    luck: number;
  } | null;
  resources: {
    karma: number;
    money: number;
  } | null;
  derivedStats: Record<string, number> | null;
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

const derivedLabels: Record<string, string> = {
  maxHp: "HP Máx.",
  maxMana: "Mana Máx.",
  physicalAttack: "Ataque físico",
  magicAttack: "Ataque mágico",
  physicalDefense: "Defensa física",
  magicDefense: "Defensa mágica",
  precision: "Precisión",
  critical: "Crítico",
  discovery: "Hallazgo",
  miracle: "Suceso milagroso",
  intimidation: "Intimidación",
  conquest: "Conquista",
  race: "Carrera",
  dodge: "Esquive",
  stealth: "Sigilo",
  detection: "Detección",
};

export default function CharacterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    params
      .then(({ id }) => fetch(`/api/characters/${id}`))
      .then((response) => {
        if (!response.ok) {
          throw new Error();
        }

        return response.json();
      })
      .then(setCharacter)
      .catch(() => setError("No se pudo cargar el personaje."))
      .finally(() => setLoading(false));
  }, [params]);

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 p-12 text-white">
        <p className="text-zinc-500">Cargando personaje...</p>
      </main>
    );
  }

  if (error || !character) {
    return (
      <main className="min-h-screen bg-zinc-950 p-12 text-white">
        <p className="text-red-400">{error || "Personaje no encontrado."}</p>
        <Link href="/characters" className="mt-4 inline-block text-zinc-300 hover:text-white">
          ← Volver a personajes
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <Link href="/characters" className="text-sm text-zinc-500 hover:text-white">
          ← Personajes
        </Link>

        <h1 className="mt-6 text-4xl font-bold">{character.name}</h1>
        <p className="mt-2 text-zinc-500">Personaje #{character.id}</p>

        {character.stats && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">Estadísticas base</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(character.stats).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <p className="text-sm text-zinc-500">{statLabels[key]}</p>
                  <p className="mt-1 text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {character.derivedStats && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">Estadísticas derivadas</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(character.derivedStats).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <p className="text-sm text-zinc-500">{derivedLabels[key] ?? key}</p>
                  <p className="mt-1 text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {character.resources && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">Recursos</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-sm text-zinc-500">Karma</p>
                <p className="mt-1 text-2xl font-semibold">{character.resources.karma}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <p className="text-sm text-zinc-500">Dinero</p>
                <p className="mt-1 text-2xl font-semibold">{character.resources.money}</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
