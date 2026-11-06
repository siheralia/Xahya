# Micromódulos reutilizables: entidades, comportamientos y estados

## Alcance de esta entrega

Se añaden **diez tipos de pasos** al contrato `EffectContainer`, su validación y su editor visual React Flow. El intérprete **solo produce solicitudes/intenciones deterministas**: no crea criaturas en combate, no descuenta maná por su cuenta, no aplica estados a personajes ni activa conductas autónomas. Toda operación con efectos externos requiere un adaptador del motor de encuentros que compruebe permisos, PV/maná, PA/ticks, posicionamiento y coste de PCH definitivo. El motor de combate continúa rechazando micromódulos sin resolutor compatible.

Las salidas de `SELECT_TARGET` (identidad) y `SELECT_STAT` (clave de estadística) están tipadas y no se pueden conectar a entradas numéricas, objetos ni fórmulas. React Flow ofrece conectores compatibles por tipo. Los resultados `RANDOM` y `COMBAT`, las identidades, los contactos, los estados y la pérdida final de HP se obtienen de un **contexto validado por servidor**: jamás de un selector libre provisto por JSON del jugador.

## Catálogo nuevo

| Tipo | Entradas | Resultado |
| --- | --- | --- |
| `SELECT_TARGET` | USER / OPPONENT / ALLY / COMBAT | Identidad autorizada con salida de objetivo |
| `SELECT_STAT` | FIXED / RANDOM / COMBAT, lista permitida | Clave de estadística con salida tipada |
| `READ_HP_DAMAGE` | Evento DAMAGE_RESOLVED con HP_DAMAGE | Pérdida real de HP para un `when: > 0` |
| `REQUIRE_CONTACT` | Salida de objetivo, contacto certificado | Detiene los pasos posteriores de su efecto si no se produjo contacto |
| `SUMMON_ENTITY` | Clave, nombre, maná, mantenimiento, turnos, radio y golpes | Solicitud de invocación |
| `LINK_ENTITY_STAT` | Clave, estadística del usuario, destino, factor | Solicitud de vínculo dinámico, con valor inicial |
| `SET_ENTITY_BEHAVIOR` | Clave, conducta inicial, conductas permitidas, objetivo y disparador | Solicitud de conducta editable dentro de las opciones autorizadas |
| `APPLY_STATUS` | Objetivo, estadística fija/seleccionada, multiplicador/bono y duración | Solicitud de estado temporal |
| `READ_STATUSES` | Objetivo y filtro de mejoras/debilitamientos | Conteo de estados |
| `INVERT_STATUS` | Objetivo, último/elegido, maná, almacén opcional | Solicitud de inversión de debilitamiento |

Las lecturas, condiciones y selectores no suman depósito provisional de acciones. Las acciones nuevas sí se contabilizan en el depósito provisional vigente de 5 PCH por micromódulo, con revisión administrativa para determinar el PCH final. **Esto no determina el precio formal de capacidad de invocaciones**.

## Ejemplo genérico: familiar con estadísticas vinculadas

En `ACTIVATE` se encadenan:
1. `SUMMON_ENTITY`: `entityKey=FAMILIAR`, maná 30, mantenimiento 20, 2 turnos, radio 15 m, 3 golpes.
2. `LINK_ENTITY_STAT`: `PHYSICAL_ATTACK -> PHYSICAL_ATTACK`, factor `0.2`.
3. `LINK_ENTITY_STAT`: `AGI -> AGI`, factor `1`.
4. `LINK_ENTITY_STAT`: `PHYSICAL_DEFENSE -> INTEGRITY`, factor `2`.
5. `SET_ENTITY_BEHAVIOR`: `FOLLOW`, destino `USER`, activación por `CONTACT`; opciones de cambio `FOLLOW,ATTACK,MANUAL`.

Para una criatura con ataque completo se cambia solamente el factor de ataque a `1`. Invocar siete entidades cuesta siete veces el maná de activación; un botón visual «Invocar todas» **no** debe condonar recursos ni conceder acciones gratuitas.

## Ejemplo genérico: debilitamiento y apoyo al usuario

En un evento `DAMAGE_RESOLVED`:
1. `SELECT_TARGET` enlaza la identidad `USER` u `OPPONENT`.
2. `READ_HP_DAMAGE` lee la pérdida efectiva de HP.
3. `SELECT_STAT` elige entre claves permitidas, en autoría o durante el combate.
4. `APPLY_STATUS`, con condición `HP_DAMAGE > 0`, aplica `MULTIPLIER = 0.5` por dos turnos.

Para efectos de **contacto**, usar `REQUIRE_CONTACT` antes de `APPLY_STATUS`. Un familiar puede cambiar su destino a USER para aplicar una mejora/debilitamiento según sus módulos, pero el motor debe restringir ese cambio al comportamiento autorizado.

Para invertir debilitamientos, `READ_STATUSES` y `INVERT_STATUS` permiten elegir el último o uno concreto del objetivo. `manaCost=10` y `chargeAccumulator=LUNAR_CHARGES` solo expresan el **pago y la carga condicionada al éxito**: la carga no se registra antes de que el resolutor invierta de verdad el estado y cobre el maná. La inversión debe sustituir el debilitamiento por su equivalente positivo, no apilarlo sobre un factor negativo.

## Próximas integraciones obligatorias

1. Resolutor persistente de entidades de combate con propietario, posición, alcance, movimiento, integridad, cuenta de golpes y desaparición.
2. Descuento atómico de maná de activación y mantenimiento; un coste por entidad, sin duplicados por reintentos.
3. Control de PA/ticks y programa de órdenes autónomas con límites por turno, sin siete acciones gratis.
4. Selector de combate para objetivos y estadísticas permitidas, con aleatoriedad reproducible generada por servidor.
5. Intercepción de daño **después de mitigar** para informar `HP_DAMAGE` al evaluador.
6. Estados de combate con procedencia, duración, revocación, stacking, inversión y crédito lunar atómicos.
7. Tests end-to-end PvP/PvE, revisiones de PCH y balance.

Ninguna habilidad de ejemplo se inserta automáticamente en la base de datos. Se preservan todas las habilidades y resolutores anteriores.
