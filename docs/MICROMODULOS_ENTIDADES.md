# Micromódulos reutilizables: entidades, comportamientos y estados

## Alcance de esta entrega

Se añadieron inicialmente diez tipos de pasos; esta entrega amplía el catálogo con un paso adicional al contrato `EffectContainer`, su validación y su editor visual React Flow. El intérprete puro produce intenciones. Desde PR #170 existe un adaptador de invocaciones en el motor de combate, y la PR #172 agrega un adaptador de estados por contacto. Solo los grafos estrictamente reconocidos se ejecutan; los demás permanecen deshabilitados. Los costes, iniciativa, PA/ticks, posicionamiento y permisos los verifica el motor autorizado.

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
| `SET_ENTITY_STAT` | Clave, atributo de criatura y valor numérico fijo | Estadística intrínseca: no referencia al invocador |\n| `SET_ENTITY_BEHAVIOR` | Clave, conducta inicial, conductas permitidas, objetivo y disparador | Solicitud de conducta editable dentro de las opciones autorizadas |
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

## Implementación actual: atributos propios y contacto (PR #172)

**Valores independientes del invocador:** agrega `SET_ENTITY_STAT` por cada atributo que quieras fijar. Por ejemplo, un dragón puede materializarse siempre con `PHYSICAL_ATTACK=180`, `PHYSICAL_DEFENSE=90`, `AGI=60`, `MOVE_SPEED=60`, `PRECISION=75`, `DODGE=30`, `STRENGTH=120` e `INTEGRITY=300`; también `MAGIC_ATTACK`, `MAGIC_DEFENSE`, `CON`, `CRITICAL`, `LUCK`, `RACE` y `MASS_KG` son configurables de forma independiente. Las estadísticas que no fijes pueden quedar enlazadas al invocador mediante `LINK_ENTITY_STAT` o utilizar los valores predeterminados del motor. No se permite fijar y enlazar el mismo destino simultáneamente. Por compatibilidad, los vínculos antiguos siguen siendo dinámicos.

**Estados en combate:** después de `SUMMON_ENTITY`, sus estadísticas y `SET_ENTITY_BEHAVIOR`, conecta:
1. `SELECT_TARGET` con `USER` para tocar al invocador o `OPPONENT` para golpear al rival.
2. `REQUIRE_CONTACT` con la salida anterior; el motor verifica contacto y alcance reales.
3. Para una estadística opcional, agrega `SELECT_STAT`, eligiendo `FIXED`, `RANDOM` (tirada del servidor) o `COMBAT` (selector visible en el encuentro).
4. `APPLY_STATUS` (por ejemplo `DODGE`, `BONUS=-20`, 2 turnos), o `INVERT_STATUS` para revertir una mejora negativa ya activa. Cada efecto de contacto se asocia a la última criatura declarada dentro del mismo contenedor.

La orden del familiar utiliza un PA y ticks del **propietario**. La ofensiva contra el rival ocurre solo al resolver el ataque físico; para exigir que haya reducción real de HP, configura `SET_ENTITY_BEHAVIOR.trigger=HP_DAMAGE`. Tocar al invocador permite mejoras o inversiones con la misma orden pagada (si la criatura está a 0.65 m). Los cambios se guardan únicamente en `combatV1.summonStatuses`, vencen por ronda y no modifican la ficha persistente.

Una inversión válida sustituye un estado negativo por su inverso positivo: multiplicador `0.7` pasa a `1.3`, una bonificación `-20` a `+20`. Cobra exactamente el `manaCost` aprobado y aumenta una carga del acumulador del familiar, con máximo de seis. Un intento sin debilitamiento no cobra ni crea carga. El estado original no se duplica.

**Limitaciones:** los estados se aplican a atributos de combate permitidos; las fórmulas numéricas dinámicas para un `APPLY_STATUS` dependiente de criatura aún requieren un adaptador específico. Esta fase no implementa `READ_STATUSES` como condición, objetivos libres o un motor universal de gráficos arbitrarios. El estado/estadística elegidos están restringidos al catálogo compilado y a los estados realmente activos. `Reino del Caos` y el consumo de cargas para `Sobreflujo Lunar` no forman parte de este hito.
