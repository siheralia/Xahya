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
- **Continuidad de ataques físicos:** cada combatiente conserva el punto final de su último trazo físico como inicio obligatorio del siguiente, incluso al cambiar de ronda o reconectar. Un movimiento real del combatiente (incluidos los desplazamientos forzados) libera el punto inicial. El defensor/oponente tiene un anclaje independiente. La API comprueba el inicio exacto del trazo y la IA del NPC respeta el mismo requisito; los ataques mágicos no alteran el anclaje físico.
- Los ataques mágicos básicos permiten escoger **corte, contundente o penetración**. Comparten la matriz vigente de ventajas y desventajas frente a defensa dispersa, sólida o concentrada. Se trata del tipo de impacto, no de un hechizo elemental especial.
- **Ataque mágico básico de área (fase 1):** en el mismo lienzo, el lanzador toca un centro y observa un círculo. El motor guarda el punto exacto exclusivamente en `combatV1` del servidor; durante la reacción solo comparte una pista de región 3×3. El defensor puede optar por **Esquivar área**, señalando el centro previsto en un terreno más grande. La predicción espacial se combina con Esquive/Precisión, cuesta PA/ticks y permite comprobar el círculo real después de resolver.
- Alcance provisional del básico mágico: 10 m frente a 2 m del golpe físico; daño mágico básico limitado con ATQ/DEF mágicos. **Coste de maná provisional 0**, sin habilidades específicas ni efectos elementales. El maná real y los costes de habilidades corresponden a la fase 2.
- El NPC de entrenamiento varía atributos básicos en **puntos enteros**, conservando la velocidad efectiva del personaje, y puede elegir ocasionalmente una explosión mágica con objetivo aleatorio. Nunca conoce el centro exacto cuando reacciona al ataque mágico de un jugador.
- Piedra-papel-tijeras: **CUT > DISPERSED, BLUNT > SOLID, PIERCE > CONCENTRATED**. Cada ataque también tiene una desventaja y un enfrentamiento neutral, con ×1.2 / ×0.8 / ×1 de potencia.
- Flash de pantalla al resolver impactos; aviso de ataque pendiente y registro de eventos.
- Solo el servidor genera tiradas aleatorias; actualizar el estado del combate es una operación transaccional con bloqueo de fila.
- PvP entre personajes: la apertura corresponde a GM/ADMIN. Cada propietario puede controlar su propio personaje y el GM ambos; el cliente actualiza el encuentro mediante consultas cada 3,5 s.
- En entrenamiento, el NPC responde automáticamente, eligiendo defensa y acción según los ticks pendientes.

## Estado técnico
El estado `combatV1` se guarda en `combatSession.lastAction` para reutilizar la tabla y no introducir migraciones en esta primera integración. El motor de campos sigue usando `combatSession.mechanicsState` y avanza una vez cuando termina la ronda.

### Pendiente para activar como sistema final
1. **HP y durabilidad persistentes fuera del encuentro:** los cambios permanecen en la sesión, pero no se vuelcan a `characterResource` ni a la integridad de cada `characterItem`. Hace falta una migración y lectura centralizada de esos valores.
2. **Ejecutar habilidades reales:** esta versión admite ataques físicos y mágicos **básicos**; las habilidades aprobadas con gasto de maná, cooldown, resistencia variable, barreras y efectos narrativos todavía deben pasar por un resolutor de impactos común. El coste de maná de la explosión básica es cero provisionalmente; no es un hechizo configurable.
3. **Trayectorias espaciales completas:** el dibujo se utiliza para calcular el desvío, pero no es un mapa físico 2D ni detecta colisiones contra obstáculos.
4. **Multijugador completo:** dos personajes registrados ya pueden actuar, pero aún no hay equipos con tres o más personajes, ni notificaciones push del navegador.
5. **Derrota del laberinto:** el botón de derrota automática del laberinto sigue utilizando su heurística heredada. En una fase posterior debe consultar este resolutor en vez de comparar directamente ATQ > DEF.
6. **Equilibrio:** ejecutar y revisar las simulaciones deterministas `tests/combat-turn-engine.test.mjs` (10k enfrentamientos de precisión y 1k duelos completos), ajustar los coeficientes con datos de personajes representativos y analizar los efectos de LCK en Esquive.
7. **Acciones avanzadas:** consumibles, efectos de área, movimiento 2D, esquive con posiciones, vigilancia, concurrencia PvP más allá de dos actores, finales administrativos y desconexiones.

## Validación
- `npm test` incluye las pruebas del motor, balance de matchups, velocidad, economía de PA, daño, integridad y trayectorias.
- `npx tsc --noEmit` y `npm run build` deben pasar en CI.
- La implementación está aislada en rutas nuevas `/combat` y `/api/combat/:id/actions`; conserva el motor antiguo y las habilidades existentes sin reemplazarlos en esta rama.
