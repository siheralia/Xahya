# XAHYA — transferencia y pendientes de la fase D (10-11-2026)

**Repositorio:** https://github.com/siheralia/Xahya
**Producción:** https://xahya.vercel.app
**Rama principal:** `main`
**Base comprobada en producción:** PR #228 fusionada, `04969251f28838c21f349ea7c4e574fdcd35666c`
**Despliegue manual validado:** `dpl_GyczUaztmZSiw4ikeYUU3VM6hx6K`
**Trabajo siguiente preparado (sin fusionar):** PR #229, D3.6, rama
`feat/combat-d3-6-hybrid-minimum-hp-rider-20261110`.
Comprobar nuevamente la PR y el SHA de producción al abrir una
conversación futura: el repositorio puede cambiar entre turnos.

## Convención de entrega (obligatoria)

1. Antes de fusionar, leer el HEAD real de la PR, la base actual,
   conflictos y `Combat validation`/`Automated tests` para el mismo SHA.
2. Fusionar usando `expected_head_sha`; comprobar el SHA nuevo de `main`.
3. Crear **exactamente un despliegue manual de producción** con el
   SHA exacto. Nunca reactivar despliegues automáticos de Vercel:
   el usuario los desactivó para conservar presupuesto.
4. Comprobar `READY` y que `xahya.vercel.app` apunta a la misma
   implementación y SHA; una preview no equivale a producción.
5. La siguiente tarea va en otra rama/PR, con pruebas de
   combate, tests generales, TypeScript y compilación. No fusionar
   ni desplegar esa nueva PR sin autorización explícita.

## Estado real de la fase D

El contrato maestro está en
`docs/COMBAT_FASE_D_ESTADOS_Y_MICROMODULOS_2026-11-09.md`.
**D3.6 no equivale a terminar toda la fase D.**

### D1 — ciclo de estados y recursos: primeras entregas

Pago transaccional de maná y recursos, efectos temporales
con nombre de origen y vencimiento, reintentos idempotentes.
Revisar invariantes cada vez que se amplíe el motor.

### D2 — instalación autorizada de micromódulos: subconjuntos entregados

Hay interpretación revisada de pasivas, soportes, estados
hostiles por impacto, daño físico/mágico y herramientas de
fallback. No hay autorización para ejecutar cualquier grafo
creado en React Flow: mantener **fail-closed** en casos sin
resolutor, aprobación ni cotización PCH.

### D3 — intérpretes de impacto y objetivos: en progreso

- D3.1: resolutor separado de daño físico/mágico, con equivalencia.
- D3.2: primer golpe de contacto físico con magia adherida,
  costos/reacciones/colisión únicos y mitigación por canal.
- D3.3: HP real por canal, desgaste de equipo por tipo de daño,
  sobreletalidad y crónica.
- D3.4: debilitamiento COMPOSED que requiere daño HP del canal elegido.
- D3.5: marca COMPOSED por contacto real sin requerir HP,
  aún respetando esquivas, desvíos y obstáculos.
- D3.6: PR #229 abierta, mínimo opcional 1–20 HP por canal
  para activar un debilitamiento aprobado. Sin fusionar.

**Falta para cerrar D3 en sentido amplio:**

- Enrutar de forma genérica y segura familias revisadas de
  `DAMAGE`, `HEAL`, `REPAIR_DURABILITY`, `MODIFIER` y otros
  micromódulos a sus resolutores oficiales. Los componentes
  existen, pero no todo grafo se puede lanzar con costes/defensas.
- Más combinaciones de objetivo de actor, objeto y área con
  geometría y reacción correctas. La mezcla física/mágica
  ejecutable se limita principalmente al contacto único; no
  declarar completa la magia a distancia híbrida ni multiobjetivo.
