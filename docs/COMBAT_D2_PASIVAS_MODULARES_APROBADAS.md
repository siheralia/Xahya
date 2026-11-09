# Xahya — D2.1: primera instalación real de micromódulos aprobados

## Qué cambia

El editor y la aprobación de habilidades ya admiten efectos `COMPOSED` con
`reviewedPch` asignado por administración, un mínimo por paso y reconciliación
transaccional del PCH total. Esta fase **reutiliza esas garantías**: no introduce
un segundo precio, no crea una habilidad nueva y no permite que el cliente envíe
el contenido de un grafo al endpoint de combate.

En `POST /api/combat/duels`, al construir el encuentro se consultan en el
servidor las habilidades del **personaje propietario**, aprobadas, la
activación explícita opcional, el robo de habilidades vigente, sus requisitos y
la habilidad padre (si existe). Se seleccionan solo las composiciones totalmente
validadas y se convierten en la instantánea autoritativa de
`CombatState.microEffects` antes de la primera acción del NPC.

**Ninguna habilidad PENDING, REJECTED, robada, con padre no autorizado,
sin PCH revisado o con precio pendiente se ejecuta.** Un estado
`CharacterSkillState.active === false` explícito desactiva la instalación;
una pasiva aprobada sin fila de activación se considera pasiva por defecto.

Los encuentros anteriores mantienen sus reglas. El código de la creación es
el único que llama al instalador; `POST /actions` no recibe definiciones,
fórmulas ni acumuladores suministrados por el usuario. La definición completa,
los valores de cargas y el registro de idempotencia siguen fuera de
`combatClientView`.

## Primera familia admitida (restricción deliberada)

Por ahora una habilidad **PASSIVE, sin costes de maná de activación,
mantenimiento o acumulación**, con entre 2 y 3 efectos `COMPOSED`, permite:

1. **DAMAGE_RESOLVED → STORE**: guardar el `MITIGATED_DAMAGE` calculado
   por el motor oficial, con capacidad entre 1 y 5 cargas. No genera cargas
   por una esquiva ni inventa daño mitigado.
2. **PASSIVE → MODIFIER** de `RESISTANCE`: factor entre ×1 y ×1,30,
   condicionado a `CHARGES == 0` en **esa misma habilidad**.
3. **TURN_START → HEAL**: entre 1 % y 10 % del `MAX_HP`, únicamente
   cuando `CHARGES >= 1` de la misma habilidad.

STORE es obligatorio; se admite STORE + defensa, STORE + curación o los
tres módulos. No se permite un segundo `STORE`, condiciones genéricas,
efectos sin precio, mezclas de COMPOSED con efectos antiguos,
`DAMAGE`, `REPAIR_DURABILITY`, `ACTIVATE`, control del terreno,
objetivos arbitrarios ni ejecución de métodos del cliente.

Las cargas se renombran internamente según `skillId` para evitar
transferencias entre habilidades; los contenedores se identifican de manera
estable. Como primera política, se admite **máximo una pasiva defensiva y una
regenerativa por combatiente** para evitar el apilamiento gratuito de
multiplicadores. Las habilidades adicionales que excedan estos límites
permanecen inactivas en este primer conector; los siguientes hitos
permitirán reglas explícitas de acumulación, precio e interacción.

## Ejemplo de juego: «Piel resonante»

La habilidad aprobada y liquidada mediante PCH contiene tres módulos que
comparten una carga del propio personaje:

- Al comenzar sin cargas, la resistencia a un golpe se multiplica por 1,30.
- Si el golpe hace contacto, el motor calcula el daño realmente mitigado:
  por ejemplo, **19 puntos**. Esa cantidad queda almacenada en una carga.
- Al existir una carga, el bono defensivo deja de aplicarse a los golpes
  posteriores.
- Al empezar la siguiente ronda, la habilidad recupera un 10 % del HP máximo,
  con tope de HP; nunca sana una segunda vez por recargar la página.

En un duelo sintético con 100 HP, defensa 20 y ataque 50, el primer golpe
pasa de dejar al defensor con 55 HP a dejarlo con 59 gracias a la pasiva. Se
almacenan 19 puntos mitigados y la regeneración posterior devuelve 10 HP.
El estado sobrevive a la serialización JSON completa del encuentro.

Esto es **una habilidad ficticia de pruebas**. No se han dado poderes ni
monedas a personajes de producción; un jugador solo recibe un módulo si
administración aprobó y cobró su configuración `COMPOSED`.

## Pruebas y límites

`tests/combat-approved-passive-micro-snapshot.test.mjs` ejecuta compilación,
rechazos, permisos, robo, activación, padre, condiciones, distintos
propietarios y combates reales con reacciones, cargas y rondas.

D2.1 **no habilita cualquier habilidad modular**: queda pendiente
conectar a `CAST_SKILL` las activaciones pagadas con coste de maná, daños
compuestos y blancos específicos; resolver sus tipos por vías oficiales,
incluyendo áreas/reflexión, y mostrar las pasivas instaladas sin filtrar
habilidades privadas de otro usuario. Se mantendrá la compatibilidad con el
interruptor `MODULAR_FIRST / LEGACY_ONLY` durante las etapas siguientes.
