"use client";

import { useState } from "react";
import Link from "next/link";

const eventTypes = [
  "Todos",
  "Autenticación",
  "Personaje",
  "Estadísticas",
  "Recursos",
  "Level Up",
  "Karma",
  "Sistema",
];

export default function ManagementLogsPage() {
  const [type, setType] = useState("Todos");
  const [search, setSearch] = useState("");

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/management" className="text-sm text-zinc-500 hover:text-white">
              ← Gestión
            </Link>
            <h1 className="mt-6 text-4xl font-bold">Logs del sistema</h1>
            <p className="mt-2 text-zinc-500">
              Registro de acciones realizadas dentro de Xahya.
            </p>
          </div>

          <Link
            href="/"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
          >
            ← Inicio
          </Link>
        </div>

        <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <label className="block">
              <span className="text-sm text-zinc-400">Buscar</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Usuario, personaje o acción..."
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none placeholder:text-zinc-600 focus:border-zinc-500"
              />
            </label>

            <label className="block">
              <span className="text-sm text-zinc-400">Tipo de evento</span>
              <select
                value={type}
                onChange={(event) => setType(event.target.value)}
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-zinc-500"
              >
                {eventTypes.map((eventType) => (
                  <option key={eventType}>{eventType}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {["Hoy", "Últimos 7 días", "Últimos 30 días", "Todo"].map((range) => (
              <button
                key={range}
                type="button"
                className="rounded-full border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-600 hover:text-white"
              >
                {range}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
          <div className="border-b border-zinc-800 px-6 py-4">
            <h2 className="font-semibold">Actividad</h2>
          </div>

          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-zinc-500">
              •••
            </div>
            <h3 className="mt-4 font-medium text-zinc-300">Todavía no hay logs</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
              Esta vista ya está preparada para recibir los eventos del sistema.
              Cuando conectemos el registro, aquí aparecerán las acciones con
              usuario, fecha, tipo y detalles.
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
            <p className="text-xs uppercase tracking-wider text-zinc-600">Eventos</p>
            <p className="mt-2 text-2xl font-semibold">—</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
            <p className="text-xs uppercase tracking-wider text-zinc-600">Usuarios activos</p>
            <p className="mt-2 text-2xl font-semibold">—</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
            <p className="text-xs uppercase tracking-wider text-zinc-600">Último evento</p>
            <p className="mt-2 text-2xl font-semibold">—</p>
          </div>
        </section>

        <p className="mt-6 text-xs text-zinc-600">
          Filtros preparados: búsqueda, tipo de evento y rango temporal.
          {search ? ` Búsqueda actual: “${search}”.` : ""}
          {type !== "Todos" ? ` Tipo actual: ${type}.` : ""}
        </p>
      </div>
    </main>
  );
}
