# Copias modulares de habilidades existentes — primera ruta funcional

Fecha del inventario: 4 noviembre 2026. Fuente: habilidades aprobadas (22), habilidades raciales activas (21) y plantillas genéricas habilitadas (20); total: **63** definiciones. El inventario de prueba está anonimizado en `tests/fixtures/legacy-modular-shadow-2026-11-04.json`.

## Duplicado independiente
La función `cloneLegacySkillAsMicro(row, source)` conserva el original en memoria y genera una **copia virtual, read-only y sin costo de PCH** que incluye una o más representaciones de micromódulos por efecto. No inserta una segunda habilidad en las fichas ni la habilita para adquisición, combate o aprobación.

Se puede inspeccionar desde Gestión de efectos → **Copias modulares y equivalencia**. Un endpoint protegido por permiso `management.skills.view` consulta los datos vigentes y devuelve las copias con su procedencia y cada parte marcada:
- **EXECUTABLE**: el valor mecánico está representado mediante un paso numérico de micromódulo, incluido en las rutas comparadas abajo.
- **DESCRIPTION_ONLY**: narrativa sin acción mecánica tipada; sin conversión falsa.
- **UNSUPPORTED**: aún no hay representación segura, por ejemplo robar habilidades con mecánicas de voluntad sin resolver.

`coverage=COMPLETE` significa que **todos los efectos tienen pasos representables**, NO que todas las funcionalidades de la habilidad estén conectadas al motor. Los metadatos como cooldown, coste, requisitos, áreas, familia y permisos siguen gobernados por las reglas existentes. Algunos sistemas (bonos de estadísticas raciales, efectos de objetos, requisitos y mecánicas avanzadas) necesitan adaptadores adicionales.

## Cambios funcionales del motor
- El compilador `compileCombatSkill` calcula su plan tradicional y el plan numérico de micromódulos. **Usa los números del módulo únicamente si la equivalencia completa se comprueba**, sin duplicar bonos ni daños. Conserva todas las validaciones de aprobación, alcances, cooldowns, recursos y tipos de ataque del sistema original.
- Daños físicos y mágicos, ignorar defensa, daño final, curación y bonos de estadísticas soportados se traducen a `MODIFIER`, `HEAL` y `BONUS`.
- **Espejo mágico:** la copia modular describe durabilidad, rayo y reflexión; una vez comprobada la equivalencia, el plan alimenta el motor existente de invocación, ataque y reflexión, sin alterar sus reglas de ataque.
- **Resistencias raciales** (`CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER`): usan valores del motor modular, conservando sus límites y orden de acumulación.
- **Laberinto**: evasión de trampas, probabilidad de objeto y bonos de dinero raciales se leen de módulos con la misma operación MAX del resolutor actual; invisibilidad de habilidad aprobada se consulta desde la copia modular cuando su conversión es completa. Si hay una parte incompatible, se usa la ruta heredada intacta.
- **Copia de habilidades**: el límite PCH, modalidad, fidelidad, duración, capacidad y permisos se convierten en siete módulos numéricos. Las búsquedas y solicitudes usan su configuración convertida, pero mantienen las comprobaciones de propiedad, aprobación, complejidad y persistencia del servicio original.
- Construcciones narrativas con capacidad `CREATE` tienen un marcador tipado de material y comparan con el resolutor de construcciones del motor. Las narrativas sin capacidad concreta siguen siendo descriptivas.

## No migrado / no activado
- Robar habilidades, efectos narrativos sin operación tipada, bonificaciones raciales generales fuera de los resolutores comprobados, reglas de efectos múltiples/temporales especializadas, y las nuevas ramas de impacto de Retribución divina.
- No se modificó ningún registro de producción ni se cobraron PCH. No se crean copias **en la base de datos**; se generan al consultar y pueden guardarse posteriormente solo mediante un flujo administrativo específico y verificado.
- El sistema no sustituye todavía todos los intérpretes antiguos. Un módulo no soportado no debe marcarse como funcional.

## Validación
- Pruebas de regresión sobre las **63 configuraciones activas** sanitizadas, sin datos identificativos de jugadores.
- Paridad de Alfa, Omega, Espejo mágico, Segunda oportunidad y Meia-lua; resistencias raciales, laberinto, rechazo de copia y narrativa sin resolutor.
- Compilación de Next.js, tests de combate y de PostgreSQL en CI antes de considerar cualquier despliegue.

## Siguiente etapa para la migración final
1. Añadir contratos de módulos para selección/autorización de copias y robo, narrativa mecánica y acciones de construcción.
2. Convertir y comparar modificadores de estadística base/derivada, condiciones, tiempo, estados y sinergias; evitar sumar/multiplicar en orden distinto al actual.
3. Añadir editor de vista dual original/copia y aprobación de migración por habilidad, con rollback de estado y costos.
4. Integrar eventos de daño compuesto y consumo de energía al motor real antes de habilitar Retribución divina.
