# XAHYA — Contrato de reconstrucción: motor V1 + reloj compartido

Fecha: 18 de noviembre de 2026. Estado: **contrato de implementación, no funcionalidad desplegada**.
Base: `main`. La PR experimental #278 se cerró sin fusionar.

## Decisión de producto

**No existen dos motores de combate que deban igualarse.** El motor y la interfaz V1 son la especificación funcional. Se reemplaza únicamente la contabilidad de ticks como recurso por un reloj absoluto y común a todos los participantes. El planificador temporal V2 es un mecanismo interno, no una nueva experiencia de usuario ni una nueva implementación de reglas.

**Invariantes no negociables**

1. Mantener `CombatEncounter.tsx` y sus componentes: `CombatCharacterHud`, `CombatDialog`, `CombatSkillLoadout`, `CombatEquipmentStatus`, `CombatTopDownPlane`, `CombatVerticalActionPlane` y `CombatMusicPlayer`. No construir un segundo HUD o interfaz de acciones.
2. Mantener la semántica de las órdenes V1 del tipo `CombatCommand`: `MOVE`, `WAIT`, `ATTACK`, `DEFEND`, `CAST_SKILL`, `USE_ITEM`, `COMMAND_SUMMON` y `BOOST_KARMA`. Admitir objetivos `targetSummonId` y `targetConstructionId`, desplazamientos y las órdenes autónomas de invocaciones.
3. Mantener las fórmulas y validaciones de `lib/combat/turn-engine.ts` para daño, contacto, precisión, esquiva, resistencias, defensa, equipamiento, durabilidad, movimiento, estados, habilidades, construcciones, invocaciones, costes no temporales, narración y resultados. Refactorizarlas para poder ejecutarse con un tiempo suministrado por el reloj, **no duplicarlas en módulos V2**.
4. `turnTicks(fighter, tipo)` significa **duración**. Nunca es saldo, moneda, cuota de iniciativa ni impedimento para iniciar una acción dentro de una ventana que la acción pueda cruzar.
5. El reloj autoritativo mantiene `nowTick` monotónico, `availableAtTick` por actor y eventos con `startsAtTick` / `endsAtTick`. Al programar, `inicio = max(nowTick, availableAtTick)`; `fin = inicio + duración`. No recortar a 100.
6. Los PA siguen siendo un recurso separado. Sus reglas y reinicio se manejan en fronteras de ronda calculadas del reloj; no mediante `spentTicks`. El paso del tiempo y los PA no se cobran dos veces.
7. Declarar una acción **no ejecuta** todavía daño, curación, desplazamiento, gasto de maná ni durabilidad. Se valida y reserva; la resolución ocurre cuando llega el evento. Las tiradas y reglas se ejecutan en servidor.
8. Eventos simultáneos se resuelven respecto de la misma instantánea anterior y sus efectos se aplican una sola vez en una transacción consistente. Ningún participante obtiene ventaja mecánica por orden de llegada HTTP.
9. **Bloqueo y esquiva** ocupan ventanas absolutas desde el inicio hasta el tick final; un impacto que se completa exactamente en el tick de cierre coincide con la defensa (empate temporal), pero uno posterior no, con coste al declararse. Un bloqueo ya activo se confronta con todos los impactos que lo alcancen durante su ventana, sin cobrar un segundo bloqueo; conserva geometría, resistencias y desgaste por impacto. Una esquiva también tiene comienzo, duración, desplazamiento/posición y fin: cada trayectoria debe evaluarse contra la posición y condiciones defensivas en el instante del impacto. La esquiva no es invulnerabilidad indiscriminada durante toda la ventana, ni debe cobrarse una esquiva adicional por cada golpe que coincida con un movimiento evasivo válido. Después del tick `fin`, esa defensa deja de proteger; no se aplica retroactivamente.
10. Siguen vigentes permisos PvP, acciones idempotentes, privacidad de las trayectorias/predicciones, propiedad de objetos y habilidades, validación de la geometría y reconciliación de inventario.
11. No cambiar la continuidad de los trazos físicos ni otras reglas V1 como parte de la migración de tiempo. Cualquier cambio de interacción solicitado por separado (p. ej. origen libre) requiere una PR y pruebas propias, nunca se introduce de contrabando.
12. No fusionar ni desplegar antes de pruebas automatizadas, de integración y visuales. No reactivar despliegues automáticos.

## Dónde está mezclado el tiempo con las mecánicas

| Archivo y símbolo | Comportamiento que debe cambiar | Qué se conserva |
| --- | --- | --- |
| `turn-engine.ts:spend` | Suma `spentTicks` con límite 100; desacoplar ese saldo de las acciones temporales | Cobro de PA y reglas del comando |
| `turn-engine.ts:canAct` / `hasInitiativeBudget` | Decide iniciativa por ticks gastados o disponibles | Elegibilidad por estado, actor y presupuesto PA |
| `turn-engine.ts:advanceRoundIfComplete` | Reinicia ronda por agotar PA/ticks | Efectos de inicio de ronda, expiraciones, mantenimiento, eventos micro y espejos |
| `turn-engine.ts:applyCompositeStep` | Niega desplazamiento+acción al agotar `spentTicks` | Colisión, orden BEFORE/AFTER y coste de 2 PA |
| `turn-engine.ts:applyCombatCommand` | Múltiples checks y marcas de tiempo derivados de `spentTicks` | Toda la resolución real de mecánicas V1 |
| `CombatEncounter.tsx` + `CombatCharacterHud.tsx` | Muestran ticks como saldo y determinan disponibilidad por `spentTicks` | Todo el layout, modales, controles y animaciones |
| `action-timeline.ts` | **Se conserva** su cola de eventos y avances absolutos | No se copia ningún sistema de daño V2 |
| `CombatV2Encounter.tsx`, `timeline-experiment.ts` | Dejan de ser la base de nuevos combates una vez migrado el flujo | Utilidades de planificación que pasen las pruebas V1 |

