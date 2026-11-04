# Hito: las 16 definiciones narrativas convertidas a micromódulos tipados

**Base sincronizada:** rama `feat/legacy-skills-modular-shadows` integró `main` (`c99e5de2e51f8277763326d70dbb23e74c445776`) por commit de dos padres.

## Datos auditados en producción (solo lectura)

| Origen | ID | Nombre | Código de capacidad | Ejecución actual |
|---|---:|---|---|---|
| Genérica | 3 | Resistencia orgánica | CARD:W068 | Declarativo; enfermedad no tiene fórmula |
| Genérica | 4 | Vendaje rápido | CARD:W062 | Declarativo; detención de sangrado sin curación HP |
| Genérica | 7 | Esquiva disciplinada | CARD:W066 + STAT_BONUS DODGE | Esquiva narrativa; +1 tipado |
| Genérica | 8 | Lectura de rastros | CARD:W027 | Declarativo; necesita evidencia |
| Genérica | 9 | Coraza entrenada | CARD:W048 + STAT_BONUS PHYSICAL_DEFENSE | Resistencia ambiental narrativa; +1 tipado |
| Genérica | 11 | Revestimiento de maná | CARD:W045 + STAT_BONUS MAGIC_DEFENSE | Reactiva narrativa; +1 tipado, mantenimiento 5 maná/turno conserva condición |
| Genérica | 14 | Salto entrenado | CARD:W032 | Declarativo; falta distancia/altura numérica |
| Genérica | 17 | Detección mágica por contacto | CARD:W022 | Declarativo; requiere contacto |
| Genérica | 18 | Apoyo firme | CARD:W040 | Declarativo; falta resistencia a empuje cuantificada |
| Genérica | 19 | Reflejos entrenados | CARD:W066 | Declarativo; sin evasión gratuita |
| Genérica | 20 | Paso evasivo | CARD:W031 | Declarativo; sin teleportación ni distancia inventada |
| Racial | 15 | Escamas de los ancestros | NARRATIVE:OTHER | Declarativo; sin reducción automática del daño de corte |
| Racial | 16 | Oído de la piedra | NARRATIVE:OTHER | Declarativo; percepción de vibraciones |
| Racial | 18 | Salto del vendaval | NARRATIVE:OTHER | Declarativo; desplazamiento por viento, no implementado en tablero |
| Personaje | 7 | Espada de acero | CARD:W002 + CARD:W003 + NARRATIVE:OTHER | Tres pasos declarativos; daño ×2 condicionado a portar espada aún no resuelto |
| Personaje | 15 | Resistencia no newtoniana | CARD:W006 + VARIABLE_RESISTANCE | Fórmula dinámica incorporada al mismo resolutor de bloque defensivo de Sikatā |

### Contrato de la conversión

- **CAPABILITY** es un micromódulo formal con código, texto y parámetros heredados (objetivo, tipo de objetivo, referencia, elemento, duración en movimientos, condición de activación y valor descriptivo). Su ejecución entrega un *intent* de capacidad para adjudicación; deliberadamente **no cambia HP, ataque ni defensa** sin resolutor concreto.
- **VARIABLE_RESISTANCE** recibe exactamente la configuración `variableResistance` de la habilidad, requiere la estadística base y el valor de entrada de un ataque real, y produce resistencia y factor. El bloqueo de construcciones usa este resultado. Se conserva la comprobación vigente de aprendizaje y activación de habilidad principal de `attachedCreationPassive` y el coste del lanzamiento principal; no aplica al personaje ni a materiales sin vínculo.
- La pantalla de copias conserva también las reglas de la habilidad: categoría, condición, cooldown, duración, mantenimiento y mecánicas. La aprobación, requisitos de recursos y PCH siguen bajo los sistemas actuales.
- **No se introducen bonificaciones a partir del texto**: una espada con descripción «2× daño» no obtiene automáticamente ese valor hasta disponer de inventario/objeto creado, portar arma y alcance verificados en el motor; una descripción de venda no restaura PV.

### Interpretación honesta del estado

Los 16 casos **tienen representación modular**, pero ello no equivale a 16 resolutores nuevos listos para combate o laberinto. Las tres genéricas con `STAT_BONUS` conservan su representación numérica existente; la resistencia no newtoniana sí usa ahora cálculo modular real en bloque. Las demás necesitan parámetros cuantificables y eventos de juego para aplicar efectos automáticos: enfermedad, heridas, rastros, materialización/equipamiento de armas, movimiento, detección, estabilidad y vibraciones.

Se mantiene `coverage` como indicador de **cobertura mecánica**, diferente de `represented`: las capacidades puramente descriptivas no se convierten en poderes mecánicos sin especificación. No se añaden filas `skill`, `raceSkill` ni `genericSkillTemplate`, no hay PCH, no cambian las aprobaciones ni la habilidad original.

### Verificaciones

- Fixtures inertes para las 16 definiciones y conversión de códigos de capacidad.
- Las capacidades narrativas nunca generan daño, evasión ni curación gratuitos.
- Paridad de fórmula de resistencia progresiva a velocidades 0, 10, 25, 50, 100 y 1000, y rechazo de entradas inválidas.
- Paridad de las habilidades que ya se ejecutaban (Alfa, Omega, espejo, recuperación, resistencia racial, laberinto, copia, etc.) y CI con tests, typecheck, PostgreSQL y build.
