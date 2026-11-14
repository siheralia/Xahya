# V2.31 — PA y CON por ronda

Los ticks siguen siendo tiempo compartido. Los PA se cargan a la ronda
absoluta en que comienza una acción. Cada actor congela su límite de PA en
la primera declaración de esa ronda, usando `max(1, floor(9 + CON))`.

Un debilitamiento o bonificación de constitución durante la ronda no quita
PA ya gastados ni concede PA retroactivos; la siguiente ronda usa CON vigente.
Las acciones que cruzan tick 100 conservan íntegramente su duración y su
cobro en la ronda donde comenzaron.

El servidor guarda `apLimitsByRound`, incluido un tratamiento de compatibilidad
para rondas antiguas con gasto registrado. HUD/PvP leen ese presupuesto.
Los eventos autónomos no gastan PA de su dueño. No cambia V1 ni despliegues.
