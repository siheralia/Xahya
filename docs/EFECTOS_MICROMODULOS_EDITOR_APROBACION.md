# Hito 4 — Constructor y revisión editorial de efectos modulares

## Acceso y arquitectura
- Desde **Gestión de efectos → Constructor de efectos modulares** se accede al editor visual, en /management/effects/modules.
- API exclusivamente administrativa: /api/management/effect-modules, protegida por permisos de rol management.effects:
  - GET exige view.
  - POST exige create.
  - PATCH SAVE/SUBMIT exige edit (+ view).
  - PATCH APPROVE exige approve (+ view).
  - PATCH REJECT exige reject (+ view).
- Los permisos approve/reject se añaden a la lista configurable de gestión de roles.
- Cada plantilla se guarda de forma independiente en la tabla **appSetting** ya existente, bajo skills.micro-effect-template.v1:{uuid}. No se introducen tablas nuevas ni migraciones.
- La lectura ignora filas malformadas y la escritura usa validación del motor actual. En modificaciones, una actualización de fila dentro de una transacción bloquea la plantilla, y expectedRevision evita pisar cambios concurrentes.

## Editor visual
- Nombre, tipo, descripción y disparador (DAMAGE_RESOLVED, TURN_START, IMPACT, PASSIVE).
- Ramas de impacto contra personaje o suelo.
- Requisitos y condiciones por operación (comparación EQ, NE, GT, GTE, LT y LTE).
- Constructor recursivo de expresiones con número, referencia (EVENT, STAT, CHARGES, STORED_TOTAL y OUTPUT) u operaciones matemáticas.
- Operaciones STORE, CONSUME, HEAL, DAMAGE, MODIFIER y BONUS; claves, elementos y objetivos solo cuando la operación los necesita.
- Orden de pasos configurable, con límites de complejidad igual al validador del motor.
- Presets de las habilidades de Gloria como ejemplos editables y **no guardados** hasta que el administrador los convierta explícitamente en borrador.

## Flujo de aprobación
- DRAFT → PENDING → APPROVED o REJECTED; los rechazados pueden editarse y presentarse de nuevo.
- Las plantillas en revisión no se modifican.
- Las aprobadas son inmutables: duplicar como un borrador nuevo para no cambiar los efectos ya revisados.
- El catálogo conserva creador, revisor, versión, fechas y registro de auditoría.

## PCH — decisión deliberadamente reversible
- El autor puede sugerir un PCH y adjuntar notas de valoración.
- El revisor tiene que introducir un PCH **positivo** antes de aprobar.
- Este valor es **manual y provisional**. Todavía no reemplaza la fórmula PCH de habilidades, no cobra puntos ni se ofrece como precio de adquisición.
- Mantener esta separación evita inventar una valoración por micromódulo mientras continúa la investigación de sinergias y costes de habilidad.

## Seguridad de integración
- Cada plantilla serializada incluye enabledForSkills:false, impuesto por el servidor al leer; el cliente nunca puede concederse permiso de activación.
- La ruta de acciones de combate no admite definiciones modulares enviadas por el jugador.
- El registro de plantillas no está enlazado todavía con la aprobación de habilidades, la compra PCH ni la instalación de efectos en los encuentros. La aprobación es editorial, no autorización de ejecución.
- Sin herramientas para ejecutar código escrito por el usuario: solo operaciones declarativas de lista blanca, con validación y límites.

## Pendientes para terminar el sistema completo
- Modelo de coste PCH de micromódulos basado en las nueve direcciones de investigación; integración económica transaccional y aprobación de una habilidad modular.
- Referencias entre plantillas y composición jerárquica por ID/versiones con detección de ciclos (por ahora se copian borradores, no se ejecutan subefectos anidados).
- Resolución de los efectos DAMAGE y CONSUME dentro del motor oficial antes de habilitar Retribución divina como ataque.
- Acceso del constructor desde fichas/gestión de habilidades y registro de efectos modulares como fuente de requisitos.
- Tests con una base de datos de prueba para validación de permisos y concurrencia real de esta API, además de las pruebas puras y del typecheck.
