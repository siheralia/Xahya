# Reino del Caos — fusión de invocaciones y distorsión direccional

## Entrega técnica

La mecánica se implementa mediante **dos micromódulos reutilizables** y los que ya existían para crear estadísticas y comportamientos:

1. `FUSE_SUMMONS`: identifica de dos a ocho criaturas **ya presentes y vivas** por su `entityKey`. Todas deben pertenecer al combatiente que fusiona, estar dentro del radio de control y no haber expirado. Configura el nombre y clave resultantes, coste propio de activación, mantenimiento, duración, rango de control y golpes soportados.
2. `LINK_ENTITY_STAT` / `SET_ENTITY_STAT` (mínimo: ataque físico, agilidad e integridad): controlan independientemente las estadísticas del ser resultante. No se heredan automáticamente las estadísticas de los familiares consumidos.
3. `SET_ENTITY_BEHAVIOR`: especifica los modos y la selección de objetivo del ser único. **Ninguna de las criaturas concede acciones gratuitas** al fusionarse.
4. `CHAOS_FIELD`: opcional. Se instala sobre el ser resultante, con radio de 0,5 a 15 m, giro de 90°, 180° o 270° y rotación fija o cambiante en cada ronda. El efecto no funciona como daño, hechizo de control mental ni teletransporte: remapea el vector de movimientos deliberados del rival.

Un botón **«🌀 Plantilla: Reino del Caos»** crea el grafo de seis pasos de ejemplo. Las siete claves ilustrativas son `BNUUY_JUICIO`, `BNUUY_CARGA`, `BNUUY_INTERIOR`, `BNUUY_SOLEDAD`, `BNUUY_VIDA`, `BNUUY_CAMINATA` y `BNUUY_ECLIPSE`; reemplázalas por las claves reales que se hayan configurado para las invocaciones aprobadas de tu personaje. Ninguna habilidad se inserta ni se aprueba automáticamente.

### Ejemplo de la plantilla, editable

- **Fusión:** siete conejos ya activos; genera `REINO_CAOS`.
- **Coste de activación:** 30 de maná (valor de ejemplo; debe coincidir con `skill.cost`).
- **Mantenimiento:** 20 maná por turno (valor de ejemplo; debe coincidir con `skill.maintenanceCost`).
- **Duración:** 2 turnos (editable, debe concordar con la duración de la habilidad si está expresada).
- **Estadísticas:** ataque físico del usuario ×1, agilidad del usuario ×1 e integridad = defensa física del usuario ×2. Cambia vínculos por `SET_ENTITY_STAT` para tener un ser con atributos completamente predeterminados, igual que un dragón.
- **Conducta:** mantener posición, con opciones de atacar o recibir órdenes manuales, pagando los PA/ticks del controlador.
- **Campo:** 5 m, giro inicial 90° y rotación por ronda 90° → 180° → 270° → 90°… (sin dirección neutra).

### Efectos que sí funcionan durante el encuentro

- Una habilidad aprobada cuyo grafo sea exclusivamente la fusión se compila en la categoría de combate `FUSION`; no se aceptan módulos ajenos, disparadores condicionales ni mezclas con invocaciones nuevas en el mismo lanzamiento.
- Al activarse se comprueba en el **estado autorizado y bloqueado del encuentro** la posesión, existencia, integridad, vida útil y control de **todas** las criaturas requeridas, además de iniciativa, cooldown, PA/ticks y maná. Se elimina solo ese conjunto, no invocaciones ajenas, se migra cualquier carga lunar antigua y se crea **una única entidad** en la posición que ocupaba la primera criatura (sin desplazamiento gratuito).
- El mantenimiento de los familiares sacrificados deja de cobrarse; la nueva criatura paga su propio mantenimiento cuando corresponda, desaparece al terminar la duración, perder integridad o salir de control. Los debilitamientos previamente aplicados permanecen hasta su expiración normal.
- Mientras el rival esté dentro del radio **al empezar su movimiento**, la dirección física solicitada se gira en el plano horizontal. Se incluyen `MOVE` hacia delante, atrás, arma o trazo, movimiento combinado con ataque y desplazamiento de una esquiva activa. La distancia recorrida no aumenta, los obstáculos siguen comprobándose en la **ruta real**, y no se duplican PA o ticks.
- El campo **no** modifica trayectoria de ataque dibujada, área de magia, defensa de bloqueo, empujón involuntario, daño, iniciativa ni la dirección de los propios movimientos del dueño. Si hay múltiples campos enemigos, se aplica el más cercano y se desempata por ID estable; no se acumulan las rotaciones.
- Si el ser que mantiene el campo desaparece, cesa la distorsión inmediatamente. El encuentro guarda los datos en `combatV1.summons`, sin modificar fichas persistentes.

### Seguridad, PCH y límites

Los valores numéricos de la plantilla son **ejemplos de autoría**, no decisiones de balance definitivas. El coste formal de PCH requerirá investigación posterior. Se conserva idempotencia por `requestId` y protección contra fuentes falsificadas, criaturas ajenas, fusión de sí misma, costes de maná discordantes, módulos adicionales, doble asignación de estadísticas y ángulos de distorsión fuera de la lista permitida.

No se implementa una IA autónoma adicional ni un mapa visual de áreas de influencia en el plano todavía. El campo solo altera **desplazamientos voluntarios** mientras la criatura resultante está en combate: no altera las salidas del laberinto ni la navegación del mundo.
