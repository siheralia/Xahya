# Combate de Xahya — fase 2: habilidades y recursos

## Estado de la fase 2 — 3 noviembre 2026 (PR #125, sin fusionar)
- La PR #124 (flair del HUD) está desplegada en producción, commit `55fd635fdd7e374247d56587f9b59c95c05109d8`.
- Primer incremento de NPC configurables en `feature/combat-training-npc-difficulty`: perfiles Básico, Intermedio, Avanzado, Resistencia y Agresivo; selector en `DuelLauncher`.
- Agresivo aumenta presión ofensiva y frecuencia de habilidades, pero **no altera el daño del jugador**. Resistencia multiplica la reserva de HP del NPC sin reducir el daño recibido.
- Cada nuevo NPC recibe una raza activa con **todos sus perks raciales activos**, más **tres perks adicionales del catálogo** distintos de los innatos. Todos los raciales se registran; aquellos con efectos aún no resueltos se muestran como narrativos. Los tres extras se sortean sin repetición y ponderados por el campo probability (>0%), exclusivamente entre perks generales activos NO vinculados a ninguna raza; «Nada» no cuenta. Los efectos de estadísticas y recursos HP/maná que sean compatibles afectan exclusivamente al encuentro, nunca a la ficha persistente. Los extras cuyo efecto no se aplica al motor de combate se identifican expresamente en la interfaz.
- La carga de habilidades del NPC incluye hasta tres plantillas públicas habilitadas, elegidas al inicio y compiladas con `compileCombatSkill`. La IA usa `applyResolvedCombatSkill`, pagando maná, PA, ticks y cooldown. No se interpretan efectos sin resolutor ni se conceden habilidades personales a jugadores.
- La selección y los planes se guardan en el `combatV1` del encuentro para que sobrevivan a reconexiones sin repetir el sorteo. El PvP conserva sus reglas.
- Validar pruebas, build y vista previa de Vercel antes de solicitar fusión. No confundir esta PR con producción.
- Próximas prioridades: ataques de área configurables, luego inventario persistente y resolutor avanzado; no avanzar a fases posteriores hasta estabilizar estos sistemas.

> **Nota histórica:** las subsecciones antiguas de esta página, incluidas las referencias a PR #112 como trabajo pendiente y a liquidación de HP/maná, describen decisiones anteriores. La regla actual es mantener HP/maná como recursos exclusivos del encuentro.


## Línea base confirmada (batallas 1–3 y nueva fase 1 básica)
- El combate usa 100 ticks por turno y 9 + CON PA por personaje. Las reacciones cobran ticks y PA; a velocidades iguales se alternan las iniciativas.
- Un NPC puede actuar, defenderse y contraatacar. Un duelo suspendido conserva estado en `combatSession.lastAction.combatV1` y se reanuda al iniciar sesión.
- En el encuentro #3 ambos realizaron ataques: 9 cada uno, 5 turnos, desenlace en tick 454. El defensor pudo escoger Desviar. La precisión visual del ángulo requería una estimación cualitativa, y el tipo de ataque tenía que mostrarse en la reacción.
- La fase 1 también dispone de una **explosión mágica básica** con coste temporal normal, alcance 10 m, daño modesto y coste de maná 0 de forma provisional. El defensor predice el centro de un área circular a partir de una pista regional; el centro exacto se oculta hasta resolver el impacto. No sustituye habilidades configurables.\n- La ficha, las habilidades, el inventario y los recursos todavía NO reciben daño/coste persistente desde este motor de prueba.

## Objetivo de la fase 2
Vincular **habilidades existentes y estadísticas efectivas** al motor de ticks sin introducir reglas paralelas: ataque, defensa, barrera y daño comparten un solo resolutor. El coste de maná, la duración y el cooldown deben aplicarse de forma transaccional y reconstruible después de desconectar.

## Secuencia de implementación

### Hito 2.1 — Contrato de habilidad utilizable (iniciado)

**Ya implementado:** lectura de habilidades APPROVED dentro del encuentro, visibilidad restringida a cada propietario y GM, filtrado de robo y requisitos, metadatos de costes, duración, distancia, cooldown y efectos. Todavía no ejecuta habilidades; los PCH de construcción no son maná. En la próxima fase se implementa un subconjunto seguro de efectos con validación del lado servidor.

