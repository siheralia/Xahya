# Correcciones al constructor React Flow y las copias modulares

## Hallazgos del test visual en móvil (4 de noviembre de 2026)

1. El constructor ya estaba en \`/management/effects/modules\`, pero no había un enlace accesible desde el comparador.
2. La mayoría de las copias mostraban un nodo único \`MODIFIER\` o \`BONUS\` porque se clonaba el efecto entero como un solo paso, sin grafo de datos.
3. Las cinco configuraciones de Gloria eran presets de \`GLORIA_MICRO_PRESETS\` y no filas de \`Skill\` aprobadas, por lo que el listado de copias activas las ocultaba.
4. El diagrama usaba altura fija de 430 px y posiciones de cuadrícula que hacían los nodos demasiado pequeños en teléfonos.

## Cambios

- Acceso **Crear y conectar efectos en React Flow** desde el comparador.
- Sección de **Gloria** con los cinco presets, gráficos reales y acceso \`/management/effects/modules?preset=N\` para cargarlos como borrador editable, sin aprobar ni gastar PCH.
- Nuevo micro-paso \`CALCULATE(expression,output)\`. El intérprete lo evalúa, publica su salida y permite conectarla al siguiente paso.
- Validación del orden y existencia de productores \`OUTPUT\` para \`CALCULATE\`, \`STORE\`, \`HEAL\`, \`DAMAGE\`, \`BONUS\`, \`MODIFIER\` y \`VARIABLE_RESISTANCE\`.
- Efectos numéricos del catálogo histórico: \`CALCULATE(valor original) → CALCULATE(porcentaje/100) → MODIFIER\`, o \`CALCULATE(valor) → BONUS/HEAL\`. Son **conexiones ejecutables**; el resultado y su unidad se mantienen iguales al compilador anterior.
- Los ejemplos de Gloria usan fuente → cálculo → acción: mitigación → reserva, HP máximo → regeneración, Fuerza → daño físico, reserva → daño de Luz y Fuerza → radio del impacto.
- React Flow detecta viewport móvil y dispone los pasos verticalmente, con conexiones y handles utilizables; reduce la altura del lienzo con pocos módulos, mejora títulos y usa nodos ámbar para capacidades pendientes.
- Las reglas originales se resumen (categoría/duración/cooldown) y el JSON completo queda plegado.
- Un efecto \`NARRATIVE/CREATE\` **no** obtiene un bono \`CONSTRUCTION:LIGHT\` artificial: queda en \`DESCRIPTION_ONLY\` hasta que haya resolutor de construcción real. \`Resistencia no newtoniana\` conserva su propia ruta dinámica autorizada.

## Comportamiento de seguridad

Las copias siguen virtuales, no se insertan habilidades nuevas ni cambia el PCH de los personajes. El interruptor global de preferencia modular y fallback al motor clásico no altera aprobaciones, recursos ni los efectos narrativos pendientes. Esta mejora incrementa la granularidad de la representación y la conectividad de los módulos **existentes**; no finge haber completado mecánicas narrativas sin especificación.

## Verificaciones

- Paridad numérica de todos los efectos históricos con soporte.
- Prueba directa de \`CALCULATE\`, aritmética porcentual, referencias \`OUTPUT\` hacia consumidores, rechazo de conexiones adelantadas/duplicadas.
- Paridad de los cinco presets de Gloria: reserva, defensa, curación, golpe directo y golpe al suelo.
- Preservación del bloqueo de capacidades narrativas sin resolutor.
- UI/constructor verificables por rutas reales y pruebas de CI (TypeScript y producción).
