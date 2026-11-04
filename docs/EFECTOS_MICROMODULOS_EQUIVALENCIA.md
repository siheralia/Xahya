# Segundo hito — adaptadores y paridad numérica de efectos existentes

## Estado
Implementado en la rama de la PR #129 como **proyección de solo lectura**, sin alteración de habilidades ni sesiones y sin habilitar el nuevo motor en producción. La fuente de verdad sigue siendo el compilador vigente de habilidades de combate y el resolutor racial.

## Qué traduce lib/skills/legacy-effect-adapter.ts

| Efecto antiguo | Micromódulo generado | Comparación |
| --- | --- | --- |
| DAMAGE_MULTIPLIER (ataque físico/mágico) | MODIFIER DAMAGE_MULTIPLIER (valor / 100) | compileCombatSkill |
| FINAL_DAMAGE_MULTIPLIER | MODIFIER FINAL_DAMAGE_MULTIPLIER (valor / 100) | compileCombatSkill |
| IGNORE_PHYS_DEF_MULTIPLIER / IGNORE_MAGIC_DEF_MULTIPLIER | MODIFIER DEFENSE_FACTOR (valor / 100) | compileCombatSkill |
| RESOURCE_BONUS (HP) | HEAL (valor absoluto) | compileCombatSkill |
| STAT_BONUS | BONUS estadística + cantidad | Proyección aritmética; NO paridad de ejecución general |
| STAT_MULTIPLIER | MODIFIER estadística (valor / 100) | Conversión aritmética; NO paridad de ejecución general |
| CONDITIONAL_DAMAGE_TAKEN_MULTIPLIER | MODIFIER DAMAGE_TAKEN:tipo (valor / 100) | racialDamageFactors y racialDamageFactor |

El núcleo de micromódulos se amplía con la acción **BONUS** distinta de **MODIFIER**. Así, un bono de +10 STR jamás puede confundirse con un factor ×10.

El adaptador produce un reporte de tipos omitidos, motivo y lista de campos adicionales conservados por fila; expone executionReady:false. Un tipo especial, narrativo, objetivo todavía incompatible o valor inválido **no se convierte silenciosamente**. La ejecución de una proyección parcial se rechaza.

## Casos guardados utilizados como regresión
- **Omega (habilidad 2):** ataque físico ×1, defensa física ×0,5 y daño final ×3.
- **Alfa (habilidad 3):** ataque mágico ×1, defensa mágica ×0,5 y daño final ×3.
- **Segunda oportunidad (habilidad 17):** recuperación nominal de 18 HP; sigue consumiéndose una vez por combate en su compilador actual.
- **Capoeira (habilidad 37):** multiplicador de esquiva ×1,5; comparación numérica exclusivamente.
- **Reequipamiento (habilidad 6, pendiente):** agilidad ×2, fuerza ×2, fuerza +10; comparación numérica exclusivamente, no concede aprobación.
- **Duramen antiguo (racial 17):** daños contundentes y perforantes ×0,5, fuego ×1,75. Contrasta también la combinación de tipo de ataque + elemento mediante el resolutor racial actual.
- **Espejo mágico (habilidad 1):** tres efectos especiales se marcan explícitamente como **no soportados** por el adaptador; permanecen en el motor vigente.

Los fixtures incluyen únicamente atributos de efectos y habilidades necesarios para las pruebas, tomados de las configuraciones existentes en noviembre de 2026.

## Alcances y garantías
1. **Ninguna habilidad migra automáticamente**, la API/DB no cambia, y el cálculo PCH original se mantiene sin modificaciones.
2. compareLegacyCombatNumbers usa compileCombatSkill como referencia: solo se acepta paridad cuando la habilidad supera la validación vigente, la proyección es completa y coinciden los factores, la curación nominal y los bonos de combate.
3. compareLegacyRacialDamageNumbers compara los factores con el resolutor de rasgos raciales vigente, incluidos límites y cruces de tipo de ataque/elemento.
4. La capa no modela todavía **duración, targeting, permisos, estados, procesos por turno, enfriamiento ni PCH**, que continúan en los mecanismos actuales. Los campos extra quedan visibles en el reporte para evitar pérdida de datos.
5. Las proyecciones se evalúan con HP sintético de gran capacidad para comparar potencia de curación, **no** la curación efectiva de una sesión real.

## Próximo hito
Integración transaccional e idempotente con el motor de combate y persistencia de estado por sesión, con resolución del daño por el motor oficial. Antes de ello deben existir contratos explícitos para referencia de habilidades, fases de daño, selección de objetivos, evento de daño mitigado, y reglas de cooldown/recursos. No resolver esos puntos de forma implícita durante la migración.
