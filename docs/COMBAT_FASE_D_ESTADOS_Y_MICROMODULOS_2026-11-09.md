# Xahya — fase D: habilidades modulares y estados persistentes

**Base:** main tras #211, #212 y #213. **Fecha:** 9 de noviembre de 2026.

## Inventario comprobado

| Componente | Estado actual |
| --- | --- |
| Intérprete `lib/effects/micro-modules.ts` | Existe; módulos tipados, referencias numéricas, condiciones, acumuladores, salidas y protección contra reintentos |
| `CombatState.microEffects` | Opt-in exclusivo de servidor; persiste en `combatV1`; PASSIVE de resistencia, DAMAGE_RESOLVED de carga y TURN_START de regeneración |
| Migración numérica `legacy-modular-shadow.ts` | Traducción determinista de efectos compatibles, comparación de equivalencia y modo global `MODULAR_FIRST` / `LEGACY_ONLY` |
| Habilidades aprobadas | `compileCombatSkill` interpreta un catálogo estricto; verifica coste, tipo, rango, cooldown, requisitos, vínculos y aprobación en el servidor |
| Estados temporales | `skillBonuses`, `summonStatuses`, `combatCharges` y efectos de objetos ya guardan estado por combate; **todavía no constituyen un motor único para todo tipo de efecto** |
| Interfaz | Historial de invocaciones/cargas y valores efectivos existentes. En esta fase se añade la vista de bonificaciones activas de habilidad e invocación con origen y vencimiento |

**Advertencia:** el motor de micromódulos ya existente **NO** significa que un jugador pueda enviar un grafo arbitrario con `CAST_SKILL`. `installEncounterMicroEffects` es un opt-in interno para pruebas y falta el contrato de aprobación/PCH antes de asociarlo a personajes.

## Etapa D1 — cerrar ciclo de estados y recursos (primera PR)

1. Pago de maná de las habilidades `OFFENSE`, `CONSTRUCTION` y `SUPPORT` **antes** de cualquier transición que active efectos `TURN_START` (igual que las categorías de fusión, invocación y cargas). El orden anterior permitía que la autorreparación gastara el saldo que aún faltaba cobrar de la habilidad y luego dejara maná negativo.
2. Seguir usando el estado transaccional `CombatState`, sin escribir en los HP/maná de la ficha global. Reintentos con el mismo `requestId` no duplican gastos.
3. Asociar a cada `skillBonus` temporal el nombre de la habilidad aprobada; campos opcionales para leer combates antiguos.
4. Mostrar al jugador en su panel de estadísticas y HUD sus estados temporales activos, el cambio efectivo en español, el origen y la ronda exacta en que caducan. Las entradas no ejecutables no se muestran como efectos activos.
5. Tests con habilidades sintéticas **aprobadas por el compilador real** y un objeto configurado con autorreparación: 5 maná con coste de 5 implica cero reparación al inicio de la siguiente ronda; 10 maná con coste 5 + reparación 5 deja exactamente cero.

## Etapa D2 — instalación autorizada de módulos de habilidad

1. Definir un esquema versionado de contenedores `Skill` que se pueda aprobar con `PCH`, duración, condiciones, rangos y objetivos **antes** de entrar a combate.
2. Cargar exclusivamente las habilidades **aprobadas y poseídas**, su revisión y su esquema validado desde servidor al crear el encuentro. No copiar instrucciones o fórmulas arbitrarias del cliente ni de una habilidad que fue robada/desactivada.
3. Aplicar una instantánea con propietario, `skillId`, tipo de evento, política de migración y duración. Validar y limitar módulos, contenedores, profundidad y acumuladores.
4. Activar primero equivalencias deterministas de `PASSIVE` y `TURN_START` con comparaciones contra el motor existente; para otras habilidades usar fallback. No crear beneficios de estado gratuitos.
5. Añadir pruebas de aislamiento de dos personajes, revisión de derechos, serialización, concurrencia y rollback del interruptor modular.

## Etapa D3 — intérpretes de impacto y objetivos

1. Enrutar `DAMAGE`, `HEAL`, `REPAIR_DURABILITY` y `MODIFIER` por resolutores oficiales. Impedir que un módulo escriba directamente HP, maná, durabilidad o cooldown sin pasar por costes y defensas.
2. Selección explícita de actor/objeto/área con validación de alcance, visibilidad, bloqueos, espejos, coberturas y reacciones.
3. Conservar daño multicanal, mitigación, resistencia, críticos, acumulaciones y efectos compuestos, con reglas claras sobre el orden de operaciones.
4. Definir origen, disparador, condición, apilamiento, duración, disipación y expiración; no convertir capacidades narrativas en efectos numéricos.
5. Simular combates de múltiples rondas y reintentos bajo carga; verificar invariantes de maná ≥ 0, HP dentro del máximo y durabilidad 0–100.

## Etapa D4 — editor y experiencia de usuario

- Edición visual tipada con ayuda en español y nombres de micromódulos para no desarrolladores.
- Vistas de **preparación → acción → reacción → resultado → estados activos** sin pantallas de botón que no hace nada.
- Vista de “No ejecutable todavía” con causa real (permisos, módulo, coste, objetivo, condición, recarga).
- PCH recalculado y validado ante cambios, sin que conectar un módulo reduzca gratuitamente el precio.
- Pruebas visuales en móvil de 320 y 390 px, escritorio y accesibilidad del modal.

## Criterios de salida

- La simulación de cada habilidad aprobada coincide con el plan autorizado y su coste PCH.
- Una acción o evento repetido **nunca** genera un segundo pago, curación, carga o golpe.
- Rondas, duraciones, consumo de maná y estados persisten después de serializar y cargar otra vez.
- Las habilidades sin resolutor quedan **deshabilitadas con explicación**, no se simulan silenciosamente.
- UI y motor comparten la misma fuente de estado; el jugador puede saber qué ocurrió sin interpretar el registro técnico.
- La PR solo se despliega a producción manualmente tras CI y confirmación.
