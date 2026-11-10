# XAHYA — D3.5: distinguir contacto real y pérdida de HP

Fecha: 10 de noviembre de 2026. Base de producción:
`81c65488bd67c8f2567725e7096a8b929919b15b`, PR #226 fusionada.

## Nueva distinción

En D3.4 los debilitamientos de golpes híbridos solo se activaban
cuando uno de los canales —físico o mágico— quitaba HP reales.
D3.5 permite una segunda modalidad, **una marca por verdadero contacto
corporal**, que puede activar un estado aprobado aunque la defensa haya
mitigado todo el daño a HP. Esto **no** convierte un contacto fallido
en impacto: esquivas, desvíos que evitan la colisión y coberturas que
absorben el golpe no aplican el efecto.

La distinción se declara en el propio micromódulo COMPOSED:

- **Requiere daño real:** `trigger: "ACTIVATE"`, sin impacto
  especial, y `mechanics.hybridStatusChannel` = `PHYSICAL`
  o `MAGICAL` (sin cambios respecto a D3.4).
- **Requiere contacto real:** `trigger: "IMPACT"` e
  `impactKind: "CHARACTER"`, sin requisitos adicionales.
  `hybridStatusChannel` debe permanecer ausente: no se pretende
  que la condición de «tocar el cuerpo» equivale a quitar HP
  de uno de sus dos canales.

Ambos siguen exigiendo una habilidad `OFFENSIVE` aprobada
(`approvedAt`, `pchCost>0`), maná positivo, dos componentes
de daño que suman 100 %, un tercer COMPOSED autorizado con precio
revisado y exactamente una selección del rival más un
`APPLY_STATUS` que solo debilita una estadística.
La duración es de 1–5 turnos y debe concordar con el estado.

## Geometría y resolución

Se conserva **un solo ataque**, contundente, de contacto físico
de 1–2 m, con una reacción, un cobro de maná y PA,
un trayecto y una sola oportunidad de aplicar estado.

En el ataque híbrido, `RESOLVE` se produce **antes** del estado.
Las reglas dependen de datos provenientes del servidor:

| Situación | Estado por HP | Marca por contacto |
|---|---|---|
| El golpe toca al rival y su canal quita HP | Sí | Sí |
| Contacto real, pero ambas defensas reducen el daño a 0 HP | No | Sí |
| El rival esquiva y no hay contacto | No | No |
| Una pared sólida intercepta todo el golpe | No | No |
| Solo el otro canal quita HP | No | Sí |
| El golpe derrota al rival (0 HP restante) | Según el canal HP real | No se añade una marca persistente al derrotado |

El caso de muerte se trata de forma conservadora: la marca de contacto
no crea un estado innecesario sobre un personaje ya derrotado.

La modalidad se valida antes de la ejecución del intérprete. Para
una marca `IMPACT/CHARACTER`, su grafo COMPOSED se clona y se
normaliza **solo en el servidor** a la ejecución autorizada existente.
Esto permite reutilizar sin ampliar la estricta lista de
micromódulos de estado de D2.4/D2.5. No autoriza efectos extras,
segundos ataques, daño directo gratuito, rayos ni geometrías
magia/física independientes.

La intención pendiente y los parámetros del estado siguen
protegidos en `combatClientView`, sin revelarse hasta después
de la reacción. El log de estado dice si fue por contacto o por
daño del canal correspondiente.

## Interfaz

En el editor de mecánicas se explica qué disparador seleccionar
en el constructor modular:

- «Al activar», con canal físico o mágico, para requerir pérdida de HP.
- «Impacto», de tipo «Personaje», y ningún canal configurado,
  para contacto corporal independiente del daño.

El catálogo de combate explica a los jugadores la diferencia:
una marca puede adherirse tras tocar el cuerpo, pero no atravesar
un obstáculo ni una esquiva.

## Pruebas

`tests/combat-d3-5-contact-vs-hp-riders.test.mjs` comprueba:

- Composición, pago único, cooldown, reintentos y privacidad.
- Contacto con **0 daño de ambos canales** activa la marca.
- El mismo contacto con estado de D3.4 sigue sin activar el
  debilitamiento que requiere daño mágico real.
- Esquiva, barrera total y derrota impiden marca de contacto.
- Vencimiento normal de estados y un solo evento STATUS.
- Disparadores inválidos, GROUND, requisitos ocultos, un precio
  no revisado, selección ilegal de objetivo, dos estados,
  módulos adicionales, geometrías prohibidas y modo `LEGACY_ONLY`.
- El apagado individual se aplica a la técnica completa.

Las pruebas de D2.4/D2.5/D3.4 mantienen su semántica anterior.

## Continuación sugerida: D3.6

Extender el catálogo de consecuencias **de forma tipada y revisada**:
marcas de contacto, estados con duración variable o efectos por
tipo de armadura, sin habilitar todavía cadenas arbitrarias de
interacciones, ataques de área multicanal ni proyectiles híbridos
que eludan colisiones o espejos.
