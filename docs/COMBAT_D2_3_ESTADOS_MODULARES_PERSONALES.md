# XAHYA — D2.3: estados modulares personales aprobados

Fecha: 9 de noviembre de 2026. Base: fusión de la PR #216 (`ead20db5`).

## Objetivo de esta entrega

Conectar la primera forma verificable de `APPLY_STATUS` de una habilidad
`COMPOSED` al **motor existente de estados persistentes de combate**.
El primer destino autorizado es el propio lanzador, seleccionado mediante
`SELECT_TARGET: USER`. Los efectos sobre enemigos, aliados o criaturas no
se habilitan todavía: requieren selección real, posibilidad de reacción,
cobertura, límites y política de objetivos antes de aplicar alteraciones.

## Habilidades y módulos admitidos

Conservan todos los requisitos de D2.2:

- Habilidad propia `APPROVED`, `approvedAt`, `pchCost > 0`, valor
  `reviewedPch` por cada efecto, requisitos y padres autorizados,
  no robada ni desactivada expresamente.
- Categoría `SUPPORT`, área Personal, maná de activación positivo;
  no admite mantenimiento, acumulación ni mecánicas sin resolutor.
- Módulos con disparador `ACTIVATE` y un grafo local validado,
  con hasta 4 efectos y 12 pasos. Continúan `READ_STAT`, `CALCULATE`,
  `HEAL` y `BONUS`, con sus topes anteriores.
- Se agregan `SELECT_TARGET` **solo con `selector:USER`** y
  `APPLY_STATUS`, con referencia a la salida de ese selector.
  La selección no es un identificador libre del navegador.
- `APPLY_STATUS` admite únicamente las estadísticas de ataque/defensa
  física y mágica, precisión y esquive; operaciones `BONUS` positivo
  (hasta +100) y `MULTIPLIER` positivo (mayor que 1, máximo ×1,30).
  Hasta **dos estados** y cuatro mejoras temporales en total por lanzamiento;
  la suma de bonos aditivos del lanzamiento no supera +200.
- Los estados tienen duración de 1 a 20 turnos y deben coincidir con
  la duración declarada de la habilidad. Una curación sin estados ni
  bonos conserva su duración instantánea. No hay otros triggers,
  condiciones, objetivos ni operaciones implícitos.

## Resolución y persistencia

El evaluador de micromódulos calcula *intenciones* puras; el motor de
combate valida el resultado completo y aplica cada estado mediante
`applySummonStatus` usando `sourceSummonId: SKILL:<id>` y un identificador
estable por solicitud. La denominación histórica del tipo `summonStatuses`
se conserva por compatibilidad, aunque también representa estados de habilidad.

El estado, los deltas aplicados, la fuente y `expiresAtRound` se guardan
en el `combatV1` existente, se muestran en «Estado y estadísticas» y
caducan con `expireSummonStatuses`, sin modificar fichas globales.
El lanzamiento cobra **una sola** acción con maná, PA, ticks y cooldown
usuales, bajo la misma transacción bloqueada e idempotencia por `requestId`.
Un error de límites o un objetivo ajeno aborta toda la acción, sin pagos
ni efectos parciales.

## Ejemplo simulado

«Armadura resonante» cuesta 8 de maná y aplica un estado personal de
defensa mágica ×1,20 durante 2 turnos. Si el personaje tiene defensa
mágica 10, pasa a 12. El estado aparece con su origen y duración, y al
comenzar la ronda 3 la defensa vuelve a 10. El adversario no recibe
ninguna modificación. Un reintento del mismo `requestId` no cobra
una segunda vez.

El ejemplo es **sintético**: esta PR no crea habilidades, no concede
PCH ni altera personajes de producción.

## Pruebas y siguientes límites

`tests/combat-approved-modular-self-status.test.mjs` cubre selección
propia, evaluación basada en estadísticas del servidor, caducidad,
visualización, serialización, reintentos, pago único, rechazo de objetivo
contrario y valores fuera de rango.

Pendiente D2.4/D3: objetivos externos autorizados, resolución por
contacto, defensas y reacciones; debilitamientos, selección de
estadísticas, áreas y acumulación de estados entre múltiples habilidades.
No habilitar ataques ni estados hostiles saltándose el motor oficial.
El interruptor `LEGACY_ONLY` sigue desactivando estos módulos
sin introducir otro sistema de precios.
