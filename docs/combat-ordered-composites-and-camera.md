# Órdenes de movimiento y cámara horizontal adaptable

## Controles compactos
En ambos planos los botones superiores tienen el mismo tamaño y usan iconos Lucide
con texto accesible, nombre en la ayuda contextual y estado seleccionado visible.

El plano horizontal ofrece tres órdenes explícitas:
- **Mover** (1 PA): trazo de hasta 1 m, sin atacar.
- **Mover → atacar** (2 PA): se camina antes de calcular alcance/impacto.
- **Atacar → mover** (2 PA): se calcula el alcance desde el punto original,
  se resuelve la reacción del rival y finalmente se mueve al atacante
  si permanece con vida. El movimiento se paga al lanzar el ataque; nunca
  hay un segundo gasto de PA durante la resolución.

La selección no evade requisitos de alcance ni de maná: si el rival sigue
fuera de alcance después de avanzar hasta 1 m, el ataque permanece
inhabilitado, pero **Mover** está disponible. Se indican la distancia y
el alcance real y se explica qué corregir. El disparo de magia básica
requiere también seleccionar su centro en el plano vertical.

El movimiento combinado consume **2 PA** (1 por cada componente), pero
ocupa **una única ventana temporal**: el mayor entre los ticks de moverse
y los de atacar. No se suman dos ventanas para una maniobra combinada.
Se sigue comprobando el presupuesto restante de 100 ticks, incluida la
penalización de velocidad del arma equipada. Puños, patadas y magia no
la heredan automáticamente. La interfaz informa por separado de PA
insuficientes y ticks insuficientes, con los valores reales.
Las reacciones siguen teniendo su desplazamiento independiente.

## Cámara dinámica para los dos combatientes
- El encuadre automático calcula la distancia real del par y añade 2 m
  de margen; el tamaño mínimo visible es 2,6 × 2,6 m.
- A corta distancia, 0,5 m ocupa muchos más píxeles que en el antiguo
  plano fijo de 10 × 10 m.
- La conversión del toque no presupone que el personaje propio esté justo
  en el centro de la pantalla. Se calcula desde sus coordenadas reales,
  independientemente de las del rival.
- Se puede acercar, restablecer el encuadre de ambos o alejar con iconos.
  El zoom manual favorece la posición propia para mejorar el trazo, incluso
  cuando el adversario está más lejos.
- La circunferencia de 1 m y el marcador de 0,5 m se escalan en metros,
  y la construcción convierte los puntos de cámara a las coordenadas del
  servidor sin alterar posiciones ni alcance.

## Compatibilidad
Las órdenes nuevas son opcionales y no requieren migración SQL. La
resolución sigue siendo de 1 contra 1; no se promete funcionalidad de
múltiples enemigos. La iniciativa, PA y ticks se cobran en el mismo
comando servidor/encuentro, sin admitir movimiento gratuito por dividir
la animación en dos fases.
