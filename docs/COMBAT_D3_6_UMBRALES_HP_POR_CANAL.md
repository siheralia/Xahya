# XAHYA — D3.6: umbral de HP real por canal para debilitamientos

Fecha: 10 de noviembre de 2026. Base: PR #228 fusionada en
`04969251f28838c21f349ea7c4e574fdcd35666c`.

## Objetivo y alcance

Las fases D3.4 y D3.5 permiten un debilitamiento revisado de golpe
físico-mágico, disparado por **HP real físico/mágico** o por
**contacto corporal verdadero**. D3.6 añade una condición tipada:
un efecto dependiente del daño solo se activa cuando **su canal**
ha retirado **un mínimo configurable de HP realmente perdidos**.

Ejemplo: un golpe que causa 20 HP físicos y 4 HP mágicos puede
activar un estado condicionado a al menos 3 HP mágicos, pero no
otro que exige 5 HP mágicos. No cuentan daño nominal, daño de otro
canal, barreras, sobreletalidad ni HP ya agotados.

## Contrato de aprobación

- Solo el golpe contundente de contacto de 1–2 metros habilitado
  en D3.2 con dos canales complementarios 25–75 % y suma 100 %.
- Se sigue exigiendo `OFFENSIVE`, `APPROVED`,
  `approvedAt`, `pchCost > 0`, maná pagado y exactamente un
  `COMPOSED` revisado, con selección del rival y un único
  `APPLY_STATUS` de debilitamiento.
- Para un efecto **por daño** (`trigger: ACTIVATE`), el campo
  `mechanics.hybridStatusChannel` identifica físico o mágico.
  Se puede configurar `hybridStatusMinimumHp` con entero de
  1 a 20. Si se omite, equivale a **1 HP**, garantizando compatibilidad
  absoluta con todas las habilidades D3.4 preexistentes.
- Para una marca **por contacto** (`IMPACT/CHARACTER`) está
  **prohibido** declarar `hybridStatusMinimumHp` o
  `hybridStatusChannel`: el estado depende de la colisión real,
  no de HP perdidos.
- Si no hay COMPOSED aprobado, está prohibido declarar umbral o
  canal. Números negativos, cero, decimales, texto, valores
  superiores a 20 o campos ajenos se rechazan en editor y
  compilador de servidor.
- El umbral **no** cambia el daño del golpe ni crea un coste
  nuevo o descuentos de PCH. La aprobación y precio de la
  habilidad completa siguen siendo responsabilidad de gestión.
  No modifica habilidades ya concedidas.

## Ejecución y privacidad

Tras resolver el ataque, el motor consulta el dato autorizado
`hpDamageChannels` de D3.3 (HP verdaderamente perdidos después
de reacción, mitigación, barreras y distribución de daño letal).

Para un debilitamiento mágico con mínimo 5:

`hpDamageChannels.magical >= 5`

No se acepta que los 5 HP procedan de daño físico. Si la víctima
solo tenía 2 HP, una técnica capaz de hacer 80 HP nominales no
puede activar un umbral de 5 HP. Las esquivas y barreras que
eliminan el impacto siguen impidiendo cualquier estado.

La verificación ocurre después del evento RESOLVE, antes de
añadir un único evento STATUS. El efecto aprobado permanece
oculto durante el ataque pendiente; la descripción previa de
la habilidad sí informa al propietario del umbral requerido.

Maná, PA, ticks y cooldown se cobran **una sola vez**.
La desactivación individual y `LEGACY_ONLY` mantienen sus
protecciones.

## Interfaz

En «Golpe imbuido: marca por contacto o daño real», bajo la
elección del canal, aparece un selector opcional con
1, 2, 3, 5, 10 o 20 HP. Desaparece como parámetro activo
si se deselecciona el canal. El catálogo de combate indica
cuántos HP reales debe quitar el componente elegido.

## Pruebas

`tests/combat-d3-6-hybrid-threshold.test.mjs` cubre
aprobación, gasto único, intento repetido, umbral bajo y alto,
dos canales aislados, defensa física, muro, esquiva, daño letal,
compatibilidad D3.4/D3.5, desactivación individual y datos
sin aprobación o con rangos inválidos. Las suites completas
verifican el compilador y la integración.

## Lo que esta PR NO resuelve

No habilita cadenas de estados arbitrarias, veneno o quemadura
por tick, efectos en áreas, rayos híbridos, múltiples objetivos,
disipación universal o sustitución del motor oficial de daño.

La fase D continúa con partes del **resolutor D3** generalizadas
y con el bloque mayor **D4 — editor y experiencia de combate**.
Ver `docs/COMBAT_FASE_D_ESTADOS_Y_MICROMODULOS_2026-11-09.md`.
