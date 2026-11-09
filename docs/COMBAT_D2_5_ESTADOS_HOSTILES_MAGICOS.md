# XAHYA — D2.5: debilitamientos modulares tras impacto mágico

Fecha: 9 de noviembre de 2026. Rama basada en el merge de PR #219
(`4a86c103020a8c55271293f6e36346e231e5fb3d`).

## Objetivo

Permitir el primer `APPLY_STATUS` hostil que acompañe un ataque
**mágico** aprobado, sin crear una ruta de daño o debilitamiento
que ignore defensas, espejos o la geometría del motor.

Se extiende la familia D2.4 — ataque ofensivo normal más un efecto de
estado COMPOSED revisado — no se construye un segundo sistema de hechizos.

## Reglas de aprobación

Se conservan los requisitos de D2.4: habilidad `OFFENSIVE` propia
`APPROVED`, `approvedAt`, `pchCost > 0`, un solo módulo de estado
`COMPOSED` con `reviewedPch`, maná de activación positivo, sin
mantenimiento ni acumulación, sin condiciones narrativas ni mecánicas
no resueltas.

El efecto de daño base debe ser exactamente `DAMAGE_MULTIPLIER`
al 100 %, con uno de los siguientes canales:

- `PHYSICAL_ATTACK` / `PHYS_ATK`: conserva el ataque físico de D2.4.
- `MAGIC_ATTACK` / `MAGIC_ATK`: selecciona un **ataque mágico**;
  no se acepta combinación de canales, daño arbitrario o elementos
  adicionales disfrazados de atributos del efecto.

En magia solo se admite **Objetivo único** con alcance configurado de
1 a 5 m, no explosiones, franjas, conos, contacto mágico ni áreas.
El tipo de ataque sigue siendo uno de corte, contundente o perforación.
El estado tiene el contrato de D2.4:

- Un `SELECT_TARGET(OPPONENT)` conectado a `APPLY_STATUS`.
- Solo reducción de ataque físico/mágico, defensa física/mágica,
  precisión o esquive, `BONUS` de -1 a -20 o `MULTIPLIER` desde ×0,80
  hasta menos de ×1.
- Duración de 1 a 5 turnos coincidente con la habilidad.
- Sin selección arbitraria del navegador, estadísticas extras,
  condiciones, áreas o más de un estado por lanzamiento.

## Resolución en combate

El compilador obtiene `usesMagic` **del efecto de daño revisado**,
nunca de una marca proporcionada por el navegador. El plan entra en
`applyResolvedCombatSkill` y utiliza la ruta normal
`ATTACK → DEFEND → RESOLVE`.

Se exige marcar el punto del hechizo en el lienzo; la defensa se
resuelve con los mismos mecanismos de los demás ataques mágicos:
esquiva con predicción, campo mágico, resistir, barrera física y
espejo sobre la trayectoria mundial de un rayo directo.

`resolveApprovedHostileStatus` obtiene una intención controlada
con el intérprete de micromódulos. Se guarda en el ataque pendiente,
pero `combatClientView` mantiene ocultos la intención, el rayo y
el centro verdadero mientras el rival no responda.

**Solo se crea el estado cuando hay contacto y daño realmente
perdido de HP.** Si el rival esquiva, un espejo intercepta el rayo,
una barrera bloquea todo el ataque o la mitigación deja el daño en
cero, no nace el debilitamiento. Un campo mágico que amortigua
pero no impide todo el daño conserva el efecto, pues el golpe
sí alcanzó los HP. Esto no aumenta el maná, PA, ticks ni cooldown:
todos pertenecen al único lanzamiento ya aprobado.

La aplicación, registro, suma de estados, serialización,
vencimiento y reversión reutilizan `applySummonStatus`,
`activeCombatStatusViews` y `expireSummonStatuses`. La fuente es
`SKILL:<id>` y el ID se deriva del `requestId` de ese lanzamiento.
Los errores y reintentos se procesan sin duplicar cobros.

## Ejemplo simulado

«Rayo entorpecedor» cuesta 12 de maná. Su daño mágico 100 %
atraviesa el resolutor oficial y, si quita HP, aplica defensa
mágica ×0,80 durante dos turnos. Un oponente de defensa mágica 10
pasa a 8 mientras dura el estado; al vencer recupera su valor.
Un espejo interpuesto o una esquiva exitosa evita tanto el golpe
al oponente como el estado.

Las pruebas usan personajes sintéticos. Esta PR no otorga PCH,
no crea o aprueba habilidades reales ni modifica fichas.

## Pruebas y frontera

`tests/combat-approved-hostile-magic-status.test.mjs` cubre:
daño y estado solo tras resolución; reintentos; recursos; caducidad;
esquiva; reflexión por espejo real; campo mágico con daño parcial;
mitigación completa sin estado; requisitos, precios y áreas;
prohibición de blancos externos y visualización previa sin filtración
de la intención privada. Se conserva toda la regresión física D2.4.

No se implementan aún efectos en múltiples objetivos, zonas mágicas,
condiciones de resistencia/estado, inmunidades específicas, daño
multicanal, debuffs automáticos sin impacto, acumulación general de
estados de familias distintas ni efectos sobre criaturas o aliados.
El interruptor `LEGACY_ONLY` sigue bloqueando habilidades modulares
hostiles nuevas.
