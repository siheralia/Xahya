# Xahya — conos y barridos en arco orientables (geometría angular de combate)

## Tipos de área en el editor

- `CONE`: **Cono orientable**, almacenado como `Cono de 3 m y apertura de 90°`.
  Radio de 0,1–10 m, hasta dos decimales; apertura entera de 1° a 359°. Al lanzar se marca
  el **vértice** sobre el lienzo local y se orienta la bisectriz de 0° a 359°.
  Es un sector circular, no un círculo entero: fuera del radio o del ángulo no hay contacto.
- `SWEEP`: **Barrido en arco**, almacenado como `Barrido en arco de 1 a 3 m y apertura de 90°`.
  Radio interior y exterior de 0,1–10 m (interior estrictamente menor), apertura entera
  de 1° a 359°. Al lanzar se marca el **centro** de un sector anular y se orienta su bisectriz.
  El hueco interior no impacta, aunque el punto de puntería caiga sobre el combatiente.
- Se conserva la misma columna `areaOfEffect`; el alcance de lanzamiento sigue guardándose
  por separado en `| Alcance máximo: N m`. No hay migración SQL, recalculo de PCH ni cambios
  a las fórmulas de daño, PA, ticks, maná o cooldown.
- Dimensiones se configuran **al crear o editar**; la dirección se elige **en cada lanzamiento**.
  0° apunta a la derecha del lienzo y 90° hacia abajo. Los cálculos de contacto y el SVG usan
  el mismo centro, dirección y apertura, incluso al cruzar 0°/359° o para arcos mayores de 180°.

## Modelo espacial y defensa

- El lienzo de puntería es una proyección normalizada local de 10 × 10 m orientada
  hacia el defensor. **No es un mapa 2D persistente**: los personajes conservan solo
  sus posiciones longitudinales para movimiento y alcance real. El vértice del cono
  es el punto explícitamente marcado, nunca una posición 2D inventada del lanzador.
- El motor verifica alcance por separado **antes de cobrar recursos**.
  El servidor compila los radios y apertura de la habilidad aprobada desde su registro:
  el cliente solo propone vértice/centro y ángulo. Ángulos ausentes, fraccionarios,
  fuera de 0–359 o añadidos a áreas no orientables se rechazan.
- La orientación y el punto exactos permanecen ocultos al defensor mientras exista
  una reacción pendiente. El aviso visible solo indica una región aproximada de cuatro celdas;
  después de la respuesta se revela el trazado real y la dirección en la crónica.
- Para esquivar el defensor predice el **vértice** del cono o **centro** del arco;
  se conserva el coste de PA/ticks y la tirada del motor. Ni conos ni arcos admiten
  desvío con guardia lineal. Campos, resistencias y escudos conservan las reglas existentes.
- Los espejos usan la misma huella angular, incluidos los ataques contra un espejo elegido.
  NPC con habilidad pública compatible eligen centro y orientación con su política vigente.
- `STRIP`, `CIRCLE`, `SELF_FIELD`, magia básica, trazos físicos y Meia-lua se preservan;
  **SWEEP no sustituye SELF_FIELD**: no crea por sí solo un barrido 2D centrado en el personaje.
  No se añaden daño parcial por subzonas, múltiples combatientes ni colisiones universales.

## Verificación

`tests/combat-angular-sectors.test.mjs` cubre serialización y legacy seguro, radios,
aberturas y ángulos, exactitud sectorial, hueco interior del anillo, SVG, aciertos/fallos
físicos y mágicos, mana/PA/ticks, alcance, privacidad, esquiva, rechazo de entradas inválidas,
idempotencia, espejos y cableado del editor, HUD e IA.

Antes de fusionar: `npm test`, pruebas automatizadas, build Next.js y preview.
**No fusionar sin autorización explícita de la usuaria.**
