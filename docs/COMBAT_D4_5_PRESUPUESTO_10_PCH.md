# XAHYA — D4.5: coste legible con monedas de 10 PCH y descuentos pequeños

Fecha: 10 de noviembre de 2026. Base: `d5af9e4d4d3cd39925b1214d54cea1f6b4775e5d` (D4.4 en producción).

## Inventario confirmado

La **moneda de creación** de habilidades entrega `PCH_PER_COIN = 10` al
saldo acumulable `pchBalance` del personaje mediante transacción.
La moneda de **mejora** entrega `PCH_PER_UPGRADE_COIN = 5` y un crédito
de mejora. Por tanto, **10 PCH no es el máximo de complejidad** de una
habilidad, sino el presupuesto concedido por una moneda. Pueden juntarse
varias y también gastarse saldos previamente acumulados.

La tarifa provisional modular es 5 PCH por paso de acción que genera un
efecto, antes de requisitos, alcance y otros ajustes. Leer valores,
conectar y calcular datos no cuesta otros 5 PCH por sí mismo. El
PCH final modular continúa bajo revisión administrativa.

## Hallazgo de D4.4

La restricción comprobada de vida baja concede 15 % de descuento, pero
el redondeo **hacia abajo** convertía 15 % de 5 PCH en **0 PCH**.
Para alguien que acaba de recibir 10 PCH de su primera moneda, este
detalle hacía que una limitación mecánica estricta no tuviera efecto visible.

## Versión V2 propuesta

- Las nuevas reservas y aprobaciones modulares utilizan descuento entero
  **redondeado al PCH más próximo**, limitado por el techo absoluto de
  30 % del costo base y piso de 1 PCH. No es un PCH adicional otorgado.
- Un paso de curación con base de 5 PCH y condición de vida propia baja
  pasa a 4 PCH (15 % redondea a 1). Con base de 10 PCH pasa a 8.
- Una habilidad de 10 PCH con dos restricciones verificadas puede llegar
  a 7 PCH, si ambas afectan las acciones pagadas.
- Las habilidades aprobadas con marcador `V1` siguen aplicando
  **exactamente** la fórmula de redondeo original; las aprobadas
  antes de D4.4, sin marcador, retienen íntegro el PCH revisado.
  En una revisión nueva, Administración recalcula el precio, usa `V2`
  y realiza la liquidación de la diferencia de PCH por la transacción
  oficial. No se reembolsa ni cobra nada sin una nueva aprobación.
- No se descuentan restricciones narrativas, vínculos decorativos,
  comprobaciones posteriores al efecto ni condiciones incompletas.

La regla sigue siendo **provisional**, no una escala definitiva
de balance de potencia/duración/alcance.

## Mejora visible para jugadores (móvil incluido)

El formulario de habilidades muestra siempre que dispone de saldo:
- PCH acumulados actualmente.
- Precio total y **cantidad adicional por pagar** en mejoras.
- Si alcanza o cuánto falta, expresado además en monedas de
  creación equivalentes, sin suponer que el personaje tenga esas monedas.
- Una explicación de que cada moneda concede 10 PCH acumulables.

Se permite que el botón de detalle y los importes se envuelvan en pantallas
estrechas; el modal reduce márgenes en móvil y el desglose tiene scroll en
ventanas bajas. Son correcciones por **revisión estática de código**;
la inspección gráfica real a 320/390 px y escritorio aún requiere navegador.

## Comprobación y reglas

`tests/combat-d4-5-ten-pch-budget.test.mjs` prueba el valor
compartido de la moneda, saldos inferiores y superiores, presupuesto
de mejoras, V1 frente a V2, descuentos sobre 5 y 10 PCH, techo
del 30 %, mínimo de 1 PCH, validaciones de servidor y marcadores
responsivos del formulario.

**No incluye:** cambios en inventarios, saldo de personajes, migraciones,
permisos, desplegar la rama o reactivar los despliegues automáticos.
