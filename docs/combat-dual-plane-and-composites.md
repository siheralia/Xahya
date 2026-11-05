# Doble plano de combate y movimientos compuestos

## Dos paneles de igual tamaño
- **Izquierda: plano horizontal**. Vista superior de un recorte de 10×10 m
  centrado en el personaje controlado; todos los participantes conocidos
  aparecen como marcadores en coordenadas del campo. El círculo de radio 1 m
  marca el alcance del desplazamiento dibujable. Las construcciones aparecen
  como cuadrados en sus posiciones de terreno.
- **Derecha: plano vertical**. Reutiliza el lienzo de dibujo del ataque,
  la predicción de impactos y el desvío de la guardia. Sus controles de arma,
  puño, patada y magia están arriba. Para una construcción muestra la altura
  de 0 a 10 m, independiente del punto del suelo.

## Semántica del movimiento
- El campo ahora tiene `fieldPosition?: {x,y}` en metros por combatiente.
  Las sesiones antiguas usan automáticamente `{x:positionMeters,y:0}`;
  `positionMeters` sigue siendo una proyección del eje X para la
  compatibilidad con knockback y mecánicas previas.
- **Mover solo:** dibujar hasta 1 m y pulsar **Solo mover**;
  gasta 1 PA y los ticks normales de desplazamiento.
- **Mover + atacar:** dibujar un vector en el plano izquierdo y atacar
  con un arma, puño, patada, proyectil o magia en el plano derecho. El
  servidor valida ambas partes en una transacción del mismo encuentro,
  mueve primero, verifica el alcance real en 2D y gasta **2 PA** y dos
  costes de ticks, sin intercalar una iniciativa del enemigo.
  Las habilidades ofensivas aprobadas conservan coste de maná y cooldown.
- **Mover + reaccionar:** durante una defensa pendiente, también se puede
  mover hasta 1 m y bloquear, desviar o esquivar. Cuesta **2 PA** y dos
  costes de ticks. Mover solo durante una reacción no está permitido. El
  desvío se dibuja con un ángulo en el plano vertical; el slider antiguo
  permanece para accesibilidad. La reacción mantiene el chequeo normal de
  éxito y no garantiza esquiva.
- En todas las acciones, no se permite desplazar más de 1 m ni actuar sin
  PA y ticks suficientes. Los cambios no se guardan si falla el ataque.

## Construcciones
- Se abre un panel de construcción **en línea**, no un modal que tape
  los lienzos. La posición horizontal se dibuja en el plano izquierdo,
  y la altura en el derecho. Se guardan por separado como
  `construction.fieldPosition` y `heightMeters` sin destruir el
  `center` del esquema vertical existente. El servidor comprueba
  que la posición esté dentro del alcance real de la habilidad.
- Por ahora la creación sigue siendo **una sola acción**; no se
  combina aún con movimiento. Los espejos conservan su física
  de rayo/impacto vertical existente.

## Compatibilidad y limitaciones explícitas
- Las mecánicas actuales de corte/perforación, círculos, conos,
  barridos, esquiva, construcción y cronología conservan sus
  verificaciones previas. La separación horizontal/vertical permite
  incorporar múltiples participantes en la vista, pero **el motor
  actual sigue resolviendo PLAYER vs NPC (un solo rival por encuentro)**.
  Habilitar verdaderas peleas con más de dos bandos, selección de
  múltiples objetivos, colisiones entre ellos, iniciativas y ataques
  de área multiblanco requiere otra fase de motor y persistencia.
- No se necesita migración SQL: el combate reside en JSON del
  encuentro. El mapa es una vista del campo, no un nuevo mundo global.
- No fusionar sin autorización explícita.
