# Hito 5 — Efectos modulares creados por jugadores dentro de habilidades

## Decisión de producto
El jugador construye el efecto en el **mismo formulario de creación de habilidad**, seleccionando «+ Crear efecto modular» dentro del editor de efectos. No debe abrir una solicitud de plantilla separada ni tener permisos de Gestión de efectos.

Al enviar la habilidad, se guarda una sola solicitud de habilidad en estado PENDING, con sus efectos tradicionales y compuestos en el arreglo JSON effect; el PCH se reserva mediante la transacción original sobre el pchBalance del personaje. La revisión de la habilidad incluye los efectos compuestos. El flujo existente de rechazos devuelve el PCH como antes.

## Contrato de un efecto compuesto
Tipo COMPOSED y campo module con id, name, type, description, trigger, steps, requirements opcionales y rama impactKind opcional; pricingNotes opcional del jugador.

Los campos de module son la representación validada por validateEffectContainers, no una cadena ejecutable. El servidor verifica que los IDs sean únicos por habilidad, limita a ocho efectos compuestos dentro de los veinte totales y rechaza parámetros malformados, IDs repetidos, campos extra y valores de precio de administrador en la petición del jugador.

La interfaz permite editar el cuerpo modular completo de cada efecto, incluidas condiciones y referencias, sin abandonar el formulario de habilidad. El autor puede adjuntar justificación para el revisor.

## PCH: reserva provisional ≠ precio definitivo
La investigación de la fórmula de PCH por micromódulo no ha concluido. **No se modifica la fórmula de PCH vigente**, ni se declara un precio definitivo de capacidad.

Para permitir el envío condicionado a saldo sin que un jugador pueda autovalorarse en 1 PCH, se reserva provisionalmente **5 PCH por micromódulo**. Esta es una cuota cautelar de presentación, no una fórmula de balance. Los efectos tradicionales mantienen sus precios normales.

La suma de reservas por efectos modulares entra en el mismo proceso de maná, velocidad, rango, cooldown y requisitos que el resto de los costos de la habilidad. El número de PCH inicial de la solicitud se calcula por el servidor, no por el JSON proporcionado por el cliente, y se cobra solo si el saldo lo cubre.

Al revisar, el administrador escribe el **PCH final base** de cada efecto modular. El sistema comprueba que cada efecto tenga un valor entero positivo, recalcula en el servidor el PCH completo de la habilidad y exige coincidencia exacta con el PCH mostrado por el formulario de Gestión de habilidades.

La aprobación realiza la liquidación de la diferencia contra la reserva dentro de la misma transacción de ajuste de pchBalance. Para las habilidades modulares, la operación **nunca puede dejar el saldo PCH negativo**. Si el personaje no tiene el PCH que falta, se devuelve un error y la habilidad queda pendiente; no se activa ni se rechaza automáticamente. Si el precio definitivo es inferior, el excedente se devuelve.

## Flujo de aprobación y ejecución
- El jugador crea la habilidad con efectos compuestos y suficientes PCH: **una solicitud pendiente** y una reserva.
- Gestión de habilidades muestra el constructor del efecto con un campo adicional «PCH definitivo asignado».
- La administración revisa toda la habilidad, añade el precio por efecto y aprueba: liquidación de diferencia o rechazo por saldo insuficiente.
- **Aprobación ≠ garantía de ejecución de un módulo sin adaptador**. El motor real sigue requiriendo un adaptador habilitado por servidor que pase por las reglas de ataque, defensa y recurso. Esto protege el combate de ejecución de lógica todavía no integrada.
- El cambio no modifica ni activa automáticamente los ejemplos de Gloria, habilidades existentes ni plantillas editoriales.

## Pendientes
- Reemplazar la reserva provisional por el precio formal de capacidad/sinergias PCH cuando la investigación termine.
- Incorporar referencias versionadas entre plantillas, ámbitos de almacenamiento y validaciones semánticas avanzadas antes de ejecutar habilidades recién aprobadas.
- Habilitar DAMAGE, CONSUME, áreas y ramas de impacto con los resolutores oficiales.
- Definir mejoras de habilidades que ya contengan módulos, con su nueva valoración.
