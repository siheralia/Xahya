# XAHYA — Fase D2.4: primer estado modular hostil por contacto real

Fecha: 9 de noviembre de 2026. Base: PR #218 ya fusionada.

## Objetivo y decisión de alcance

D2.3 permite estados propios con `APPLY_STATUS`. D2.4 conecta un primer
**debilitamiento sobre el rival**, pero no habilita un hechizo instantáneo
que imponga estados sin tirada, trayectoria ni reacción.

Se reutiliza el motor existente de `ATTACK → DEFEND → RESOLVE`. El
lanzamiento crea un ataque pendiente con su objetivo y su respuesta normal.
El estado solo se aplica si el golpe acaba haciendo **daño efectivo a HP**
al rival tras la geometría, la esquiva, la defensa y las barreras.

La curación, los estados propios y las habilidades convencionales no cambian.

## Contrato estricto de habilidad

La habilidad debe pertenecer a la categoría `OFFENSIVE`, estar aprobada,
tener `approvedAt` y `pchCost` positivos, sin mantenimiento ni
acumulación. Cada efecto COMPOSED necesita `reviewedPch` de administración.
No se crean precios alternativos ni se acepta un grafo del cliente.

Esta primera familia requiere **exactamente dos efectos**:

1. `DAMAGE_MULTIPLIER` físico existente, con `PHYSICAL_ATTACK` al 100 %.
   Este daño se ejecuta exclusivamente mediante el motor normal del combate.
2. Un efecto `COMPOSED` validado, con disparador `ACTIVATE` y dos pasos:
   `SELECT_TARGET(OPPONENT)` conectado directamente a
   `APPLY_STATUS`. No se aceptan requisitos/condiciones ni más pasos.

Solo admite ataque físico de tipo corte, contundente o perforación con
área Objetivo único o Contacto, alcance máximo entre 1 y 5 metros,
maná de activación positivo, y estado de 1 a 5 turnos que coincida con
la duración de la habilidad.

Por lanzamiento se emite un solo debilitamiento en ataque físico/mágico,
defensa física/mágica, precisión o esquive. Los valores permitidos son
`BONUS` negativo desde -20 hasta -1 o `MULTIPLIER` de ×0,80 hasta menos
de ×1. No se permiten buffs hostiles, estadísticas raciales, fórmulas
externas, elementos, áreas, invocaciones ni estados adicionales.

## Ejecución

- `compileCombatSkill` autoriza la combinación revisada y deja un plan
  de daño físico normal + estado hostil, con cooldown y PCH ya validados.
- `applyResolvedCombatSkill` ejecuta en el servidor el intérprete de
  micromódulos contra `OPPONENT` autorizado, validando la única intención.
  Guarda solo esa intención numérica dentro del ataque pendiente.
- `combatClientView` elimina el estado privado pendiente para no filtrar
  el contenido de una habilidad ni convertir una predicción de defensa
  en información obtenida por el cliente.
- Al resolver el ataque, el motor mide contacto, cobertura física y
  HP perdido. Si `contact === true` y `actualHpDamage > 0`, aplica
  el debilitamiento con `applySummonStatus` al **defensor real**.
  De lo contrario, no crea ningún estado. El estado tiene id estable
  derivado del `requestId` y fuente `SKILL:<id>`.
- La misma acción consume una sola vez maná, PA, ticks y cooldown dentro
  de la transacción bloqueada. El `requestId` duplicado no dispara otra
  ofensiva. La duración, reversión y vista de los estados son las mismas
  del motor persistente actual.

## Simulación

Una técnica llamada «Impacto debilitante» cuesta 8 de maná, usa un
ataque físico al 100 % y, solo si causa daño a HP, debilita la defensa
mágica enemiga por ×0,80 durante 2 turnos. Si el rival tiene defensa
mágica 10, queda en 8 mientras dura el estado. Si esquiva, no sufre
ningún debilitamiento. Al vencer el estado, recupera su defensa anterior.

Son **ejemplos de pruebas**: no se crean habilidades de jugadores, no
se cobran ni regalan monedas o PCH y no se alteran fichas en producción.

## Verificación y pendientes

`tests/combat-approved-hostile-contact-status.test.mjs` contempla:
contacto y daño real, esquiva, objetivos inventados, valores fuera de
rango, aprobación y PCH, persistencia, expiración y reintentos.

Pendiente D2.5/D3: daño y estados mágicos, selección de enemigos/aliados
en múltiples objetivos, debuffs en área, política de acumulación entre
familias, inmunidades y resistencia específica a estados. Ninguna de
estas opciones puede habilitarse por debajo de la resolución defensiva
normal. `LEGACY_ONLY` sigue siendo el interruptor de seguridad.
