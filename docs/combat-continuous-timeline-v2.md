# Xahya — Cronología continua del combate (núcleo V2)

## Objetivo

Los **ticks son tiempo compartido**, no una moneda de gasto. Un ataque, movimiento, guardia o hechizo tiene `inicio`, `fin`, duración y un coste de PA independiente. El hecho de llegar al tick 100 **no corta ni teletransporta** la acción. Una acción de 60 ticks iniciada en el tick 95 termina en el **155**.

### Semántica

1. El reloj usa ticks absolutos `0,1,2,...`; la ronda visible se deriva de `Math.floor(tick/100)+1`.
2. Cada actor puede tener una intención pendiente. El servidor **no avanza** la acción larga del rival hasta recibir la intención de los demás actores activos (o una espera declarada). Esto es fundamental para que no ocurra el falso salto temporal del combate 81.
3. Cada intención reserva un intervalo `[startsAtTick,endsAtTick)`. La duración se conserva íntegra, aunque atraviese varias rondas.
4. Los PA se descuentan **una vez al comenzar la acción**, del presupuesto de la ronda del inicio. No hay créditos de PA por múltiples impactos dentro de la misma guardia.
5. Una guardia `BLOCK` protege todos los impactos físicos que realmente atraviesen su cobertura mientras su intervalo y equipo permanezcan válidos. El resolutor será responsable del ángulo, tipo, daño, desgaste y rotura **por impacto**. Este núcleo solamente indica cuándo existe la guardia y su copia de equipo.
6. Los acontecimientos con la misma marca de finalización salen **en un único lote simultáneo**. El futuro resolutor debe calcular ambos daños antes de decidir quién queda derrotado.
7. Si una guardia queda interrumpida, deja de cubrir desde ese tick. Sus PA ya pagados no se restituyen.
8. Las acciones ya resueltas permanecen en un historial acotado; los eventos pendientes no se eliminan.

## Implementado en esta etapa

`lib/combat/action-timeline.ts` contiene el planificador determinista, sin consultas a la base de datos y sin dependencias de Next.js. `tests/combat-continuous-timeline.test.mjs` comprueba doble impacto contra escudo, expiración, acciones que cruzan el tick 100, respuestas simultáneas, prohibición de saltar un evento sin respuesta, coste de PA e interrupción.

## Importante: separación y compatibilidad

**Este núcleo todavía no cambia la resolución de daño del combate real.** El actual `combatV1` y el despliegue de la PR #240 continúan en funcionamiento. No añadir a la API pública entradas arbitrarias a este planificador; el servidor deberá compilar y validar las intenciones, bloquear transaccionalmente la sesión y generar las tiradas aleatorias.

## Próxima integración (fase V2.2)

- Crear un adaptador `CombatCommand → TimelineIntent` para MOVE/ATTACK/DEFEND y habilidades aprobadas, con los tiempos reales del equipo y la acción compuesta.
- Mantener las declaraciones de ambos jugadores en el snapshot del encuentro. Una única petición no debe ejecutar una acción larga en el futuro.
- Al cerrar el siguiente lote, resolver en una transacción simultánea las colisiones, defensas activas, disparos, invocaciones, maná y desgaste. Requerir que el proyectil tenga tiempo de vuelo explícito cuando sea pertinente.
- Actualizar el HUD: reloj absoluto, secuencia de acciones anunciadas, intervalos de guardia, acciones en curso y estado «Esperando la intención del rival».
- Migrar **por encuentros nuevos únicamente** usando una versión opt-in, dejando las sesiones `combatV1` legibles y sin reinterpretar sus resultados.
- Construir simulaciones de combate 81, ataques dobles, escudos rotos, contraataques simultáneos, 50/100/150 ticks y múltiples invocaciones; probar invariantes de PA, HP, durabilidad, idempotencia y desconexiones.

### Criterio para activar V2 en producción

No activar el nuevo resolutor hasta que pase la suite actual de combates, las pruebas de carrera sobre PostgreSQL y las simulaciones temporales; el núcleo V2 por sí solo no hace que el combate real sea totalmente simultáneo.
