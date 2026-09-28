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
  canSeeCharacterId: boolean;
  canManageCharacter: boolean;
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
  const [copied, setCopied] = useState(false);

  function buildWhatsAppText(character: Character) {
    const lines = [
      "*" + character.name + "*",
      character.canSeeCharacterId ? "_Personaje #" + character.id + "_" : "",
      "",
      "*ESTADÍSTICAS BASE*",
      character.stats
        ? Object.entries(statLabels).map(([key, label]) =>
            "• " + label + ": " + character.stats?.[key as keyof typeof character.stats]
          ).join("\n")
        : "",
      "",
      "*ESTADÍSTICAS DERIVADAS*",
      character.derivedStats
        ? Object.entries(character.derivedStats).map(([key, value]) =>
            "• " + (derivedLabels[key] ?? key) + ": " + value
          ).join("\n")
        : "",
      "",
      "*RECURSOS*",
      character.resources
        ? "• Karma: " + character.resources.karma + "\n• Dinero: " + character.resources.money
        : "",
    ];
    return lines.join("\n");
  }

  async function copyToClipboard() {
    if (!character) return;
    try {
      await navigator.clipboard.writeText(buildWhatsAppText(character));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar la ficha al portapapeles.");
    }
  }

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

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <h1 className="text-4xl font-bold">{character.name}</h1>
          {character.canManageCharacter && (
            <Link
              href={"/management?characterId=" + character.id}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
            >
              Gestionar personaje
            </Link>
          )}
          <button
            type="button"
            onClick={copyToClipboard}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
          >
            {copied ? "✓ Copiado" : "Copiar para WhatsApp"}
          </button>
        </div>
        {character.canSeeCharacterId && (
          <p className="mt-2 text-zinc-500">Personaje #{character.id}</p>
        )}

        {character.stats && (
          <section className="mt-10">
            <h2 className="text-xl font-semibold">Estadísticas base</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(statLabels).map(([key, label]) => (
                <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <p className="text-sm text-zinc-500">{label}</p>
                  <p className="mt-1 text-2xl font-semibold">
                    {character.stats?.[key as keyof typeof character.stats]}
                  </p>
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
