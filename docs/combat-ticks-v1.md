# Xahya — combate con ticks, PA y reacciones (primera integración)

## Diseño implementado
- Cada turno contiene **100 ticks lógicos** y cada actor tiene **9 + CON puntos de acción**.
- El coste temporal de cada movimiento/ataque se calcula con `calculateActionTicks(AGI)`, con modificadores CUT / BLUNT / PIERCE. Una AGI doble permite aproximadamente el doble de movimientos en 100 ticks, limitada por los PA.
- Para no adelantar al contrario indefinidamente, un actor solo puede acumular hasta el tiempo de la siguiente acción del rival. El defensor recibe una acción pendiente, consulta su estado y elige una sola reacción.
- Las reacciones **ESQUIVAR, BLOQUEAR, RESISTIR, REPELER, DESVIAR y NINGUNA** consumen PA/ticks cuando corresponda. No se concede otro esquive gratis si ya se ha optado por bloquear.
- Al golpear, una resolución real puede acabar el enfrentamiento **en el primer ataque** si el HP del rival llega a cero. No se conceden derrotas automáticas por comparar solamente ATQ y DEF.
- Cada arma empieza con **100 de integridad en ese encuentro**. El bloqueo comprueba CON frente a STR; una integridad elevada no concede fuerza al portador. La integridad disminuye por bloqueo y está almacenada en el estado del encuentro, no todavía en inventario.
- Posición 1D en metros; el movimiento se acerca o aleja y el ataque físico necesita estar a 2 m o menos.
- Masa neutral de **70 kg**; `knockbackMeters` compara fuerza con resistencia, ajustada por masa y limitada a 12 m. El género del personaje no presupone una masa.
- El lienzo SVG guarda la trayectoria normalizada de un ataque. El ángulo de la guardia determina su alineación con la tangente final; desviar compara AGI con STR.
- Piedra-papel-tijeras: **CUT > DISPERSED, BLUNT > SOLID, PIERCE > CONCENTRATED**. Cada ataque también tiene una desventaja y un enfrentamiento neutral, con ×1.2 / ×0.8 / ×1 de potencia.
- Flash de pantalla al resolver impactos; aviso de ataque pendiente y registro de eventos.
- Solo el servidor genera tiradas aleatorias; actualizar el estado del combate es una operación transaccional con bloqueo de fila.
- PvP entre personajes: la apertura corresponde a GM/ADMIN. Cada propietario puede controlar su propio personaje y el GM ambos; el cliente actualiza el encuentro mediante consultas cada 3,5 s.
- En entrenamiento, el NPC responde automáticamente, eligiendo defensa y acción según los ticks pendientes.

## Estado técnico
El estado `combatV1` se guarda en `combatSession.lastAction` para reutilizar la tabla y no introducir migraciones en esta primera integración. El motor de campos sigue usando `combatSession.mechanicsState` y avanza una vez cuando termina la ronda.

### Pendiente para activar como sistema final
1. **HP y durabilidad persistentes fuera del encuentro:** los cambios permanecen en la sesión, pero no se vuelcan a `characterResource` ni a la integridad de cada `characterItem`. Hace falta una migración y lectura centralizada de esos valores.
2. **Ejecutar habilidades reales:** esta versión activa ataques físicos básicos. Las habilidades ofensivas con coste de maná, cooldown, resistencia variable, barreras y efectos narrativos todavía deben pasar por un resolutor de impactos común. El ataque mágico se rechaza hasta integrar el coste de maná.
3. **Trayectorias espaciales completas:** el dibujo se utiliza para calcular el desvío, pero no es un mapa físico 2D ni detecta colisiones contra obstáculos.
4. **Multijugador completo:** dos personajes registrados ya pueden actuar, pero aún no hay equipos con tres o más personajes, ni notificaciones push del navegador.
5. **Derrota del laberinto:** el botón de derrota automática del laberinto sigue utilizando su heurística heredada. En una fase posterior debe consultar este resolutor en vez de comparar directamente ATQ > DEF.
6. **Equilibrio:** ejecutar y revisar las simulaciones deterministas `tests/combat-turn-engine.test.mjs` (10k enfrentamientos de precisión y 1k duelos completos), ajustar los coeficientes con datos de personajes representativos y analizar los efectos de LCK en Esquive.
7. **Acciones avanzadas:** consumibles, efectos de área, movimiento 2D, esquive con posiciones, vigilancia, concurrencia PvP más allá de dos actores, finales administrativos y desconexiones.

## Validación
- `npm test` incluye las pruebas del motor, balance de matchups, velocidad, economía de PA, daño, integridad y trayectorias.
- `npx tsc --noEmit` y `npm run build` deben pasar en CI.
- La implementación está aislada en rutas nuevas `/combat` y `/api/combat/:id/actions`; conserva el motor antiguo y las habilidades existentes sin reemplazarlos en esta rama.
