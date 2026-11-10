# XAHYA — D3.4: estados por el canal que causó HP reales

Fecha de base: 9 de noviembre de 2026.
Producción de referencia: D3.3, commit `670293f8993c60a7213d80664b357ed8a167509e`.

## Objetivo

El golpe híbrido puede contener dos componentes (físico y mágico), pero
**el efecto posterior no debe activarse solo porque el daño total sea
positivo**. Una marca que necesita daño mágico no debe debilitar al
enemigo si el golpe físico lo hirió mientras su campo mágico anuló
el componente mágico. En D3.3 ya existe la cuenta confiable de HP
realmente perdidos por cada canal, incluido el daño letal.

## Nuevo contrato de autoría y ejecución

Se admite una única extensión de la técnica híbrida de D3.2:

1. Técnica `OFFENSIVE`, `APPROVED`, con `approvedAt`,
   `pchCost > 0` y maná de activación pagado una sola vez.
2. Dos efectos `DAMAGE_MULTIPLIER` distintos, físico y mágico,
   entre 25 % y 75 %, sumando exactamente 100 %.
3. Opcionalmente **un tercer efecto `COMPOSED` revisado por
   administración**. Ese módulo solo puede seleccionar al rival y
   aplicar **un debilitamiento estadístico** de 1 a 5 turnos
   mediante el intérprete ya aprobado de D2.4/D2.5.
4. Cuando está ese tercer efecto, se exige en mecánicas
   `hybridStatusChannel: "PHYSICAL" | "MAGICAL"`, y la duración de
   la habilidad coincide con los turnos del estado modular.
   Sin ese módulo está **prohibido** configurar un canal activador;
   el golpe sin estado sigue siendo instantáneo.
5. Solo contacto cuerpo a cuerpo contundente de 1–2 m,
   geometría medible y reacción única. No hay objetivo múltiple,
   área, magia libre, combinación de varios estados,
   daño elemental ni hechizos reflejables.

El editor compartido de Mecánicas muestra un grupo desplegable
llamado **Golpe imbuido: debilitamiento por daño de un canal** con
selector «Daño físico real / Daño mágico real». Es una configuración
explícita; el cliente no decide el canal durante el combate.
Familia de habilidad y campos vacíos de reglas del editor se aceptan
como metadatos inertes; las reglas avanzadas no vacías siguen
rechazadas. El precio final del COMPOSED debe tener su revisión
administrativa habitual; no se inventa un coste automático nuevo.

## Resolución autoritativa

La habilidad revisada se compila en el servidor a un `CombatSkillPlan`
que contiene el golpe híbrido y el único `approvedHostileStatus`.
Se reutiliza la validación estricta de D2.4/D2.5 para el grafo del
debilitamiento, manteniendo el chequeo de objetivo y duración.

**La validación del grafo** se hace sobre una representación virtual de
base de un canal; esta representación **no ejecuta un segundo ataque**
ni cambia el contrato geométrico del contacto real. El motor ejecuta
un único golpe físico imbuido, con dos defensas calculadas por canal,
cobertura y reacciones existentes.

Tras RESOLVE y desgaste de equipamiento, el motor lee exclusivamente
`hpDamageChannels`, calculado en el servidor por D3.3, y compara:

- Estado `PHYSICAL`: `hpDamageChannels.physical > 0`.
- Estado `MAGICAL`: `hpDamageChannels.magical > 0`.
- Si el canal correspondiente no quitó HP, **no hay debilitamiento**.
- Los golpes históricos de un solo canal conservan la condición anterior
  de contacto y pérdida real de HP.

La distribución de sobreletalidad también importa: si la víctima
solo tenía 1 HP y el desglose atribuye ese único HP al daño físico,
un estado que exige daño mágico no se aplica, aunque hubiera
potencia mágica nominal en el golpe.

La invocación del estado mantiene el mismo ID de solicitud, un solo
registro STATUS, el mismo cooldown y vencimiento, sin gasto extra.
Su narración indica el tipo de daño que lo activó.

## Privacidad y compatibilidad

- El cliente solo conoce antes de la reacción que **es un golpe
  híbrido**, no los coeficientes internos ni el estado de origen.
- `combatClientView` sigue eliminando tanto
  `pending.hybridContact` como `pending.hostileStatus`.
- El atacante puede leer en su vista de habilidad aprobada qué
  componente debe causar HP para activar el estado.
- Se respeta la desactivación individual y `LEGACY_ONLY`.
- No se modifica SQL, inventarios, fichas, PCH existentes,
  ranking PvP ni configuración de Vercel.

## Pruebas

`tests/combat-d3-4-hybrid-status-channel.test.mjs` cubre:
compilación y pago único, privacidad, idempotencia de reintentos,
daño real del canal correcto e incorrecto, bloqueo físico y campo
mágico, muro que absorbe todo, esquiva, sobreletalidad, duración
y vencimiento, grafo COMPOSED inválido, gastos mal revisados,
modo de retroceso, compatibilidad del golpe sin estado y
desactivación individual.

## D3.5 — siguiente paso propuesto

Expandir las condiciones posteriores al impacto más allá del
debilitamiento estadístico simple, **por familia de efecto y con
coste revisado**, empezando por efectos que requieren contacto
pero no necesariamente daño (sin hacer que eviten reacciones).
Agregar pruebas específicas para cada nueva semántica, sin
permitir todavía dos geometrías independientes por ataque.
