# Intercambio simultáneo ante un ataque (PR de combate)

El defensor puede seleccionar **Intercambiar golpes** mientras existe un
ataque pendiente. En vez de esquivar, bloquear o limitarse a recibir daño,
inicia un **ataque básico** contra quien lo está atacando. El intercambio se
resuelve en un solo paso del motor.

## Reglas

- El defensor **recibe el daño íntegro** del ataque entrante, calculado
  normalmente con su defensa pasiva, resistencias y geometría del impacto.
- Su contraataque consume **1 PA y los ticks normales del ataque**; si usa
  magia básica consume también **1 punto de maná**.
- El contraataque no requiere una segunda iniciativa ni concede una defensa
  extra al atacante durante ese mismo intercambio.
- Ambas acciones se consideran lanzadas **simultáneamente**: un golpe mortal
  no cancela el otro. Si ambos combatientes caen, el encuentro termina en
  **empate** (winner=null).
- Debe existir un ataque básico válido y al alcance de la posición actual.
  Se puede usar la mano o arma equipada, un proyectil con arma a distancia,
  o magia básica si el personaje dispone de maná y alcance.
- No combina desplazamiento, lanzamiento de habilidades avanzadas ni
  mecánicas de creación: son opciones para futuras iteraciones.
- Un rayo autónomo de espejo no puede responderse con un intercambio.
- El ataque automático usa un objetivo central predeterminado y el tipo de
  arma o magia del personaje. No se revela información oculta del ataque
  entrante para seleccionar la puntería.
- La IA de entrenamiento puede elegir este intercambio si las defensas
  gastarían la ventana temporal de su siguiente ataque. No recibe acciones gratis.

## Caso de regresión

En el encuentro histórico 60 el rival defendió decenas de hechizos y
nunca atacó. Con esta reacción, un rival en alcance puede golpear **mientras
recibe la magia**, con la pérdida de HP y el coste de PA/ticks registrados
por separado. Un usuario puede elegir la misma reacción en PvP.

La defensa `NONE` sigue disponible para quien prefiera recibir el impacto
sin gastar recursos ni lanzar un ataque.