- Estados alterados más generales: familias de veneno,
  quemadura, sangrado, acumulación, limpieza/disipación,
  inmunidades, apilamiento, duración y caducidad unificados
  bajo contratos probados; sin dar efectos numéricos gratuitos
  a capacidades solo narrativas.
- Pruebas exhaustivas de serialización y reconexión en mitad
  de una acción, mantenimiento, simultaneidad PvP, múltiples
  barreras, invocaciones autónomas, estados e idempotencia
  bajo múltiples solicitudes. Invariantes de HP, maná, ticks,
  PA y durabilidad deben verificarse continuamente.

### D4 — **siguiente gran bloque de trabajo**

**Editor de habilidades y experiencia completa del combate**:

1. Auditar el flujo usuario real en móvil (320 y 390 px)
   y escritorio: preparación → acción → reacción →
   resolución → estados activos y narración.
2. Editor modular visual con categorías claras,
   conexiones tipadas, mensajes amigables en español,
   ayuda contextual y traducción de llaves técnicas.
3. Mostrar por qué una habilidad está «No ejecutable»
   (falta aprobación, PCH, permiso, propietario, coste,
   objetivo/rango, condición, cooldown o resolutor),
   sin botones que parezcan interactivos y no hagan nada.
4. Precio PCH verificado en servidor al editar módulos,
   cambios de duración/alcance/cooldown y al aprobar,
   manteniendo revisión administrativa del coste real.
5. Estado de combate legible: bonificaciones, estados
   perjudiciales, origen, efecto numérico, acumulaciones,
   duración/vencimiento, daño físico/mágico y reacciones.
6. Pruebas de accesibilidad, modal, foco, tacto, zoom,
   contrastes y rutas de error. No usar una prueba de build
   como prueba de que la página es intuitiva.

## Criterios de salida del bloque D

- No hay costes duplicados por `requestId`, ni acciones
  automáticas que gastan recursos sin autorización.
- Todas las habilidades *ejecutables* pasan por los
  resolutores oficiales; las demás quedan deshabilitadas
  con explicación real y visible.
- Los efectos serializan y recuperan su duración y autoría
  sin efectos adicionales al reconectar.
- Maná no negativo, HP en rango, durabilidad válida
  y ausencia de daño físico/mágico que atraviese defensas.
- Los jugadores comprenden la diferencia entre ataques
  propios e invocaciones, reacción, PA/ticks, estados y
  razones de fallo en pantalla pequeña.
- Las pruebas de regresión, revisión manual de UI y
  publicación manual coinciden con el commit que se promete.

## No confundir con un bloque E ya aprobado

El roadmap histórico menciona, a más largo plazo,
combates con más de dos participantes, campo espacial
común, IA táctica avanzada, integración con terreno/
laberintos y PvP de mayor alcance. Ese trabajo **no**
está definido oficialmente como una fase «E» y no debe
darse por empezado o finalizado por consecuencia de D3.6.
Primero acordar el alcance tras cerrar D3 y D4.

## Mensaje operativo al comenzar el siguiente chat

> Continuemos XAHYA con la fase D. Comprueba primero
> PR #229 (D3.6), sus tests y el SHA real de `main`.
> Si está fusionable y ambas suites pasan, fusiónala con
> validación del HEAD y realiza exactamente un despliegue
> manual de producción; verifica `READY` y el SHA servido
> por `xahya.vercel.app`. No reactives despliegues
> automáticos. Después empieza D4, la siguiente gran
> sección: auditoría y mejora integral de la experiencia
> de combate y del editor modular, con español comprensible,
> razones reales de habilidades no ejecutables, estados,
> coste PCH correcto y pruebas visuales móviles.
> Implementa el primer incremento en nueva rama/PR,
> valida tests/build y déjala abierta. Usa como referencia
> `docs/COMBAT_FASE_D_ESTADOS_Y_MICROMODULOS_2026-11-09.md`
> y esta transferencia; no declares D completa mientras
> sigan pendientes los resolutores generales y sus pruebas.
