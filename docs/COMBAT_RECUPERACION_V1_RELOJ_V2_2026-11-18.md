# Xahya — Recuperación de combate V1 con reloj temporal V2

Fecha de auditoría: 18 de noviembre de 2026. Base auditada: main @ 615bb8f293037cc0d4a81e9dde92cbdcd949f92c (V2.31).

> Contrato del producto: conservar la interfaz, controles, animaciones y mecánicas V1; sustituir únicamente el gasto individual de ticks por una línea temporal absoluta compartida. No hacer una tercera interfaz.

## Estado de la comprobación

- Confirmado por lectura del código de main: componentes, rutas, reglas y pruebas que se citan abajo.
- Pendiente: contraste visual real con navegador en teléfono y ordenador; no se afirma haber hecho pruebas humanas.
- Verificado con consulta de solo lectura a la base de Xahya: encuentro V2 #90 (Sarya Athos, entrenamiento elfo, 18-11-2026, 12:51 hora central). Tres ataques con daño 0 por contact=false y defensa NONE. La trayectoria y tiradas históricas no están disponibles para discriminar entre los submotivos del fallo de contacto.
- Sin cambios de producción. Toda migración de la interfaz necesita PR y verificación visual antes de cambiar el selector.

## Inventario comparativo de interfaz

| Funcionalidad | V1 (código existente) | V2.31 (pantalla actual) | Diagnóstico |
|---|---|---|---|
| HUD fijo, plegable, con HP/maná/PA, acceso rápido a habilidades/inventario/stats y elección de origen | CombatCharacterHud.tsx desde CombatEncounter.tsx | tarjetas de datos estáticas, sin CombatCharacterHud | Regresión visual |
| Información extensa del rival y aviso compacto si sale de pantalla | Fighter, opponentCardRef, IntersectionObserver, aviso fixed | resumen simple en tarjeta | Regresión visual |
| Modales de estadísticas, habilidades, equipo, karma, construcción y opciones de ataque | CombatDialog y paneles de CombatEncounter | secciones lineales de V2 | Regresión visual |
| Lienzo superior del terreno, zoom y objetos/familiares | CombatTopDownPlane | mini planos locales de selección | Sustitución injustificada |
| Lienzo vertical de ataque y defensa; interacción por puntero | CombatVerticalActionPlane y trazos en CombatEncounter | planner de ataque independiente y selector de reacción | Sustitución injustificada |
| Animación de impacto y advertencias de daño entrante | flash y avisos persistentes en CombatEncounter | cronología textual sin transición homóloga | Regresión visual |
| Música y escalado de intensidad al bajar vida | CombatMusicPlayer, hasCriticalCombatHealth | no se monta CombatMusicPlayer | Regresión visual |
| Equipo, desgaste, recuperación y durabilidad explícita | CombatEquipmentStatus y panel de equipo | V2Items solo consumibles; equipamiento parcial en otras vistas | Brecha de interfaz |
| Selector de habilidades por categoría y preparación de áreas | CombatSkillLoadout y modales | lista de habilidades aprobadas dentro de CombatV2AttackPlanner | Equivalencia incompleta |
| Narración completa y registro con áreas/defensas reveladas | narrateCombat, crónica y registro detallado | últimos 15 resúmenes, sin detalles de resolución | Regresión explicativa |
| Controles en columnas y modales apropiados para móvil | tests/combat-hud-layout.test.mjs, combat-dual-planes.test.mjs | tarjetas apiladas y distintos lienzos | Paridad móvil por comprobar |

Importante: el inventario anterior describe funcionalidad observable en el código, no garantiza su corrección en producción. V1 tampoco debe modificarse de forma destructiva.

## Mecánicas comparadas: decisiones y pendientes

| Mecánica | Reutilización o implementación hallada | Clasificación |
|---|---|---|
| Ticks como calendario absoluto y acciones solapadas | action-timeline.ts, timeline-declarations.ts | Cambio temporal necesario (1) |
| Guardias y reacciones con ventana temporal | activeTimelineBlockAt, activeTimelineReactionAt, timeline-defense.ts | Cambio temporal necesario (1) |
| Impactos simultáneos y proyectiles en vuelo | timeline-batch-resolver.ts, timeline-projectile-flight.ts | Cambio temporal necesario (1) |
| PA por ronda y velocidad fijada al declarar | queueTimelineAction, timeline-tempo.ts, presupuesto CON | Cambio temporal necesario (1) |
| Fórmulas de golpe, bloqueo, resistencia y equipo | simulateBasicPhysicalTimelineHit ejecuta applyCombatCommand en shadow V1 | Conservación intencionada; probar paridad |
| Habilidades ofensivas/aprobadas, constructos, estados, familiares y consumibles | adaptadores timeline-offensive-skill, timeline-construction-world, timeline-summon-world, timeline-consumables y relacionados | Cobertura parcial: auditar caso por caso (2) |
| Dibujar desde el extremo previo | physicalAttackStart y comprobación en turn-engine.ts, copiada al planner V2 | Decisión de diseño no solicitada (4) |
| Cambiar la distribución V1 por CombatV2Encounter | page.tsx condicional | Regresión de producto (3) |
| Mostrar ticks disponibles y cobrarlos por acción | CombatCharacterHud y turn-engine V1 | Modelo antiguo a reemplazar solo en sesiones temporales (1) |

