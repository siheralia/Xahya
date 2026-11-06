# Sobreflujo Lunar · hito de gasto de cargas

**Estado:** diseño ejecutable en `feat/lunar-overflow-charge-buffs`. Los cambios son genéricos: no se ejecuta código especial por comparar el nombre de la habilidad.

## Constructor de la habilidad

Una habilidad aprobada y activa con **un único contenedor** `COMPOSED`, disparador `ACTIVATE`, sin requisitos condicionales de efecto, compuesto por estos nodos y nada más:

1. **`CONSUME_COMBAT_CHARGES`**: `accumulator=LUNAR_CHARGES`, `minCharges=1`, `maxCharges=6`, `output=spentLunarCharges`, `manaCost=30`.
2. **`APPLY_CHARGE_BUFF`**: entrada `charges={source:"OUTPUT",key:"spentLunarCharges"}`, `stats=["STR","AGI","DODGE"]`, `perChargePercent=25`, `durationTurns=2`.

Los campos principales de la habilidad deben establecer **coste de maná = 30**, **mantenimiento = 0** y **duración = 2 turnos**. El editor ofrece un botón «🌙 Plantilla: Sobreflujo Lunar» que crea ambos pasos enlazados; para ejecutarla, la habilidad debe estar aprobada y pertenecer al personaje.

El bonus se calcula como **multiplicador = 1 + cargas gastadas × porcentaje por carga / 100**. No usa un incremento fijo de estadística, sino porcentaje sobre el valor efectivo que tenga el combatiente al momento de la aplicación.

| Cargas gastadas | Mejora a fuerza, agilidad y evasión |
| --- | --- |
| 1 | +25 % (×1,25) |
| 2 | +50 % (×1,50) |
| 3 | +75 % (×1,75) |
| 4 | +100 % (×2,00) |
| 5 | +125 % (×2,25) |
| 6 | +150 % (×2,50) |

La técnica consume **una sola acción con PA y ticks normales** del invocador y 30 maná por activación. No se conceden efectos a sus invocaciones ni ataques adicionales. Cada vez se debe elegir una cantidad entera dentro del rango autorizado y sin exceder el saldo disponible, a través del selector del combate. Los efectos se aplican durante dos turnos según el reloj de rondas existente y se eliminan sin devolver las cargas.

## Reserva propia, compartida y compatible

Los conejos que invierten debilitamientos (por ejemplo, Bnuuy Interior) acreditan un único `LUNAR_CHARGES` **al propietario** por inversión exitosa, con máximo seis en la reserva del combate. La reserva no se vincula a una criatura y **no desaparece al expirar el familiar**. Las cuentas anteriores, almacenadas en `summon.charges`, se migran como máximo una vez al saldo compartido en cuanto se use el almacén (con el tope de seis).

Los micromódulos `CONSUME_COMBAT_CHARGES` y `APPLY_CHARGE_BUFF` son reutilizables con otros almacenes, rangos, porcentajes, estadísticas y duraciones, siempre que el motor pueda interpretar cada destino con `resolveStatusStat` y los multiplicadores respeten los límites del sistema de estados.

## Seguridad y alcance

La combinación se valida al compilar la **habilidad aprobada del servidor**. Se rechazan pasos ajenos, fuentes de cargas inventadas, bonificaciones sin conexión directa al consumo real, estadísticas duplicadas/unsupported, costes de maná discordantes, cantidades decimales o inexistentes, falta de iniciativa, cooldown e insuficiencia de cargas. La ejecución utiliza el estado transaccional del encuentro y la idempotencia por requestId: reintentar la misma activación no puede cobrar otra vez. Las mejoras se integran a los estados temporales existentes, sin escribir permanentemente la ficha del personaje.

**Limitaciones:** los almacenes solo persisten en el encuentro, no entre combates. «Reino del Caos» permanece pendiente: necesita invocación fusionada y transformación direccional. La implementación del coste formal de PCH se estudiará en su propio hito; el depósito provisional del editor no es un cálculo definitivo de capacidad.
