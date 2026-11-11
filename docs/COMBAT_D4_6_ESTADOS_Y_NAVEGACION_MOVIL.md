# XAHYA — D4.6 Estados de combate comprensibles y navegación móvil

Fecha: 10-11 de noviembre de 2026.

## Hallazgo en el código

El panel fijo de combatiente (`CombatCharacterHud`) incluye un botón
«N estados temporales activos · Ver duración» que llamaba a
`onPanel("stats")`, pero el listado con origen, modificador y caducidad
estaba dentro de `CombatDialog open={panel==="karma"}`. El jugador no veía
la duración cuando pulsaba el botón prometido.

La sección «Criaturas en el campo» duplicaba `summonStatuses` sin filtrar
entradas cuyo `expiresAtRound <= state.round`. Así una entrada vencida
podía seguir apareciendo como «activa». Un multiplicador neutro `×1`
también aparecía como bonificación.

## Corrección

- Mover el detalle a **Estado y estadísticas**, la pantalla que ya abre el
  botón del HUD. No se cambia la operación «Karma».
- Un único componente de lectura `CombatActiveStatusPanel` presenta
  estados **propios y del adversario** con separación por combatiente,
  rótulos «Beneficioso/Perjudicial», descripción en español, origen,
  ronda exacta de vencimiento y rondas restantes.
- Junto al HUD aparece una franja táctil de acceso al detalle cuando
  existe algún estado. También indica **perjuicios propios** y
  **ventajas rivales**, para que un icono no sea la única explicación.
- Evitar sobreancho con `min-w-0`, `flex-wrap`,
  `break-words` y tarjetas en una columna por defecto (dos a partir
  de `sm`). Un botón de al menos 44 px evita objetivos táctiles pequeños.
- Eliminar el listado de invocación duplicado y no filtrado. El visor
  usa exclusivamente `activeCombatStatusViews` proyectado del
  `CombatState` persistido y validado por servidor.
- Excluir valores neutros (`BONUS 0`, `MULTIPLIER 1`) y caducados.
  No cobrar recursos ni activar capacidades narrativas desde la UI.

## Pruebas

`tests/combat-d4-6-active-status-navigation.test.mjs` verifica
lecturas de ambos combatientes, persistencia tras serializar, expiración,
filtrado de estados neutros, ausencia de mutaciones y ubicación del
componente en el diálogo correcto, además de los estilos responsables
del ancho reducido.

Se actualiza la prueba del ciclo de estados existente para inspeccionar
la ubicación del texto de vencimiento en el componente nuevo.

**Límite de validación:** las comprobaciones anteriores son de motor
y revisión estática. No se ha ejecutado un navegador autenticado con
capturas reales a 320/390 px y escritorio. Esa comprobación visual
sigue pendiente; no se debe marcar como completada con solo build o
pruebas de cadenas.

## Pendiente del bloque D4

- Auditoría visual real a 320, 390 px y escritorio, incluida orientación
  horizontal y el acceso a herramientas de reacción.
- Revisión de contraste, foco y modal en navegadores móviles.
- Consolidación de estados de invocaciones, condiciones y efectos de
  equipo cuando la autoridad del servidor los publique en un contrato
  tipado común; no sumar estados por el mero nombre de una habilidad.