Categorías: (1) consecuencia necesaria del reloj; (2) mecánica de V1 pendiente de migrar; (3) regresión accidental/de producto; (4) decisión no solicitada. En (2) no basta con ocultar la función: hay que completar el contrato temporal correspondiente.

## Dónde se gastan realmente los ticks V1

- lib/combat/turn-engine.ts:944–947, spend: incrementa spentAp y aumenta spentTicks con tope 100.
- lib/combat/turn-engine.ts:911–931, advanceRoundIfComplete: finaliza ronda cuando ambos agotan ticks o PA y reinicia spentTicks y spentAp.
- lib/combat/turn-engine.ts:720–732, remainingAp, canStartComposite, hasInitiativeBudget: habilitación en función de spentTicks < 100.
- lib/combat/turn-engine.ts:790–815, canAct: compara el presupuesto local; SHARED era un ajuste de iniciativa en el motor legacy, no reemplaza al planificador V2.
- lib/combat/turn-engine.ts:694–703, turnTicks y compositeActionTicks: duraciones útiles como referencia, pero en V2 la acción ocupa [startsAtTick, endsAtTick] en vez de gastar un saldo.
- lib/combat/turn-engine.ts:2519–2524 y 2563–2568: valida y persiste el origen consecutivo de cada trazo físico.
- app/combat/[id]/CombatEncounter.tsx: V1 consulta spentTicks para permitir reacciones e iniciativa y mostrar los ticks del turno.
- app/combat/[id]/CombatCharacterHud.tsx:26–29, 56–57, 95–107: comunica explícitamente ticks restantes/gastados como recurso.

El planificador V2 ya registra eventos absolutos en action-timeline.ts:104–168 y conoce intervalos activos en 198–223. Mantener PA/maná/consumibles diferenciados del reloj; no volver a sustraer la duración de un saldo local de 100.

## Arquitectura mínima: una sola experiencia V1, dos transportes durante migración

1. Mantener CombatEncounter como composición visual canónica: HUD, modales, planos, animaciones, equipo, habilidades, música y crónica; extraer funciones de presentación solo donde sea indispensable. No clonar CombatEncounter.
2. Introducir un modelo de vista temporal tipado: estado público, viewerSide, reloj nowTick, eventos visibles (inicio/fin), PA de la ronda, canDeclare, proyectiles y mensajes. No serializar declaraciones privadas ni snapshots del adversario.
3. Separar adaptador de transporte/órdenes del render: para V1 continuar GET /api/combat/[id] y POST /actions; para V2 GET/POST /timeline, incluida su semántica de ETag, requestId, PvP y reintentos idempotentes.
4. Asociar las órdenes V1 a comandos del compilador temporal aprobado mediante mapeo explícito. Una orden no portada debe registrarse como brecha; no devolver éxito falso ni activar un botón inerte.
5. En el HUD V2 mostrar tick absoluto, ventana de acciones y PA realmente reservados según el clock. No representar 100-spentTicks como presupuesto.
6. Representar telegráficos y reacciones sin convertirlos artificialmente en state.pending de V1: la declaración PvP contraria debe seguir privada.
7. Conservar las reglas del motor V1 para sesiones V1; los adaptadores temporales siguen reutilizando la física y los resultados de V1 mediante shadows, sin debitar recursos dos veces.
8. Conservar page.tsx seleccionando el cliente experimental hasta superar tests y auditoría visual; entonces cambiar la rama V2 al render compartido, manteniendo el transporte temporal.

## Primer cambio implementado en esta rama (seguridad de alcance)

