export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-12">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Xahya</h1>

          <span className="rounded-full border border-zinc-800 px-3 py-1 text-sm text-zinc-400">
            RPG System
          </span>
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

          <div className="mt-10 flex gap-4">
            <button className="rounded-lg bg-white px-6 py-3 font-medium text-black transition hover:bg-zinc-200">
              Crear personaje
            </button>

            <button className="rounded-lg border border-zinc-700 px-6 py-3 font-medium text-white transition hover:bg-zinc-900">
              Ver personajes
            </button>
          </div>
        </section>

        <footer className="border-t border-zinc-900 pt-6 text-sm text-zinc-600">
          Xahya — RPG Character Management System
        </footer>
      </div>
    </main>
  );
}