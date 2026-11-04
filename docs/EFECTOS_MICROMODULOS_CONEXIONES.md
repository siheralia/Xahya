# Fuentes y conexiones de micromódulos — Resistencia variable

## Concepto

**La operación VARIABLE_RESISTANCE nunca pertenece a Sikatā.** Es genérica y usa la misma configuración validada por las cinco fórmulas existentes: PROGRESSIVE, LINEAR, DECREASING, THRESHOLD y HITS.

Los campos \`base\` e \`input\` de VARIABLE_RESISTANCE admiten expresiones numéricas, números, \`EVENT\`, \`STAT\`, \`STORED_TOTAL\`, \`CHARGES\`, o una conexión a una salida \`OUTPUT\` de un módulo anterior.

### Nuevas fuentes conectables

- \`READ_STAT(actor:USER|OPPONENT, stat, output)\`: lee un dato auténtico del combatiente elegido. USER es el propietario/defensor del efecto, OPPONENT es su adversario. No altera ninguna estadística.
- \`READ_STORED(accumulator, metric:TOTAL|COUNT, output)\`: lee del acumulador del propietario del efecto (valor almacenado o número de cargas). No consume ni transfiere cargas; sigue limitado por \`ownerId\`.
- \`CONSUME\` ya publicaba la suma de cargas consumidas en una salida. Puede seguir conectándose a otras operaciones.
- \`VARIABLE_RESISTANCE(config, base, input)\` consume los valores de los módulos anteriores mediante \`{source:"OUTPUT",key:"..." }\`.

Las conexiones son **locales al contenedor, explícitas y dirigidas hacia adelante**: OUTPUT debe nombrar una salida única de un módulo anterior. Reordenar o eliminar su productor invalida la conexión. El servidor valida referencias, nombres y fórmulas, y falla si falta un adversario o una estadística necesaria.

## Ejemplo Sikatā: origen correctamente identificado

1. \`READ_STAT USER magicDefense → resistanceBase\`.
2. \`READ_STAT OPPONENT ATTACK_SPEED → resistanceInput\`.
3. \`VARIABLE_RESISTANCE PROGRESSIVE(base=OUTPUT.resistanceBase, input=OUTPUT.resistanceInput)\`.

La defensa dinámica de la construcción sigue leyendo **la defensa mágica del defensor** y la **velocidad efectiva del atacante** del motor de combate; ambas fuentes son del servidor. La comprobación de propiedad, habilidad vinculada, reacción y materiales sigue en los resolutores oficiales. Los cambios de este PR no permiten que el cliente suplante los valores.

Configuración concreta conservada de Sikatā:
- Base: Defensa mágica del usuario.
- Variable: Velocidad efectiva del ataque del oponente.
- Fórmula: \`1 + 2v²/(v²+2500)\`, con \`maxMultiplier=3\` y \`threshold=50\`.

## Otras composiciones

Para cambiar a una resistencia dependiente de energía, sustituye la segunda fuente por:
- \`READ_STORED("DIVINE_GRACE",TOTAL,"resistanceInput")\`;
- \`VARIABLE_RESISTANCE(base=OUTPUT.resistanceBase,input=OUTPUT.resistanceInput)\`.

O usa el número de cargas con \`COUNT\`; otro módulo READ_STAT puede leer una estadística del usuario u oponente y conectarse al mismo destino. No hay una clase de habilidad o estadística prefijada, y las expresiones permiten combinar varias fuentes aritméticamente.

## Compatibilidad y activación

- Las definiciones antiguas sin \`base\`/\`input\` siguen leyendo \`ctx.stats[config.baseStat]\` y \`ctx.event[config.input]\`; sus resultados históricos permanecen iguales.
- Los nuevos módulos de lectura no producen intenciones de daño, escudo ni curación; únicamente ofrecen valores a los módulos siguientes.
- La interfaz administrativa permite añadir los tres módulos conectados automáticamente, o añadir cada módulo de lectura, almacenamiento y resistencia por separado.
- La instalación de módulos en combates sigue protegida por la lista blanca del motor. Solo la resistencia de construcciones ya vinculadas utiliza el grafo por el camino de ataque existente; una plantilla editable no ejecuta un efecto por aprobarse.
- No se modifican personajes, habilidades aprobadas ni saldo PCH por el presente cambio.

Pruebas: rol de origen, variación de resultados con fuentes distintas, lectura no destructiva de acumuladores, cambio de fórmula, errores sin oponente, nombres de salida duplicados y conexiones adelantadas, equivalencia de Sikatā y regresión del motor vigente.
