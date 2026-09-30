export default function HelpPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
      <div className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300/70">Xahya</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Ayuda del jugador</h1>
        <p className="mt-3 max-w-3xl text-zinc-400">
          Aquí encontrarás los conceptos básicos de Xahya y todo lo que puedes hacer como jugador.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 md:col-span-2">
          <h2 className="text-xl font-semibold">Tu cuenta y tus personajes</h2>
          <div className="mt-4 space-y-4 text-sm leading-6 text-zinc-400">
            <p><strong className="text-zinc-200">Perfil:</strong> administra la información de tu cuenta y tus datos de jugador.</p>
            <p><strong className="text-zinc-200">Personaje:</strong> es tu ficha dentro del sistema. Puedes consultar sus estadísticas, recursos, equipo, perks, perfil y otras características.</p>
            <p><strong className="text-zinc-200">Flair:</strong> es un distintivo de hasta 2 emojis que puedes asignar a tu personaje. Se muestra junto a su nombre donde corresponda.</p>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold">Crear un personaje</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-400">
            <li>• Elige el nombre y los datos básicos del personaje.</li>
            <li>• Sus estadísticas base determinan su capacidad en las distintas áreas.</li>
            <li>• Al crearlo puedes recibir perks mediante las ruletas.</li>
            <li>• Los perks pueden otorgar recursos, mejoras o capacidades especiales.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold">Estadísticas</h2>
          <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-400">
            <p><strong className="text-zinc-200">Base:</strong> Fuerza, Agilidad, Constitución, Inteligencia, Sabiduría, Carisma, Espíritu y Suerte.</p>
            <p><strong className="text-zinc-200">Derivadas:</strong> se calculan a partir de tus estadísticas y representan valores como HP, Mana, ataque, defensa, precisión, crítico y otras capacidades.</p>
            <p><strong className="text-zinc-200">Boosts:</strong> algunos efectos pueden modificar temporalmente tus estadísticas efectivas sin cambiar su valor base.</p>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold">Perks</h2>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            Los perks son beneficios especiales obtenidos por tu personaje. Pueden proporcionar puntos adicionales, HP o Mana, dinero, karma, capacidades de equipamiento y otros efectos definidos por el sistema.
          </p>
          <p className="mt-3 text-sm leading-6 text-zinc-500">
            Algunos resultados pueden ser simplemente “Nada”.
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold">Recursos</h2>
          <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-400">
            <p><strong className="text-zinc-200">Karma:</strong> recurso que puede utilizarse para determinadas funciones, como aplicar boosts.</p>
            <p><strong className="text-zinc-200">Dinero:</strong> moneda utilizada en las funciones económicas de Xahya.</p>
            <p><strong className="text-zinc-200">Puntos de Level Up:</strong> puntos disponibles para las funciones de progresión del personaje.</p>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold">Inventario y equipo</h2>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            Puedes consultar los objetos que posee tu personaje, equipar los que sean compatibles con sus ranuras y revisar sus efectos. Algunos objetos tienen su propio flair o efectos de combate.
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold">Entregar objetos y dinero</h2>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            Puedes entregar dinero u objetos a personajes que conozcas. Selecciona el destinatario y, según corresponda, la cantidad de dinero o el objeto que quieras entregar.
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold">Laberinto</h2>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            El Laberinto es una actividad en la que tu personaje puede tener una habitación y avanzar dentro del sistema. Si tu personaje participa, podrás acceder a su laberinto desde esta sección.
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold">Casino</h2>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            El Casino contiene las funciones de azar disponibles para los jugadores. Los resultados y recompensas dependen de las reglas de cada juego.
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="text-xl font-semibold">Buzón</h2>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            El Buzón reúne tus notificaciones. El contador indica cuántas tienes pendientes de leer.
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 md:col-span-2">
          <h2 className="text-xl font-semibold">Perfil del personaje</h2>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            Puedes establecer la edad, género, altura y flair de tu personaje. Estos datos forman parte de su perfil visual y descriptivo; el género también determina la silueta utilizada cuando corresponde.
          </p>
        </section>

        <section className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-6 md:col-span-2">
          <h2 className="text-xl font-semibold">¿Qué puede hacer un jugador?</h2>
          <div className="mt-4 grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
            <p>✓ Crear y administrar sus personajes.</p>
            <p>✓ Consultar estadísticas y valores derivados.</p>
            <p>✓ Obtener y revisar perks.</p>
            <p>✓ Administrar recursos, inventario y equipo.</p>
            <p>✓ Personalizar el perfil y flair de sus personajes.</p>
            <p>✓ Entregar dinero u objetos a personajes conocidos.</p>
            <p>✓ Participar en las funciones de Casino.</p>
            <p>✓ Acceder al Laberinto cuando corresponda.</p>
            <p>✓ Consultar sus notificaciones.</p>
            <p>✓ Consultar esta guía cuando necesite recordar una función.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
