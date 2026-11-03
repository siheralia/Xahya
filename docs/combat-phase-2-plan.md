# Combate de Xahya — fase 2: habilidades y recursos

## Línea base confirmada (batallas 1–3 y nueva fase 1 básica)
- El combate usa 100 ticks por turno y 9 + CON PA por personaje. Las reacciones cobran ticks y PA; a velocidades iguales se alternan las iniciativas.
- Un NPC puede actuar, defenderse y contraatacar. Un duelo suspendido conserva estado en `combatSession.lastAction.combatV1` y se reanuda al iniciar sesión.
- En el encuentro #3 ambos realizaron ataques: 9 cada uno, 5 turnos, desenlace en tick 454. El defensor pudo escoger Desviar. La precisión visual del ángulo requería una estimación cualitativa, y el tipo de ataque tenía que mostrarse en la reacción.
- La fase 1 también dispone de una **explosión mágica básica** con coste temporal normal, alcance 10 m, daño modesto y coste de maná 0 de forma provisional. El defensor predice el centro de un área circular a partir de una pista regional; el centro exacto se oculta hasta resolver el impacto. No sustituye habilidades configurables.
- La ficha, las habilidades, el inventario y los recursos todavía NO reciben daño/coste persistente desde este motor de prueba.

## Objetivo de la fase 2
Vincular **habilidades existentes y estadísticas efectivas** al motor de ticks sin introducir reglas paralelas: ataque, defensa, barrera y daño comparten un solo resolutor. El coste de maná, la duración y el cooldown deben aplicarse de forma transaccional y reconstruible después de desconectar.

## Secuencia de implementación

### Hito 2.1 — Contrato de habilidad utilizable (iniciado)
**Ya implementado:** la ficha y el combate pueden consultar las habilidades APPROVED del personaje con un proyector de solo lectura. La ruta `GET /api/combat/[id]/skills` autoriza por dueño del combatiente o rol de aprobación PvP, filtra las habilidades robadas temporalmente y marca las que no cumplen requisitos. Presenta coste de maná configurado, mantenimiento, acumulación, velocidad, duración, cooldown, alcance, tipo de ataque/defensa, tipos de efecto y acciones mecánicas registradas. No confunde PCH con maná y no permite ejecutar efectos todavía.

**Próximo incremento de 2.1:** compilar el grafo de condiciones → acciones de cada habilidad a órdenes de combate tipadas. Validar cada efecto antes de habilitar su botón; no interpretar automáticamente efectos narrativos como daño.

1. Consultar las habilidades aprobadas y los estados activos de cada personaje desde las tablas y catálogos existentes, sin asumir códigos antiguos de efecto.
2. Compilar el grafo de condiciones → acciones de cada habilidad a órdenes de combate tipadas. Solo permitir efectos que el resolutor soporte; rechazar el resto explícitamente (no simularlos como daño físico).
3. Indicar en la UI coste, objetivos, rango, duración, cooldown y velocidad configurada antes de ejecutarla.
4. Validar en servidor propiedad de la habilidad, aprobación, alcance y condiciones. Las elecciones de la UI no son autoritativas.

### Hito 2.2 — Maná y efectos temporales
1. Reservar y cobrar maná al ejecutar; rechazar recursos insuficientes.
2. Registrar efectos activos, barreras, buffs y debuffs en un estado de combate versionado. Reusar el motor de efectos centralizado y estadísticas dinámicas.
3. Aplicar cooldown al reloj de ticks/turnos sin descuentos extra de PA: el descuento PCH de construcción no equivale al coste de ejecución.
4. Mantener las reacciones defensivas y las prioridades de iniciativa. Desviar utiliza trayectoria/ángulo; una barrera utiliza la defensa mágica efectiva dinámica.

### Hito 2.3 — Resolver resultados y persistencia
1. Calcular daño, resistencias y desplazamiento con el mismo motor para ataques físicos y habilidades.
2. Persistir el estado de recursos del combate durante cada transición transaccional; al finalizar, liquidar HP/maná/integridad al personaje o inventario **solo tras definir las reglas de daño persistente**.
3. Asegurar que actualizaciones repetidas, refrescar la página y volver a iniciar sesión no aplican dos veces los costes.
4. Respetar autorizaciones en PvP y registrar quién ejecutó cada acción.

### Hito 2.4 — Pruebas de regresión
- Duelo 1vNPC y 1v1 con igualdad/desigualdad de velocidad; ataques físicos, mágicos y defensas intercaladas.
- Habilidad sin recursos; coste exacto; bloqueo por cooldown; aplicación/expiración del buff; colisiones con barrera; daño crítico; inmunidad por efecto.
- Desconexión y recarga a mitad de ataque pendiente, a mitad de duración y tras el cierre de combate.
- Balance de iniciativas en miles de duelos y auditoría del historial de ticks.

## PvP actual
- El selector de oponente está disponible para GM/administradores o roles con permiso de aprobación de combate. Al crear un PvP, ambas fichas tienen sus combatientes vinculados a la misma sesión.
- Cada dueño abre la **misma ruta** `/combat/<id>` con su propia cuenta y solo controla a su personaje. El panel de combate actualiza por consultas periódicas (~3,5 s), no por WebSockets. El botón «Compartir encuentro PvP» copia la URL.
- **No hay aún invitaciones, avisos de turno, emparejamiento automático ni sala de espera.** Se requiere un ensayo real con dos cuentas para cerrar la validación PvP, sin asumir que la existencia del motor equivale a cobertura end-to-end.

## Límites intencionales
- No se modifican los HP globales, maná persistente ni inventarios por los combates de prueba de la fase 1.
- No se introducen tipos de efecto ad hoc ni fórmulas duplicadas: se consultan los catálogos existentes.
- La fase 2 se implementa en incrementos revisables y probados, para preservar las batallas y fichas existentes.
