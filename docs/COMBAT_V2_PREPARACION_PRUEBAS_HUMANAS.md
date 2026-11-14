# Xahya — combate V2: preparación para pruebas con personas

Estado: **laboratorio opt-in**. No cambia el modo predeterminado ni
los rankings mientras no exista aprobación explícita de salida de beta.

## Qué se verifica con pruebas automáticas

- Reloj continuo absoluto: 100 ticks por ronda, costes de PA separados
  de los tiempos, guardias y reacciones activas por intervalos.
- Declaraciones de ambos participantes por separado, sin reemplazar la
  acción del otro por un NPC y sin revelar las órdenes aún privadas.
- Golpes simultáneos, doble KO, defensa y movimientos combinados sin
  duplicar ticks. Esquivas y barreras con comprobación espacial.
- Proyectiles que mantienen vuelo independiente, esquivas posteriores al
  lanzamiento, lanzamientos de armas, recogida y persistencia del desgaste.
- Invocaciones autónomas, comandos de conducta, construcciones, espejos,
  fusiones y campos de caos que giran el movimiento al pasar de ronda.
- Habilidades aprobadas: soporte, ofensivas, invocaciones, construcción,
  fusiones, potenciaciones que usan cargas; inversión de debilitamientos
  que alimenta los acumuladores oficiales.
- Pasivas **revisadas** de mitigación, almacenamiento de daño mitigado y
  regeneración por frontera de ronda. Otros grafos no se ejecutan
  arbitrariamente sin resolutor.
- Objetos e inventario: consumo y durabilidad de la copia concreta bajo
  la misma transacción que el lote temporal; reintentos terminales sin
  gastos duplicados.
- Dueños independientes y gestores espectadores, respuestas que ocultan
  órdenes, copias privadas de inventario y recetas internas del rival.
- Rondas de prueba automatizadas con secuencias repetidas, alternando el
  orden de declaración de los dos personajes sin cambiar iniciativa.
- Descargas incrementales con ETag/304, polling solo con pestaña visible
  y protección contra respuestas GET antiguas que sobrescriban una
  declaración POST ya confirmada.

## Condiciones para abrir la prueba humana

1. Todos los workflows de las PR de preparación deben estar en verde y
   las PR fusionadas en `main`.
2. Los despliegues automáticos continúan desactivados. Publicar un
   **despliegue manual solo con autorización** y verificar que el dominio
   de producción apunta al mismo commit validado.
3. Gestión crea un **combate V2 experimental NUEVO** entre dos usuarios
   diferentes, con personajes propios. Ni uno de los dos controla al otro;
   los administradores ajenos observan sin poder ordenar.
4. Probar en móvil y en dos sesiones simultáneas, con conexiones
   lentas/intermitentes. Verificar dibujos, advertencias de ataques,
   acciones y el estado de «esperando al otro jugador».
5. Simular dos ataques bajo una guardia continua, una esquiva y
   desplazamiento, una respuesta a proyectil en vuelo y dos golpes
   simultáneos. Comprobar el registro y los costes de PA, maná y ticks.
6. Verificar un consumo de poción, desgaste de arma, reintento con
   la misma clave, desconexión/reconexión y lectura de espectador.
7. Comprobar una habilidad de cada categoría compatible **que
   efectivamente posea el personaje**. Las habilidades excluidas por
   compatibilidad deben mostrar una explicación y no ejecutarse por
   una vía alternativa.
8. Revisar el final del encuentro: victoria/derrota/empate, crónica,
   armas pendientes de vuelo y ausencia de incremento automático de
   rankings experimentales.

## Criterios de no aprobación

- Se revela el objetivo secreto de un ataque antes de un compromiso
  visible legítimo.
- Una orden se cobra dos veces tras reintento o pérdida de respuesta.
- Una guardia activa deja de proteger un segundo golpe dentro de
  su intervalo sin causa física.
- El reloj avanza porque uno de los usuarios controla al otro.
- Un usuario observa/copía IDs o configuración interna de inventario ajeno.
- Un HP regenerado desaparece por sobreescritura en el mismo lote.
- Se ejecuta un micromódulo no aprobado o sin un resolutor V2 completo.

## Límites deliberados de esta etapa

**No equivalen a una prueba de dos personas reales**: GitHub Actions
simula las decisiones en memoria, pero no prueba el navegador real,
latencia móvil, dos conexiones Clerk, ni despliegue y acceso al
dominio de producción. Esos son precisamente los objetivos de la
próxima prueba humana, que requiere autorización para desplegar.

El laboratorio conserva HP y maná aislados en el encuentro. El inventario
real sí persiste sus consumos y desgaste. Los rankings públicos continúan
excluyendo resultados V2 mientras su fase experimental siga activa.
