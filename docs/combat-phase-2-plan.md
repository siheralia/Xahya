# Xahya — estado vigente del combate y roadmap de fase 2

**Corte de auditoría:** 4 de noviembre de 2026 (hora de Xahya).  
**Rama consultada:** `main`. **Documento de referencia operativo:** este archivo; el plan antiguo se conserva al final como histórico y no prevalece sobre esta sección.

## Producción y PR

- PR #124 fusionada (commit `55fd635fdd7e374247d56587f9b59c95c05109d8`), superada por nuevas integraciones.
- PR #125–#138: **todas fusionadas**, incluido #128 (círculos), #131 (Meia-lua), #132 (copias modulares), #135 (React Flow), #137 (pasivas narrativas) y #138 (guía en español).
- La PR #140 también está **fusionada** en `main`, commit `60e2ab9abcc95b797cf8394a7b5c10e567fc24b4`: los modificadores de ticks de armas no penalizan patadas/puños/magia, y las pasivas estadísticas aprobadas contribuyen a los valores efectivos del encuentro sin alterar la ficha.
- PR #141: franjas rectangulares orientables **implementadas en una rama y aún sin fusionar**. Su implementación y pruebas no deben contarse como funcionalidad ya disponible en producción.
- En la comprobación más reciente del 4 de noviembre, `xahya.vercel.app` sirve el despliegue Vercel **READY de producción** de `60e2ab9` (PR #140). Las vistas previas de PR no son producción.
- Hay PR abiertas ajenas a este avance, entre ellas #114 de investigación PCH. Una PR abierta no equivale a funcionalidad integrada.
- Fuente de verdad: estado real de las PR, código de `main`, tests y despliegues, no las descripciones históricas de los PR.

## Invariantes de diseño

1. **100 ticks por turno**; PA por Constitución (base del motor: `9 + CON`); iniciativa, acciones y reacciones consumen sus presupuestos reales.
2. Daño, alcance, velocidad, elemento, duración, maná y cooldown provienen de la habilidad aprobada. **No debilitar el daño del jugador para compensar un NPC frágil.**
3. Las fuentes físicas (mano principal, secundaria, puños, patada) preservan su trayectoria por fuente; el lanzador y el oponente tienen sus reglas de geometría verificadas por el servidor. Desde #140 los modificadores de velocidad por tipo de arma aplican **solo a ataques que realmente utilizan esa arma equipada**, no a patadas, golpes desarmados ni magia; los efectos estadísticos de pasivas aprobadas pueden modificar la instantánea de combate.
4. HP, maná y boosts de combate son **exclusivos del encuentro**: una derrota no reduce permanentemente los HP/maná de la ficha. El karma gastado **sí se descuenta persistentemente**. La persistencia individual de durabilidad de armas y consumo de objetos sigue pendiente.
5. Las acciones se autorizan en servidor y las peticiones repetidas no deben cobrar una segunda vez.
6. Las habilidades declarativas o narrativas **no son automáticamente ejecutables**. La representación en React Flow y la paridad numérica no acreditan un resolutor completo ni una migración final.
7. Mantener operativos mini boost de karma (2 karma → +1 estadística base por 1 PA), Sikatā y sus bloques con resistencia variable, fotoconstrucciones del resolutor existente, espejos, HUD plegable y crónica de combate.

## Estado por prioridad

| Área | Estado | Entregado y comprobable en main | Lo que todavía falta |
| --- | --- | --- | --- |
| **1. NPC de entrenamiento** | **Primer incremento integrado; ampliaciones pendientes** | #125: perfiles Básico, Intermedio, Avanzado, Resistencia y Agresivo; raza activa, perks raciales, 3 perks generales extra, hasta 3 habilidades públicas compatibles; las decisiones se fijan por encuentro. #126 corrige filtrado de extras, #130 aplica modificadores de daño de perks. El perfil Resistencia multiplica HP del NPC en vez de reducir daño de jugadores. | Configurar por separado HP/estadísticas/estrategia a nivel de encuentro; tácticas defensivas más sofisticadas y simulaciones largas de balance. No asumir que el NPC ejecuta cualquier habilidad del catálogo. |
| **2. Ataques de área** | **Parcial** | #128: círculos de radio 0,1–10 m para ataques físicos y mágicos, objetivo geométrico, pista de región, defensa y contacto con espejos; selector normalizado. #131: `SELF_FIELD` físico de Meia-lua centrado en usuario, con alcance y reacción. | Conos, líneas emitidas desde un origen 2D real, barridos configurables por apertura angular, efectos parciales, colisiones de otras construcciones y daño a múltiples combatientes. **Franjas rectangulares con largo/ancho/ángulo existen en PR #141, pendiente de fusión**. La arena local 10×10 m todavía **no** es un campo general de movimiento 2D multiobjetivo. |
| **3. Inventario persistente** | **Pendiente** | Existe `weaponIntegrity` en el estado de combate; se aplica desgaste de bloqueo en memoria de encuentro. Las armas ya conservan IDs de inventario cuando corresponde. | Durabilidad **por ejemplar** guardada en BD, consumo de objetos, devolución idempotente de armas arrojadas, reconciliación transaccional al concluir y migraciones compatibles. No confundir desgaste temporal con persistencia. |
| **4. Resolutor general de efectos** | **Parcial, avance considerable** | #129: micromódulos y aprobación con reserva PCH provisional. #132: proyección de 63 definiciones en copias virtuales, paridad numérica y adaptadores compatibles. #135–#136: editor React Flow con conexiones reales, cálculo/lecturas, `MODULAR_FIRST`, fallback y opción administrativa de rollback. #137: condición narrativa de pasivas ya no obligatoria. | Ejecución universal de grafos condición → acción; combinaciones, mantenimiento, acumulación, colisiones, desplazamiento forzado, estados y acciones narrativas sin resolutor; migración completa sin fallback. La copia virtual **no** crea otra habilidad aprobada. La investigación del PCH definitivo permanece separada. |
| **5. Estados alterados** | **Parcial en infraestructura; familias pendientes** | Existen bonos temporales, registros por ronda y mecanismos reutilizables de condiciones/almacenamiento. | Veneno, sangrado, quemaduras, resistencias e inmunidades específicas; acumulación, expiración, limpieza y consecuencias mecánicas completas. Sin daño permanente a la ficha. |
| **6. Robustez y pruebas** | **Parcial** | Pruebas de regresión para escenarios #46 (perks), #47 (Meia-lua), #49 (esquiva/ticks). #127 corrige origen y alcance de espejos. #133 evita falsa validación de esquiva sin presupuesto, sin conceder defensa gratuita. #134 visibiliza ticks en HUD. #138 introduce guía de habilidades y etiquetas en español. #140 corrige penalizaciones de tiempo de arma para ataques desarmados/Meia-lua y aplica pasivas estadísticas aprobadas al inicio del encuentro. | Desconexión con impactos pendientes, reconexión durante mantenimiento, ataques combinados, múltiples construcciones, PvP complejo, resistencia a duplicación de solicitudes, auditoría y pruebas móviles integrales. |

## Próximo incremento recomendado — geometría ofensiva sin romper lo existente

**Orden:** finalizar y validar las **franjas orientables de la PR #141** sin fusionarlas antes de recibir orden; luego ampliar a conos y barridos con apertura angular en otra PR, y continuar con inventario persistente y ejecución de grafos modulares. La prioridad NPC inicial ya se cumplió; no repetir #125.

1. Partir de `lib/skills/area-of-effect.ts`, `lib/combat/skill-area.ts`, `lib/combat/skill-casting.ts`, `lib/combat/turn-engine.ts`, el lienzo de `app/combat/[id]/` y sus pruebas. Preservar `CIRCLE`, `SELF_FIELD`, objetivo único y legados.
2. Definir contrato **tipado** para la siguiente forma (línea/franja o cono), con alcance, dimensiones (ancho o apertura), origen/dirección y validación del servidor. No interpretar descripciones libres como formas ejecutables.
3. Resolver explícitamente el origen y dirección en 2D: actualmente el lienzo es una **proyección local**, no contiene posiciones espaciales completas de ambos actores. No fingir una posición de usuario que el motor no registra. Si el contrato necesita una posición nueva, introducirla de forma compatible con encuentros antiguos antes de usarla para daño.
4. Mantener idempotencia, consumo de maná/PA/ticks, cooldown, visibilidad del área real solo después de la defensa y reacciones individuales pagadas. No trasladar gratis la esquiva circular a nuevas geometrías.
5. Verificar impacto/acierto y fallo por posición; intersección con espejos/bloques; límite de alcance; redacción del registro; UI móvil; compatibilidad con habilidades existentes. Probar PvP/NPC y objetivos múltiples **solo cuando realmente estén representados**.
6. No declarar «multiobjetivo completado» mientras `CombatState` solo tenga `PLAYER` y `NPC`.

## Después de las áreas

**Inventario transaccional:** inspeccionar primero esquema/filas de Supabase y relación entre personajes, equipamiento e IDs de objeto. Separar la integridad de cada ejemplar de su tipo; deduplicar consumo/retorno mediante IDs de solicitud y una operación atómica. Nunca liquidar daño a HP/maná persistentes.

**Resolutor modular:** extender primero capacidades mecánicas reales del grafo y sus eventos, con tests de paridad y rollback; luego estados alterados, barreras, acumulación/mantenimiento y desplazamiento. Mantener separados PCH provisional de autoría e investigación de coste definitivo.

**Fases posteriores (no iniciadas como parte de este roadmap):** más combatientes por encuentro, IA táctica avanzada, campo espacial común, integración con laberinto/terreno, balance y PvP ampliado. Solo después de estabilizar resolutor e inventario.

## Procedimiento obligatorio

Para cada incremento: inspeccionar `main` y PR abiertas → diagnosticar lo que falta → reutilizar motor/catálogos → crear rama → implementar y añadir regresión → ejecutar `npm test`, validación TypeScript/Next.js y revisar CI → validar preview de Vercel → abrir PR → **no fusionar hasta que la usuaria indique «Fusiona»**. No modificar esquema Supabase sin inspección previa ni presentar preview como producción.

---

## Apéndice histórico — plan anterior (NO vigente)

> Los estados y las órdenes de trabajo a partir de este punto se conservan solo para trazabilidad. Cuando contradigan el estado vigente de arriba o el código de `main`, **prevalecen el código y el roadmap actual**.

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
