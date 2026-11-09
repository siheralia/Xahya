# XAHYA — D3.1: cálculo por canales físico y mágico

Fecha: 9 de noviembre de 2026. Base: PR #220 fusionada,
`ef8df0b0d370ccdd3c8f700f606fdc01d4ff9b20`.

## Objetivo

Antes de introducir un ataque realmente mixto, separar el **cálculo
numérico** de la **geometría, la reacción y la intercepción** del combate.

El modelo previo `pending.usesMagic` expresa un solo canal y elige una
sola estadística atacante, defensa y reacción. Permitir dos
`DAMAGE_MULTIPLIER` arbitrarios directamente daría respuestas
incorrectas: un bloqueo físico podría sustituir al campo mágico, un
espejo podría reflejar toda la técnica o una resistencia se aplicaría
a un canal que no le corresponde.

D3.1 establece una base sin activar todavía esas combinaciones
incompletas. D3.2 deberá cerrar las políticas defensivas antes de
habilitarlas.

## Implementación funcional

`lib/combat/damage-channels.ts` contiene un resolutor determinista
`resolveDamageChannels`:

- Admite exactamente uno o dos canales **distintos** y explícitos,
  `PHYSICAL` y `MAGICAL`.
- Cada canal recibe su propia potencia, defensa, factor de ignorar
  defensa, tipo de enfrentamiento, factor racial, crítico, contacto,
  escala de reacción y multiplicador final, ya determinados por un
  resolutor confiable.
- Calcula independientemente daño, daño sin defensa estadística y
  mitigación estadística, redondea **cada canal** con las reglas
  históricas y luego suma sus resultados.
- Rechaza canales repetidos, valores no finitos, factores negativos y
  cálculos que excedan enteros seguros.
- No selecciona objetivos ni decide contacto, evasión, barreras,
  reflexión, costes, efectos de estado o iniciativa.

El motor real `lib/combat/turn-engine.ts` ahora utiliza esta función
para todo **ataque de habilidad aprobado de canal único**, tanto
físico como mágico. Se mantiene sin alteración la rama existente
de daño básico de fase 1 y su fórmula acotada.

Esto supone una integración real y verificable del cálculo por
canal; **no** habilita aún la ejecución de técnicas mixtas.

## Contrato de seguridad

Aunque el resolutor numérico acepte dos canales ya resueltos,
`compileCombatSkill` continúa rechazando una habilidad
`OFFENSIVE` que intente combinar `DAMAGE_MULTIPLIER` físico
con mágico, y el navegador no puede inventar una segunda defensa.
Los estados hostiles de D2.4 y D2.5 siguen dependiendo de una
resolución normal y de daño verdadero de HP.

`tests/combat-d3-1-damage-channels.test.mjs` contiene más de mil
comparaciones numéricas contra la fórmula anterior en ambos canales,
casos de daño mixto *solo a nivel matemático*, contacto independiente,
validaciones de datos inválidos y simulaciones de combate real
con habilidades físicas y mágicas aprobadas. Las suites completas
de GitHub verifican la ausencia de regresiones.

## D3.2 — requisito para un lanzamiento mixto real

Una siguiente fase deberá definir y probar, **antes** de aceptar el
grafo mixto, cómo se resuelven dentro de una sola acción:

1. Una sola trayectoria/hitbox y un único momento de impacto que
   no duplique PA, ticks, maná, cooldown ni crítico.
2. Reacciones físicamente coherentes por componente: esquiva,
   bloqueo de arma/escudo, campo mágico, construcción, resistir,
   contraataque y agotamiento defensivo.
3. Cobertura física y rayos/áreas mágicas sin atravesar sólidos ni
   convertir un espejo en interceptor universal.
4. Factores raciales de daño, resistencia física/mágica y
   mitigación propia por componente, visibles en el registro al
   terminar el ataque sin divulgar datos mientras esté pendiente.
5. Resultado agregado de daño y estados posteriores solo cuando
   el canal asociado haya causado contacto/daño real a HP.

Se priorizará una variante de **objetivo único**, con límites
explícitos y pruebas de cobertura y reflexión; no una solución
general para todas las geometrías y multiblancos.

No se crean ni se modifican habilidades reales, PCH, monedas,
inventarios, SQL o la configuración de Vercel en esta PR.