- Solo en V2: isolatePhysicalShadow descarta el ancla de trazo del atacante de la simulación física; la validación de contacto, alcance, arma, material y daño de V1 continúa aplicándose.
- Solo en el planner experimental todavía activo: la trayectoria comienza en el lugar del pointerdown, y su marcador inicial sigue ese punto. Se evita un fallo de captura de puntero en ciertos navegadores táctiles.
- El motor legacy turn-engine.ts, CombatEncounter.tsx y el selector page.tsx no se modifican; V1 conserva su política vigente hasta que se apruebe la experiencia temporal.
- Prueba nueva: tests/combat-v2-free-stroke-origin.test.mjs; compara rechazo de V1 y aceptación de dos trazos con comienzos independientes en V2.
- Los nuevos logs de golpes físicos V2 cambian «impactó» por «no alcanzó» cuando un RESOLVE tiene contact=false y damage=0; jamás alteran daño, contacto ni los logs V1. Se añade un test de narración de golpes fallados.
- Este cambio no representa la restauración visual. No autoriza fusionar ni publicar la pantalla experimental como solución terminada.

## Investigación obligatoria del daño cero

El registro CombatLog soporta contact, damage, defense, mitigatedByResistance, damageChannels y otros. CombatV2Encounter.tsx:254–263 solo imprime summary y tick, omitiendo muchos datos. La lectura de la tabla pública combatSession confirma en el encuentro #90 tres RESOLVE de Sarya con Mandoble de Acero Negro: ticks 17, 34 y 51; cada uno tiene damage=0, contact=false, defense=NONE, mitigatedByResistance=0 y summary incorrecto «Sarya Athos impactó … (0 HP)». Los dos golpes contundentes del elfo en ticks 34 y 68 sí tienen contact=true y causan 9 HP cada uno. El V2 clock conserva 8 eventos (incluye invocación en tick 68); las declaraciones históricas ya no están presentes.

**Conclusión comprobada**: los tres ceros NO proceden de bloqueo ni absorción por resistencia; el resolver descartó el contacto. Además hay una incoherencia verificable de narración, corregida para futuros golpes físicos V2 en esta rama. **Limitación**: no se guardó en el log público la trayectoria ni tiradas necesarias para saber si cada contact=false se debió a geometría, condición de alcance o tirada; no imputar causalidad más específica sin evidencia. Los registros históricos del #90 no se reescriben. La futura vista V1+reloj debe mostrar el campo contact explícitamente y no confiar únicamente en summary.

## Secuencia de PR y aceptación

| PR | Objetivo | Criterios de aceptación |
|---|---|---|
| R0 (esta rama) | Auditoría verificable, trazo libre V2, no tocar motor legacy | Tests de origen V1/V2; revisión de diff; sin despliegue |
| R1 | Adaptador de lectura V1/V2 y presentación compartida sin cambiar aún el selector | Tipos seguros, PvP privado, ETag/304, reintentos, estados pendiente/en curso, sin fuga de órdenes |
| R2 | Restauración efectiva de HUD, planos, modales, efectos y música | Mismo layout V1 en móvil/escritorio; sin scroll horizontal ni ventanas faltantes; capturas comparativas |
| R3 | Mapear todas las órdenes y herramientas V1 al scheduler | Matriz comando a comando, habilidades/aprobaciones, movimientos, equipamiento, invocaciones, creación, objetos |
| R4 | Resultados explicables y crónica V1 bajo tiempo absoluto | Motivos de 0 HP basados en datos de resolución; tick, defensa, absorción, desgaste y animación |
| R5 | Selector de sesiones V2 hacia la composición V1; retirada de interfaz alternativa | V1 intacta, V2 usa reloj y presentación V1, tests unit/integración/UI completos |
| R6 | Validación humana antes de producción | Dos personas móviles, dos golpes bajo guardia, esquiva, simultaneidad, reconexión, proyectiles, PA y velocidad; aprobación explícita |

## Puertas de calidad que siguen sin pasar

- Ejecutar npm test, TypeScript, lint y build (no ejecutados en esta auditoría remota).
- Validar visualmente 375 px móvil, escritorio y gestos táctiles reales; comprobar ausencia de scroll horizontal.
- Inventariar cada habilidad concreta de V1 que aún no puede lanzarse por la API temporal.
- Mantener una explicación estructurada de contact=false, defensa, resistencia y demás motivos en la vista recuperada; la consulta del #90 y la contradicción de la narración ya están documentadas. Queda pendiente explicar los submotivos exactos, que el historial no conserva.
- Confirmar preservación de privacidad PvP y costo de recursos en reintentos/reconexiones.
- No fusionar main ni activar despliegues automáticos por esta auditoría.

Fuentes revisadas: app/combat/[id]/*; lib/combat/turn-engine.ts, action-timeline.ts, combat-timeline-adapter.ts, timeline-declarations.ts, timeline-basic-strike.ts, timeline-batch-resolver.ts, timeline-defense.ts; /api/combat/[id]/route.ts y /timeline/route.ts; tests/combat-hud-layout.test.mjs, combat-physical-continuity.test.mjs, combat-timeline-basic-strike.test.mjs y combat-timeline-prehuman-readiness.test.mjs.
