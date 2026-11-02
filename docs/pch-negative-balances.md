# PCH: saldo negativo y deuda de habilidades

Los PCH son el presupuesto de construcción de habilidades. Un saldo negativo representa **PCH pendientes de recuperar**, no un error ni un castigo automático.

## Reglas vigentes

- **Nueva habilidad personal:** se exige tener un saldo inicial de **al menos 1 PCH**. El coste completo se descuenta al enviarla a aprobación; si excede el saldo, queda una deuda negativa. La habilidad permanece **PENDING** hasta ser aprobada. No se exigen los PCH completos al solicitarla.
- **Otra creación:** con saldo **0 o negativo**, se necesita consumir suficientes monedas de creación para volver a un saldo positivo antes de iniciar una nueva habilidad. Cada moneda añade 10 PCH y, si había deuda, la amortiza primero.
- **Mejoras:** una moneda/crédito de mejora autoriza la solicitud, y el incremento de PCH puede producir un saldo negativo, incluso si el personaje ya tenía deuda. Una solicitud rechazada devuelve el incremento y el crédito de mejora.
- **Compra genérica:** se exige al menos 1 PCH a favor al comprar; la diferencia se convierte en deuda. Esto evita comprar infinitas genéricas sin consumir otra moneda. Una especialización sigue cobrando solo el incremento.
- **Revisión administrativa:** el administrador puede modificar el precio de una habilidad pendiente o aprobada. Si aumenta, la diferencia se descuenta incluso por debajo de cero; si reduce el precio o rechaza la habilidad, se devuelve la diferencia según el flujo existente.
- **Límites:** ninguna operación debe rebasar el rango entero con signo de PostgreSQL. Las transacciones deben bloquear/actualizar atómicamente el saldo para que dos solicitudes no reutilicen el mismo PCH positivo.

## Ejemplo

Sikatā cuesta 48 PCH y el personaje dispone de 10 PCH:

1. Se envía Sikatā para aprobación.
2. El saldo queda en **−38 PCH** (deuda).
3. Si el administrador sube el coste a 55 PCH, el saldo pasa a **−45 PCH**.
4. Una moneda de creación (+10 PCH) deja el saldo en **−35 PCH**.
5. La deuda debe amortizarse hasta saldo positivo para iniciar otra habilidad personal o comprar otra genérica.

Las estadísticas del personaje y el maná son independientes de la deuda de PCH.
