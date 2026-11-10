# XAHYA — D4.1: auditoría inicial y primer arreglo de experiencia de combate

Fecha: 10 de noviembre de 2026. Base: `main` después de PR #229 (`6c6f05f3`).

## Alcance y evidencia

Esta es una **auditoría de código y contratos de UI**, no una prueba visual de navegador autenticado.
Se revisaron `CombatEncounter.tsx`, `CombatSkillLoadout.tsx`,
`MicroEffectFlowEditor.tsx`, `SkillEffectsEditor.tsx`,
`skill-preview.ts` y pruebas existentes. Para afirmar compatibilidad visual real
hacen falta capturas y recorridos interactivos a **320 px**, **390 px** y escritorio,
con combate auténtico y un personaje autorizado; no están certificados por este documento.

## Hallazgos iniciales (orden de impacto para un jugador)

| Nivel | Lugar | Hallazgo | Estado |
| --- | --- | --- | --- |
| Alto | Habilidades, acción | El botón de lanzamiento se desactiva por varios motivos pero la explicación original omite `busy` y no enumera causas simultáneas (p. ej. maná + distancia). | **Corregido en D4.1**: lista accesible de bloqueos verificados, sin modificar el motor. |
| Alto | Habilidades, preparación | Aprobación y ejecución no son equivalentes: las habilidades aprobadas sin resolutor completo estaban identificadas solo dentro del desplegable. | **Mejorado en D4.1**: etiqueta «No ejecutable» en el resumen y descripción dentro. |
| Alto | Editor de micromódulos | `isValidConnection` rechaza tipos o módulos fuera de orden sin explicar en pantalla la conexión específica rechazada. | Pendiente D4.2. |
| Medio | Editor móvil | Nodos de 204 px y zoom automático de React Flow pueden reducir demasiado el texto con grafos grandes. | Requiere inspección real a 320/390 px; pendiente D4.2. |
| Alto | PCH y aprobación | La reserva provisional de COMPOSED y el PCH revisado necesitan matriz de casos al agregar conexiones, editar duración/alcance y guardar/aprobar. | Pendiente auditoría del servidor con regresiones, sin descuentos gratuitos. |
| Alto | Estados y resolución | Falta comprobar en pantalla fuente, duración, acumulaciones, expiración, daños por canal y distinción entre invocación y usuario. | Pendiente D4.3. |

## Flujo que debe cubrir la auditoría interactiva

1. **Preparación:** abrir HUD, ficha, habilidades y editor; confirmar presupuesto de maná/PA/ticks y requisitos antes de elegir.
2. **Acción:** activar movimiento, trazado físico, centro de magia y habilidad modular; comprobar motivos de bloqueo sin pulsaciones inertes.
3. **Reacción:** bloquear, desviar, esquivar y esperar sin habilitar acciones propias durante el turno enemigo.
4. **Resultado:** comprobar cronología de golpes físicos/mágicos, mitigación, gasto único y procedencia de invocaciones.
5. **Estados activos:** revisar etiquetas en español, fuente, estadísticas, tiempo restante, apilamiento y desaparición tras recarga.
6. **Editor:** explorar nodos, puertos y conexiones, intentar tipos incompatibles, borrar enlaces, guardar, editar PCH y obtener errores legibles.
7. **Pantallas:** repetir en móvil de 320 y 390 px y escritorio, con teclado/foco, lector de pantalla y modales; documentar capturas y fallos concretos.

## Entrega D4.1

- La presentación enumera **todos** los bloqueos de la habilidad antes de lanzar: otra solicitud en proceso, iniciativa,
  movimiento combinado/PA/ticks, enfriamiento, maná, criaturas de fusión, cargas,
  alcance y preparación del área/objetivo.
- El texto hace referencia a las verificaciones **ya existentes**, sin cambiar autorización,
  precio de PCH, consumo de PA, maná, ticks, ejecución, estado del servidor ni efectos.
- Un `role="status"` y un `aria-describedby` asocian el motivo a un botón deshabilitado.
- En habilidades sin resolutor, el mensaje no promete ejecución solo por estar aprobadas.
- Las pruebas de `combat-d4-1-skill-feedback.test.mjs` comprueban combinaciones de bloqueos
  y el enlace visible/accesible. Se mantienen las regresiones del combate.

**Criterios pendientes de la fase D:** resolutores generalizados, múltiples objetivos,
estados complejos, persistencia, reconexión y PvP siguen expresamente abiertos.

**Publicación:** esta PR se deja sin fusionar y sin desplegar; no reactiva los despliegues automáticos.
