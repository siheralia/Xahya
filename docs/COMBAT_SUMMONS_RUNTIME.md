# Invocaciones en el motor de combate — primera integración

## Alcance efectivo
PR #170 integra un subconjunto explícito de los micromódulos generales para convertir **habilidades aprobadas** en criaturas reales del encuentro. No hay cambios de base de datos: el estado se conserva en `combatV1.summons`, compatible con encuentros antiguos que no tienen esa propiedad.

Solo se ejecutan, en una habilidad formada exclusivamente por `COMPOSED` con disparador `ACTIVATE`:
- `SUMMON_ENTITY` para una entidad física con propietario, coste y mantenimiento individuales, duración, radio y tope de golpes.
- `LINK_ENTITY_STAT` a estadísticas reconocidas, con factores numéricos fijos que se vuelven a leer del invocador en cada uso.
- `SET_ENTITY_BEHAVIOR` para seguimiento, persecución/ataque, mantenerse quieto, aproximarse para proteger y órdenes manuales.

Si falta uno de los vínculos obligatorios de `PHYSICAL_ATTACK`, `AGI`, `INTEGRITY`, falta comportamiento o hay tipos de paso sin adaptador, **la habilidad no se declara ejecutable**. Esto incluye, por ahora, `APPLY_STATUS`, `INVERT_STATUS`, daño a HP condicionado y lectura de contacto. Ningún efecto narrativo se convierte silenciosamente en daño.

## Costes y economía de turnos
La **suma** de `SUMMON_ENTITY.manaCost` debe coincidir exactamente con `skill.cost`, y la suma de `maintenanceMana` con `skill.maintenanceCost`: no hay cobro doble ni invocaciones gratuitas. El coste de activación se descuenta antes de calcular un posible avance de ronda. Cada criatura superviviente consume su mantenimiento al pasar a la ronda siguiente, excepto si ya expiró. Falta de maná o salir del radio de control la hace desaparecer. Se exige `durationTurns >= 1`. La invocación consume una acción.

Cada orden individual usa **1 PA y los ticks correspondientes al invocador**, tanto cambiar comportamiento como desplazarse o atacar. Los conejos no obtienen turnos independientes ni acciones gratuitas por su cantidad. Las órdenes se registran con ID en el sistema existente de idempotencia. El atacante enemigo puede elegir una invocación como objetivo de su ataque normal y gastar igualmente su acción.

## Movimiento y ofensiva
Las criaturas se colocan inicialmente en una espiral alrededor del invocador. Las posiciones son coordenadas horizontales en metros, verificadas contra obstáculos. Un desplazamiento posterior valida velocidad, obstáculos y radio de control.

El ataque básico de una entidad es contundente y tiene alcance de 1.5 m desde su propia posición. Su potencia procede de `PHYSICAL_ATTACK` del propietario multiplicado por el factor conectado (por ejemplo, 0.2 o 1). La víctima resuelve su reacción con el motor normal, aplicándose defensa y daño a HP. No se permiten contraataques simultáneos directos al golpe de una criatura en esta primera fase.

Cuando una invocación recibe un ataque real, pierde integridad calculada inicialmente con la defensa física del invocador. El golpe cuenta incluso si la mitigación deja 1 punto de daño; se destruye al llegar a 0 integridad o alcanzar el límite de impactos. La integridad, posición, propietario y golpes son visibles en el encuentro.

## Ejemplo para siete familiares
Siete módulos `SUMMON_ENTITY` de 30 maná, mantenimiento 20, duración 2 turnos, control 15 metros y 3 impactos cada uno, en una habilidad aprobada con `cost=210` y `maintenanceCost=140`. Con defensa física de 40, el vínculo `INTEGRITY = PHYSICAL_DEFENSE × 2` produce 80 puntos iniciales por criatura. El Bnuuy de la Vida cambia exclusivamente el vínculo `PHYSICAL_ATTACK` de 0.2 a 1; el Bnuuy de la Caminata puede usar `MOVE_SPEED × 3`.

## Límites deliberados y siguiente hito
- Los estados, buffs/debuffs por contacto, selección aleatoria o en combate de estadísticas, inversión lunar, guardia/intercepción autónoma y distorsión de direcciones del Reino del Caos **no** se ejecutan todavía. Los nombres de comportamiento no conceden esas capacidades por sí mismos.
- No hay scheduler autónomo: `ACT` ejecuta el comportamiento seleccionado **al recibir una orden pagada**, permitiendo automatizar su decisión de atacar o acercarse, sin regalar siete acciones.
- Un mantenimiento insuficiente desactiva criaturas en orden de creación.
- No hay persistencia de criaturas fuera del encuentro ni invocación de NPC ficticios desde habilidades personales de un NPC de entrenamiento.
- Siguiente entrega: estados temporales persistidos en combatV1 y resolución de contacto autenticado, con debit transaccional por inversión y carga lunar solo tras éxito.

## Seguridad
Las definiciones se recompilan desde el registro de habilidad aprobado dentro de la transacción bloqueada. El cliente solo aporta el ID de la habilidad, el ID de criatura existente y una orden. El servidor verifica propiedad de la criatura, coste, iniciativa, posición, geometría, tipo de ataque y disponibilidad del comportamiento.


## Ampliación: autonomía, acompañamiento y elección individual de objetivos

Las criaturas con modo `ATTACK`, `FOLLOW` o `PROTECT` tienen un reloj de acción
independiente de los PA del invocador. El servidor resuelve como máximo una
acción por criatura en cada actualización autorizada, una vez alcanzados
sus ticks propios y respetando sus PA de ronda. No hay temporizadores del
navegador ni efectos de ataques fuera de una transacción de combate.

- `ATTACK`: se aproxima al enemigo asignado y golpea desde 1,5 m. Si el
  objetivo es un combatiente, conserva la reacción habitual. Si es una
  criatura enemiga, desgasta su integridad y sus impactos.
- `FOLLOW`: acompaña al dueño a distancia de contacto y aplica únicamente
  efectos aprobados con destino `USER` y disparador de contacto. Un estado
  activo de la misma fuente/estadística no se vuelve a acumular.
- `PROTECT`: por ahora sigue al propietario; la intercepción automática
  requiere su propio micromódulo y **no** se concede implícitamente.
- `HOLD` y `MANUAL`: no ejecutan acciones autónomas.
- Cambiar modo, asignar un objetivo o dar una orden explícita continúa
  costando 1 PA y los ticks del invocador. Las acciones espontáneas usan el
  presupuesto propio de cada criatura.
- Los objetivos se verifican en servidor: combatiente rival o una invocación
  enemiga viva presente en el encuentro. Cada criatura tiene su objetivo
  independiente. No se permite elegir a un aliado como blanco ofensivo.
- Los encuentros antiguos sin reloj propio se incorporan a partir del
  siguiente slot de tiempo; nunca reciben turnos retroactivos.
- La cámara de vista superior incluye las criaturas activas al calcular
  su encuadre automático.

**Límite actual:** el motor mantiene dos combatientes principales (`PLAYER`
y `NPC`). Esta ampliación no crea combates con varios personajes enemigos
ni inventa blancos adicionales: para esa capacidad debe ampliarse el modelo
de participantes y la resolución de reacciones.
