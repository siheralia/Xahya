# Micromódulo de resistencia variable — procedencia de estadísticas

Cada configuración identifica de quién son los dos operandos. USER es quien posee la habilidad o construcción defensiva; OPPONENT es el contrincante, independientemente de PLAYER o NPC.

## Configuración de Sikatā

```json
{"baseOwner":"USER","baseStat":"magicDefense","inputOwner":"OPPONENT","input":"ATTACK_SPEED","formula":"PROGRESSIVE","maxMultiplier":3,"minMultiplier":0.2,"threshold":50,"coefficient":0.02}
```

La resistencia es la Defensa mágica del usuario multiplicada por una función de la velocidad efectiva de ataque del oponente. Si la defensa es 90 y la velocidad rival es 50, la resistencia resultante es 180. Cambiar la velocidad del usuario NO cambia el resultado.

## Contrato genérico

- `baseOwner`: USER u OPPONENT; selecciona al propietario de `baseStat`.
- `inputOwner`: USER u OPPONENT; selecciona al propietario de `input`.
- El motor recibe estadísticas de ambos actores y entradas etiquetadas por actor. Nunca sustituye silenciosamente un valor faltante con el del otro.
- Velocidad ATTACK_SPEED: `effectiveCombatSpeed` del actor seleccionado (unidades estadísticas de Xahya, no m/s).
- HP_PERCENT: HP del actor seleccionado. HIT_COUNT: para construcciones defensivas, impactos recibidos por la construcción del usuario; el contador rival no existe y se rechaza.
- INCOMING_DAMAGE: potencia del ataque del rival. Otros orígenes no se suponen.

## Compatibilidad de habilidades existentes

Las configuraciones anteriores que carecen de `baseOwner` se interpretan como USER. Las que carecen de `inputOwner` usan OPPONENT para ATTACK_SPEED e INCOMING_DAMAGE, y USER para HP_PERCENT e HIT_COUNT. La pasiva aprobada adjunta a una construcción se normaliza al entrar en el combate sin migrar ni alterar el registro original de la habilidad.

Los editores ahora tienen controles separados para ambos propietarios. La calculadora de ficha lee las estadísticas efectivas del usuario y pide simular manualmente la del rival cuando se selecciona OPPONENT. El PCH y las cinco fórmulas de respuesta permanecen iguales.