1. Consultar las habilidades aprobadas y los estados activos de cada personaje desde las tablas y catálogos existentes, sin asumir códigos antiguos de efecto.
2. Compilar el grafo de condiciones → acciones de cada habilidad a órdenes de combate tipadas. Solo permitir efectos que el resolutor soporte; rechazar el resto explícitamente (no simularlos como daño físico).
3. Indicar en la UI coste, objetivos, rango, duración, cooldown y velocidad configurada antes de ejecutarla.
4. Validar en servidor propiedad de la habilidad, aprobación, alcance y condiciones. Las elecciones de la UI no son autoritativas.

### Hito 2.2 — Maná y efectos temporales (primer grupo implementado)

**Disponible en PR 112:** ejecución autorizada y transaccional de habilidades aprobadas cuyo conjunto completo de efectos sea interpretable por el motor: `DAMAGE_MULTIPLIER`, `FINAL_DAMAGE_MULTIPLIER`, `IGNORE_PHYS_DEF_MULTIPLIER`, `IGNORE_MAGIC_DEF_MULTIPLIER`, curación instantánea `RESOURCE_BONUS(HP)` y `STAT_BONUS` temporal aplicado a ATQ/DEF físico/mágico, precisión o esquive. Las habilidades ofensivas requieren un tipo de ataque y alcance configurados, usan los mismos trazos físicos o puntos mágicos y el mismo resolutor de daño/defensa que los ataques básicos.

**Maná:** cada encuentro nuevo toma una fotografía del maná actual y máximo de sus combatientes. El coste se descuenta y guarda **solo en el encuentro**, en la misma transacción de `combatSession` que AP/ticks e impactos; por ahora **no se debita ni liquida al recurso global del personaje**, pendiente de definir reglas de persistencia fuera del combate. Los encuentros antiguos sin fotografía de maná conservan su combate básico y no permiten habilidades ejecutables.

**Cooldown:** utiliza el catálogo ya existente, incluido `Igual a duración` y `Una vez por combate`; el descuento PCH de construir la habilidad no modifica sus PA o ticks. Los comandos llevan un ID de solicitud para evitar doble consumo al repetir la misma petición después de una desconexión.

**Restricción deliberada:** se rechazan habilidades con efectos no soportados, condiciones narrativas, reglas mecánicas especiales, pasivas o combinaciones ambiguas; nunca se ejecuta solo una parte del grafo. El motor seguirá ampliándose para barreras duraderas, elementos, copia, robo y demás familias de efectos.


1. Reservar y cobrar maná al ejecutar; rechazar recursos insuficientes.
2. Registrar efectos activos, barreras, buffs y debuffs en un estado de combate versionado. Reusar el motor de efectos centralizado y estadísticas dinámicas.
3. Aplicar cooldown al reloj de ticks/turnos sin descuentos extra de PA: el descuento PCH de construcción no equivale al coste de ejecución.
4. Mantener las reacciones defensivas y las prioridades de iniciativa. Desviar utiliza trayectoria/ángulo; una barrera utiliza la defensa mágica efectiva dinámica.

### Hito 2.3 — Resolver resultados y persistencia
1. Calcular daño, resistencias y desplazamiento con el mismo motor para ataques físicos y habilidades.
2. Persistir el estado de recursos del combate durante cada transición transaccional; al finalizar, liquidar HP/maná/integridad al personaje o inventario **solo tras definir las reglas de daño persistente**.
3. Asegurar que actualizaciones repetidas, refrescar la página y volver a iniciar sesión no aplican dos veces los costes.
4. Respetar autorizaciones en PvP y registrar quién ejecutó cada acción.

### Hito 2.4 — Pruebas de regresión
- Duelo 1vNPC y 1v1 con igualdad/desigualdad de velocidad; ataques físicos, mágicos y defensas intercaladas.
- Habilidad sin recursos; coste exacto; bloqueo por cooldown; aplicación/expiración del buff; colisiones con barrera; daño crítico; inmunidad por efecto.
- Desconexión y recarga a mitad de ataque pendiente, a mitad de duración y tras el cierre de combate.
- Balance de iniciativas en miles de duelos y auditoría del historial de ticks.

## Límites intencionales
- No se modifican los HP globales, maná persistente ni inventarios por los combates de prueba de la fase 1.
- No se introducen tipos de efecto ad hoc ni fórmulas duplicadas: se consultan los catálogos existentes.
- La fase 2 se implementa en incrementos revisables y probados, para preservar las batallas y fichas existentes.

## PvP verificado
- Dos encuentros entre jugadores terminaron la primera prueba real: el lienzo físico y el campo defensivo mágico funcionaron tras la PR 113.
- La invitación es manual mediante el enlace del encuentro, con actualización de 3,5 segundos.
