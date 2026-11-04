# Combate — áreas circulares configurables (incremento inicial)

Estado: rama `feat/combat-configurable-circular-areas`, sin fusionar.

## Contrato de configuración
- La habilidad **aprobada** mantiene el campo `areaOfEffect` y el alcance serializado `| Alcance máximo: N m`.
- En habilidades ofensivas, `Área circular de 3 m`, `Círculo de 3 m`, `Radio 3 m` y `Radio: 3 m` indican un **radio**, no diámetro; admite decimales y un radio mayor que 0 y menor o igual a 10 m.
- El lienzo de objetivo 2D representa una proyección **local de 10 m × 10 m**, independiente de la separación longitudinal `positionMeters` entre combatientes, que sigue determinando el alcance del lanzamiento. `3 m` corresponde a `0,3` unidades normalizadas. La proyección se usa solo para contacto con el centro del rival y las construcciones; no supone movimiento libre en 2D.
- Los ataques directos históricos como `Objetivo único` continúan con su comportamiento anterior. Las áreas geométricas solicitadas en formatos incompatibles (conos, líneas, radios mal escritos) se rechazan como no ejecutables en vez de interpretarse arbitrariamente.

## Resolución
- El servidor compila el radio desde la habilidad autorizada; el cliente no puede enviar ni sustituir ese radio.
- El atacante elige el epicentro en el lienzo; el motor genera un ataque pendiente y resuelve el contacto geométrico: un defensor situado en `(0.5,0.5)` recibe impacto solo si se encuentra dentro del círculo.
- Se admiten círculos **físicos y mágicos** con sus estadísticas y defensas respectivas. Cada habilidad paga maná, PA y ticks normales, incluso si no alcanza al oponente. Se conservan cooldown, autorización, tiradas e idempotencia.
- La defensa ve únicamente la **región de cuatro casillas** que ya existía; nunca el centro exacto. Puede predecir el epicentro y efectuar su reacción de esquiva, pagando PA/ticks individualmente por cada ataque. El área física no se desvía mediante guardia lineal.
- Los espejos dentro del círculo mágico reflejan la magia como ya hacían; los que intercepta un círculo físico pierden durabilidad.
- Una vez resuelto el ataque, el registro muestra el radio y epicentro reales. La narración identifica el ataque circular.
- La IA del NPC puede lanzar habilidades públicas circulares compatibles y reacciona con la pista regional sin consultar el centro privado.

## Límites y siguientes incrementos
- El motor actual es de **dos combatientes**. Aunque el área se calcula geométricamente y puede tocar más de una construcción, no se afirma que ya existan aliados/enemigos adicionales en el combate.
- No se implementaron figuras lineales, conos, persistencia de zonas, desplazamiento 2D ni nuevo cálculo de PCH. Tampoco se modificó la explosión mágica básica.
- Antes de habilitar múltiples participantes, sustituir la proyección abstracta por posiciones de cada objetivo en un único espacio de combate; no deducir posiciones 2D a partir de la distancia longitudinal.
