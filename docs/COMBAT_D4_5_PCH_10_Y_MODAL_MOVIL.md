# XAHYA — D4.5: descuentos para presupuestos de 10 PCH y revisión del modal móvil

Fecha: 10 de noviembre de 2026.
Base: `d5af9e4d4d3cd39925b1214d54cea1f6b4775e5d` (D4.4 en producción).

## Comprobación de economía

`lib/skills/pch.ts` define `PCH_PER_COIN = 10` y
`PCH_PER_UPGRADE_COIN = 5`. El uso de monedas acredita ese saldo al
personaje. Una habilidad no está limitada de forma permanente a 10 PCH:
el personaje puede acumular recursos de varias monedas. Cada solicitud
reserva del **saldo real**, y una mejora reserva solo el aumento positivo.

## Hallazgo D4.4

Con el descuento anterior, basado en redondear hacia abajo, una acción
de base 5 PCH limitada por HP bajo al 20 % quedaba en 5 PCH:
`floor(5 × 0.15) = 0`. Para el presupuesto de una sola moneda, eso hacía
invisible una restricción genuina que podía impedir la habilidad gran
parte del encuentro.

## Corrección versionada (V2)

Para nuevas solicitudes y nuevas aprobaciones, se redondea **el ahorro
agregado** hacia arriba, siempre limitado por los siguientes pisos/topes:

- Coste final de cada contenedor: **mínimo 1 PCH**.
- Descuento total entero: **no más de `floor(base × 0.30)` PCH**.
- Se redondea **una sola vez por contenedor**, después de ponderar
  acciones restrictivas contra las acciones con coste. No se puede
  duplicar `REQUIRE_CONTACT` o condiciones de vida para acumular rebajas.
- La interpretación V1 aprobada se preserva intacta. La revisión de
  administración estampa `restrictionPricing: V2`; no se revaloran
  habilidades anteriores en una consulta, lectura o combate.

| Base por efecto | Contacto obligatorio | Vida propia baja | Ambas restricciones |
| --- | --- | --- | --- |
| 1 PCH | 1 PCH | 1 PCH | 1 PCH |
| 5 PCH | 4 PCH | 4 PCH | 4 PCH |
| 10 PCH | 8 PCH | 8 PCH | 7 PCH |

Los precios corresponden a una **acción** verdaderamente limitada,
antes de costes globales de rango, maná, velocidad, duración y cooldown.
No representan el PCH final obligatorio de una habilidad completa ni
cambian su aprobación administrativa.

## UX y diseño móvil

- Cabecera de coste con texto multilínea, adaptable a pantallas pequeñas.
- Ficha muestra **saldo real**, **reserva** y si **faltan** PCH, con
  `role=status` y actualizaciones accesibles.
- Texto contextual: una moneda de creación aporta 10 PCH; se puede
  acumular; la reserva modular es provisional.
- En mejoras la cabecera considera el **incremento positivo**, no
  cobra visualmente de nuevo el PCH de la habilidad original.
- Modal y desglose limitan su altura al viewport dinámico y su anchura,
  evitan desbordamiento horizontal y permiten desplazamiento vertical.
- Campos del editor modular tienen `min-w-0`, `max-w-full` y
  envolturas responsivas.

## Validación y pendientes

`tests/combat-d4-5-low-budget-mobile.test.mjs` y ajustes de regresión
en `tests/combat-d4-4-micro-restriction-pricing.test.mjs` cubren
5/10 PCH, topes, piso, V1→V2, economía, presupuesto real y reglas
de presentación móvil.

Las clases responsivas y controles accesibles se comprueban mediante tests
de código, **no sustituyen una inspección visual real** en 320 px, 390 px
y escritorio con sesiones autentificadas. Esa validación de dispositivos
y el recorrido completo del combate siguen pendientes.

PR sin despliegue: mantener el control manual de Vercel y pasar las dos
suites de GitHub antes de fusionar.
