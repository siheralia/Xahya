# Xahya — franjas rectangulares orientables (incremento de geometría de fase 2)

## Contrato

- Se añade **Franja rectangular** al selector de áreas. Su almacenamiento sigue la columna de texto `areaOfEffect` existente, con la forma canónica `Franja de 4 m de largo y 1 m de ancho`; el alcance se conserva aparte con `| Alcance máximo: N m`.
- Ambas dimensiones son positivas, de 0,1 a 10 m y hasta dos decimales. El ancho no puede superar el largo.
- El centro se elige en el lienzo local de **10 × 10 m** y el ángulo se elige **al lanzar** la habilidad, entre 0° y 359° (entero). 0° es horizontal y 90° vertical.
- La franja es una **zona rectangular centrada en el punto elegido**, no un rayo que sale de una posición 2D ficticia del usuario. El alcance máximo del lanzamiento se verifica independientemente con la separación longitudinal real de combatientes.
- Solo habilidades aprobadas y completamente compatibles se ejecutan. El servidor recompila largo, ancho, alcance, daño y maná desde la base de datos; únicamente acepta del cliente centro y dirección del disparo. Las descripciones antiguas o conos no son ejecutables por inferencia.

## Resolución y seguridad

- El resolutor usa una prueba geométrica de rectángulo girado (transformación inversa al sistema local del área). Los impactos sobre el rival y las construcciones se calculan desde **la misma huella espacial**, sin sustituir una franja por el círculo circunscrito.
- Física y magia conservan su fuente de daño y sus fórmulas existentes; no alteran PCH, daño aprobado, duración, PA ni ticks.
- La reacción tiene la misma pista regional (cuatro celdas) que los círculos. El centro y el ángulo reales se mantienen privados en ataques pendientes; el ángulo se muestra **solo tras resolver**.
- Esquivar exige predicción del centro y la tirada defensiva vigente, con coste real de PA/ticks; la acción no se resuelve como una esquiva gratuita. El defensor no puede desviar una franja con la guardia lineal.
- Los espejos dentro de la huella reflejan ataques mágicos o sufren daño físico según sus reglas actuales.
- Lanzamientos sin ángulo válido se rechazan antes de cobrar recursos. La idempotencia usa el ID de petición ya existente, también tras refrescos o reintentos.
- El NPC puede disparar franjas de habilidades públicas compatibles, con dirección aleatoria definida por la IA.

## Compatibilidad y limitaciones

- `CIRCLE`, `SELF_FIELD`, objetivo único, magia básica y ataques físicos por trayectoria mantienen sus reglas.
- Un rectángulo en el lienzo no crea un campo de batalla 2D persistente: el motor de fase 2 sigue teniendo dos personajes y una distancia longitudinal para alcance/movimiento.
- Todavía **no** hay conos, trazados de línea desde un origen 2D del lanzador, daño parcial por zonas, nuevos estados alterados ni un motor de múltiples combatientes.
- Tampoco se añade migración SQL; no se recalculan habilidades existentes ni PCH.

## Verificación

`tests/combat-rectangular-strips.test.mjs`: normalización, geometría 0/45/90°, acierto/fallo real, recursos, privacidad de área pendiente, reacción, espejo, rechazo de ángulos inválidos, reintentos y UI.

Mantener `npm test`, `npx tsc --noEmit`, `npm run build` y preview de Vercel como barreras antes de fusionar. Esta rama no debe fusionarse sin instrucción expresa de la usuaria.
