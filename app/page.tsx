import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { db } from "@/lib/db";

export default async function Home() {
  const { userId: clerkId } = await auth();
  let isManagementUser = false;

  if (clerkId) {
    const users = await db.orm.public.User.all();
    const user = users.find((candidate) => candidate.clerkId === clerkId);
    isManagementUser = user ? ["GM", "ADMIN"].includes(String(user.role)) : false;
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-12">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Xahya</h1>

          <div className="flex items-center gap-3">
            <Link
              href="/profile"
              className="rounded-full border border-zinc-800 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-white"
            >
              Mi perfil
            </Link>

            <span className="rounded-full border border-zinc-800 px-3 py-1 text-sm text-zinc-400">
              RPG System
            </span>
          </div>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.3em] text-zinc-500">
            Character Management
          </p>

          <h2 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">
            Tu personaje.
            <br />
            Tus estadísticas.
            <br />
            Un solo sistema.
          </h2>

          <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-400">
            Xahya será la central de fichas, estadísticas y sistemas de
            personajes para tus RPG.
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              href="/characters/create"
              className="rounded-lg bg-white px-6 py-3 font-medium text-black transition hover:bg-zinc-200"
            >
              Crear personaje
            </Link>

            <Link
              href="/characters"
              className="rounded-lg border border-zinc-700 px-6 py-3 font-medium text-white transition hover:bg-zinc-900"
            >
              Ver personajes
            </Link>

            {isManagementUser && (
              <Link
                href="/management"
                className="rounded-lg border border-zinc-700 px-6 py-3 font-medium text-white transition hover:bg-zinc-900"
              >
                Gestión GM / Admin
              </Link>
            )}
          </div>
        </section>

        <footer className="border-t border-zinc-900 pt-6 text-sm text-zinc-600">
          Xahya — RPG Character Management System
        </footer>
      </div>
    </main>
  );
}
