# V2.30 — tempo congelado en acciones declaradas

La línea temporal compartida usa ticks absolutos. La reserva ahora contiene
`reservedSpeedValue` (velocidad calculada por el servidor) además de inicio,
fin y duración. Los cambios de velocidad durante una acción no modifican su
fecha de fin; sí alteran el tiempo de futuras declaraciones.

Los resolutores de movimiento, ataque, guardia, reacción, magia, consumibles,
construcciones, invocaciones, fusiones, cargas y lanzamientos físicos validan
la duración respecto al tempo reservado y comprueban la integridad del intervalo.
Esto impide que una expiración de estado a t100 haga inválida una reserva a t95.

Las sesiones V2 antiguas sin `reservedSpeedValue` mantienen la validación
anterior (sin reinterpretación). El navegador no puede asignar el tempo
reservado en su orden, y PA/ticks continúan compilándose en servidor.

No cambia V1, rankings, despliegues o el modo predeterminado.
Pendientes separados: política de PA ante cambio de CON y desplazamientos
con posición interpolada durante toda su duración.
