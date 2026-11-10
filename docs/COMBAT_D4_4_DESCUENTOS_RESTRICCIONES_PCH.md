# XAHYA — D4.4: descuentos por restricciones ejecutables

Fecha: 10 de noviembre de 2026. Base: `e1fd2fe42ca599fd645fe43b577f21ad378401c7`.

## Motivación

Los micromódulos no son todos beneficios: algunos exigen condiciones que
**impiden ejecutar** ciertas acciones. La reserva provisional anterior usaba
5 PCH por paso de efecto; los pasos de lectura, cálculo y `REQUIRE_CONTACT`
eran neutros. No existía una reducción positiva de precio por restricciones.

## Política inicial, intencionalmente conservadora

- **Contacto efectivo con el oponente, −20 % por acción protegida:** solamente
  si `SELECT_TARGET(OPPONENT)` precede a `REQUIRE_CONTACT`, ambos incondicionales,
  y la acción está **después** de la comprobación. El motor detiene la ejecución
  al no haber contacto. Un comprobador después de la acción no aporta descuento.
- **Vida propia baja, −15 % por acción protegida:** un requisito de contenedor o
  condición de paso `HP <= x % MAX_HP`, con `0 < x <= 25`. Se comprueba mediante
  las estadísticas reales, no una nota narrativa.
- **Ambas, máximo −30 % en esa acción.** Se pondera por las acciones cobradas del
  contenedor; los pasos no restringidos no disfrutan del descuento.
- Un contenedor siempre cuesta **al menos 1 PCH**. El descuento se redondea hacia
  abajo, no se acumula por duplicar comprobaciones, no se aplica a constantes o
  condiciones triviales ni a comprobadores de contacto que puedan omitirse.
- Los lectores, conectores y comprobadores puros **no aportan recargo**.
  Otras limitaciones (consumo de cargas, disparadores, distancias, tiempos) no
  se descuentan automáticamente hasta demostrar que reducen de verdad el
  beneficio en el resolutor y no pueden añadirse artificialmente.

**Ejemplo:** una curación con valor base de 100 PCH, ejecutable exclusivamente
por contacto físico con un oponente, obtiene una cotización de 80 PCH antes de
ajustes globales. Si además exige estar bajo 20 % de HP, queda en 70 PCH. Si la
restricción solo bloquea la mitad de las acciones cobradas, se prorratea.

## Compatibilidad y antifraude

Los efectos modulares aprobados **antes de D4.4** no cambian su `reviewedPch`
ni su PCH definitivo automáticamente. Cuando administración vuelve a aprobar,
el servidor les asigna `restrictionPricing: "V1"` y usa esa misma fórmula
verificada en la aprobación y en la persistencia. El jugador **no puede**
mandar este marcador ni el PCH revisado. También se calcula un descuento
provisional de reserva para las **nuevas solicitudes sin revisar**, siempre
sujetas a precio final.

En Gestión se muestra el precio **base revisado**, el descuento por contacto,
el descuento por vida baja, el total previo a los ajustes globales, y la
cotización al aprobar. Guardar sin aprobar conserva el PCH actual: no convierte
una previsualización en una transacción de recursos.

Las pruebas de regresión incluyen la ejecución real de `REQUIRE_CONTACT` y
requisitos de HP, topes, trampas de orden, guardias condicionales, redondeo,
precios antiguos y sello de aprobación en ambas rutas de Gestión.

## Límites de este cambio

Es una **primera política de descuentos**, no una tabla definitiva de balance
de todos los módulos. No modifica los resolutores de combate, ni acredita
PCH retroactivamente, ni despliega automáticamente. Validación visual móvil
y más criterios de restricción siguen pendientes.