## Capas de la solución

```text
CombatEncounter.tsx (V1, misma UI y mismos comandos)
      |
  transporte/controlador de combate por tiempo (autorización, idempotencia)
      |
  reloj absoluto (declarar → programar → agrupar → resolver)
      |
  reglas V1: aplicar órdenes reales con contexto temporal del evento
      |
  commit atómico del estado V1 + línea temporal + efectos persistentes
```

La ruta de acciones V1 antigua se mantiene para encuentros legados; los combates nuevos pasan a ese mismo cliente mediante un adaptador de protocolo **solo cuando sea plenamente compatible**. No conectar directamente V1 a la API parcial experimental: su parser y sus resulutores todavía excluyen órdenes V1.

### Compatibilidad de la interfaz

El estado proyectado al cliente temporal conservará la forma V1 y agregará datos de reloj (`nowTick`, acciones en curso, comienzo/fin, PA por ronda, reacción disponible, telegráficos autorizados). Los componentes que muestran ticks restantes los sustituirán por tiempo absoluto/duración; los demás permanecerán intactos. La selección de objetivos, habilidades, menús y dibujos seguirá generando órdenes V1.

### Compatibilidad del motor

Separar el efecto de `applyCombatCommand` del consumo/avance temporal sin escribir una segunda fórmula de ataque. Los comandos `DEFEND` deben poder asociarse a eventos de impacto/intervalos sin asumir que solo puede existir un `pending` global. Preservar todos los casos V1, no solo `ATTACK` físico básico. El contexto de evento debe proveer tiempo, objetivo, consentimiento de reacción, dados de servidor, autoridad de habilidad, origen de inventario y estado de mundo.

### Reacciones y golpes simultáneos

La cola determina **cuándo** se produce el impacto; la defensa V1 determina **qué sucede**. En un golpe contra guardia activa, no crear otra acción de bloqueo. Para una esquiva hay que conservar la trayectoria de movimiento, calcular la posición a tiempo de impacto y confrontarla con cada ataque; nunca inferir que «esquiva activa» significa inmunidad global. Las acciones que terminan en el mismo tick se evalúan sobre una instantánea previa idéntica para evitar ventaja del orden de llegada. Los golpes sin contacto deben narrarse como fallo de contacto y no como impactos de cero daño.

## Implementación incremental y puertas de aceptación

- **R0 — Contrato y pruebas de preservación (esta rama).** Conservar manifest de UI/comandos y pruebas del reloj que cruza 100 ticks sin agotar un recurso. Sin tocar rutas ni mecánicas productivas.
- **R1 — Extraer política de tiempo de V1.** Refactorizar `spend`, `canAct`, `advanceRoundIfComplete` y sellos de evento bajo política LEGACY/TIMELINE; pruebas comparativas que garanticen que LEGACY no cambia.
- **R2 — Resolución V1 con reloj.** Conectar el planificador a las órdenes **originales** sin parser ni resolutores mecánicos paralelos. Ensayar casos simples y simultáneos sin adelantar estado antes del tick de fin.
- **R3 — Paridad de mecanismos.** Habilidades, invocaciones y sus órdenes, objetos, karma, movimiento combinado, equipo, construcciones, magia, estados, pasivas, guardias, defensas y consumos. Ninguna opción V1 debe quedar muda o rechazada solo por la migración.
- **R4 — Cliente V1 sobre transporte temporal.** Adaptar carga/envío de `CombatEncounter` y etiquetas de reloj/PA, sin reemplazar componentes, modales, música o disposición móvil.
- **R5 — Integración y seguridad.** PvP, espectador, IA, reintentos, concurrencia, secretos, persistencia, cargas de datos y resultados; pruebas regresivas de V1 y de línea temporal.
- **R6 — Validación visual y humana.** Comparar V1 y temporal a mismo tamaño de pantalla: ataques dibujados, dos lienzos, todos los menús, animaciones, estados, defensa frente a dos impactos, trazabilidad de cero daño. Solo entonces evaluar transición y despliegue **manual**.

### Reglas de bloqueo de merge

Una PR no puede clasificarse «V1 sobre reloj» si conserva una pantalla independiente `CombatV2Encounter` como experiencia del usuario, si pierde comandos V1, si utiliza `spentTicks` como presupuesto, si rehace las fórmulas, o si no demuestra paridad visual en móvil y escritorio. Una PR técnica parcial puede revisarse como trabajo de infraestructura, nunca como fin de migración.

## Referencia de defecto conocido

Encuentro #90 (18-nov-2026): tres ataques del jugador en ticks 17, 34 y 51 con daño cero, contacto falso y texto de «impactó». La resistencia no explica esos ceros. Debe preservarse la distinción entre *fallo de contacto*, *bloqueo*, *mitigación* y *daño nulo*, con registros auditables sin filtrar información privada antes del impacto.
