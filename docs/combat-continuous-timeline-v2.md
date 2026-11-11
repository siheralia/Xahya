# Xahya — Cronología continua del combate (núcleo V2)

## Objetivo

Los **ticks son tiempo compartido**, no una moneda de gasto. Un ataque, movimiento, guardia o hechizo tiene `inicio`, `fin`, duración y un coste de PA independiente. El hecho de llegar al tick 100 **no corta ni teletransporta** la acción. Una acción de 60 ticks iniciada en el tick 95 termina en el **155**.

### Semántica

1. El reloj usa ticks absolutos `0,1,2,...`; la ronda visible se deriva de `Math.floor(tick/100)+1`.
2. Cada actor puede tener una intención pendiente. El servidor **no avanza** la acción larga del rival hasta recibir la intención de los demás actores activos (o una espera declarada). Esto es fundamental para que no ocurra el falso salto temporal del combate 81.
3. Cada intención reserva un intervalo `[startsAtTick,endsAtTick)`. La duración se conserva íntegra, aunque atraviese varias rondas.
4. Los PA se descuentan **una vez al comenzar la acción**, del presupuesto de la ronda del inicio. No hay créditos de PA por múltiples impactos dentro de la misma guardia.
5. Una guardia `BLOCK` protege todos los impactos físicos que realmente atraviesen su cobertura mientras su intervalo y equipo permanezcan válidos. El resolutor será responsable del ángulo, tipo, daño, desgaste y rotura **por impacto**. Este núcleo solamente indica cuándo existe la guardia y su copia de equipo.
6. Los acontecimientos con la misma marca de finalización salen **en un único lote simultáneo**. El futuro resolutor debe calcular ambos daños antes de decidir quién queda derrotado.
7. Si una guardia queda interrumpida, deja de cubrir desde ese tick. Sus PA ya pagados no se restituyen.
8. Las acciones ya resueltas permanecen en un historial acotado; los eventos pendientes no se eliminan.

## Implementado en esta etapa

`lib/combat/action-timeline.ts` contiene el planificador determinista, sin consultas a la base de datos y sin dependencias de Next.js. `tests/combat-continuous-timeline.test.mjs` comprueba doble impacto contra escudo, expiración, acciones que cruzan el tick 100, respuestas simultáneas, prohibición de saltar un evento sin respuesta, coste de PA e interrupción.

## Importante: separación y compatibilidad

**Este núcleo todavía no cambia la resolución de daño del combate real.** El actual `combatV1` y el despliegue de la PR #240 continúan en funcionamiento. No añadir a la API pública entradas arbitrarias a este planificador; el servidor deberá compilar y validar las intenciones, bloquear transaccionalmente la sesión y generar las tiradas aleatorias.

## Integración V2.2: compilador de intenciones y cruces de ronda

- `lib/combat/combat-timeline-adapter.ts` convierte las órdenes ya existentes (MOVE, ATTACK, DEFEND, CAST_SKILL, COMMAND_SUMMON, USE_ITEM, BOOST_KARMA y WAIT) a reservas con inicio/final y coste de PA. No acepta duración ni PA indicados por el cliente: usa la velocidad y el equipo del combatiente, y exige un plan de habilidad aprobado para CAST_SKILL.
- Los movimientos compuestos reservan una única ventana de tiempo —la mayor duración entre desplazamiento y ataque— pagando 2 PA.
- Un golpe físico con arma usa velocidad de tipo de ataque; patadas y magia conservan la velocidad neutral. La reserva no descuenta maná ni realiza cambios de HP, inventario o durabilidad.
- WAIT desde el tick 95 reserva **5 ticks** hasta la siguiente frontera, no 100 adicionales.
- `completeNextTimelineBatch` devuelve los cruces de tick 100, 200, 300, etc. incluso cuando una acción atraviesa varias rondas; no aplica regeneraciones prematuras ni repite turnos.
- Un escudo activo protege el impacto exacto del último tick de su guardia (simultaneidad de golpe y fin de bloqueo); a partir del tick siguiente expira. El intervalo de ocupación sigue siendo [inicio, fin).
- Cada orden sigue siendo una intención en el núcleo V2: su ejecución efectiva se realizará solo después de agregar/validar intenciones de todos los actores necesarios y resolver el lote simultáneamente.

### Qué NO se activa todavía

La API existente continúa resolviendo en `combatV1` con el cambio incremental de PR #240. Este adaptador no se conecta a los endpoints de partida para evitar resoluciones adelantadas o dobles descuentos en combates reales. La interfaz y la persistencia de encuentros V2 aún requieren resolver simultáneamente el lote y almacenar intenciones pendientes de ambos jugadores. **No presentar las reservas del adaptador como acciones que ya golpearon.**

## Próxima integración (fase V2.3)

- **Completado V2.2:** crear adaptador de comandos y costes temporales sin efectos secundarios.
- Mantener las declaraciones de ambos jugadores en el snapshot del encuentro. Una única petición no debe ejecutar una acción larga en el futuro.
- Al cerrar el siguiente lote, resolver en una transacción simultánea las colisiones, defensas activas, disparos, invocaciones, maná y desgaste. Requerir que el proyectil tenga tiempo de vuelo explícito cuando sea pertinente.
- Actualizar el HUD: reloj absoluto, secuencia de acciones anunciadas, intervalos de guardia, acciones en curso y estado «Esperando la intención del rival».
- Migrar **por encuentros nuevos únicamente** usando una versión opt-in, dejando las sesiones `combatV1` legibles y sin reinterpretar sus resultados.
- Construir simulaciones de combate 81, ataques dobles, escudos rotos, contraataques simultáneos, 50/100/150 ticks y múltiples invocaciones; probar invariantes de PA, HP, durabilidad, idempotencia y desconexiones.

### Criterio para activar V2 en producción

No activar el nuevo resolutor hasta que pase la suite actual de combates, las pruebas de carrera sobre PostgreSQL y las simulaciones temporales; el núcleo V2 por sí solo no hace que el combate real sea totalmente simultáneo.


## V2.3 — núcleo de aplicación simultánea (sin conexión a partidas aún)

`lib/combat/timeline-batch-resolver.ts` aplica, sobre una sola instantánea previa, resultados de daño, curación y desgaste autorizados para todos los eventos que terminan en el mismo tick. Exige exactamente un resultado por evento, rechaza copias de inventario inexistentes y evita que el primer golpe letal cancele otro golpe simultáneo. Si ambos caen, el resultado es empate. Los resultados se calculan sin mutar el estado original y el commit se devuelve como una única nueva instantánea.

**Límite de seguridad:** todavía NO está conectado a `app/api/combat/[id]/actions/route.ts`. No calcula ataques ni defensas: el ejecutor debe aplicar las reglas existentes, sus tiradas y las verificaciones de habilidades, además de producir parches transaccionales para movimientos, efectos, invocaciones, construcciones, mana y narración. No se debe publicar como combate V2 activo hasta que todas esas piezas tengan cobertura de pruebas e integración con el cliente.


## V2.4 — declaraciones en custodia y confirmación de lotes

`lib/combat/timeline-declarations.ts` agrega un coordinador puro para **guardar las órdenes de ambos participantes** hasta que el planificador determine qué acontecimiento concluye primero. Cada declaración reserva PA y ticks según las estadísticas del servidor, pero **no afecta HP, maná, inventario ni posición** al recibir la petición.

- Si un jugador declara antes que el rival, el reloj permanece donde estaba y la intención sigue en custodia. Una acción larga no adelanta su impacto cuando otro combatiente puede declarar.
- Identificadores repetidos con la misma orden devuelven el estado sin cobrar otra vez; identificadores repetidos con otra orden son rechazados incluso después de finalizar el evento.
- Cuando todos los actores necesarios tienen acción, se prepara un lote y se conserva la identidad de las declaraciones asociadas. El resolutor autorizado puede evaluar impactos sobre el mismo estado previo y confirmar **juntos** el nuevo estado de combate y el reloj en una transacción de base de datos.
- Las guardias pueden declararse como **GUARD** (con arma o escudo realmente equipado), antes de recibir el golpe; por eso pueden permanecer levantadas para varios impactos. Un KO interrumpe reservas sin reembolsar sus PA.
- `publicTimelineSessionStatus` publica solo tick, ronda, tiempos y tipos de acciones, sin revelar trayectorias ocultas, selección exacta de objetivos o órdenes internas.

**Pendiente de activación:** conectar el coordinador a la ruta de sesiones reales, resolver movimientos, habilidades autorizadas, invocaciones, consumo de recursos y reacciones con reglas completas, y adaptar los controles del cliente. No alterar ni reinterpretar combates finalizados. La semántica V2 aún no debe activarse para partidas reales hasta pasar pruebas transaccionales y de paridad de resolución.


## V2.5 — adaptador de contacto físico con fórmulas oficiales

`lib/combat/timeline-basic-strike.ts` permite simular un golpe físico básico ya autorizado y finalizado bajo reloj V2 reutilizando **las mismas fórmulas de contacto, resistencia, bloqueo y desgaste** del motor existente. La simulación se ejecuta en una copia temporal, descarta los PA/ticks del motor antiguo y devuelve solamente un resultado de daño y desgaste para aplicar en el lote del reloj nuevo. Las guardias anticipadas se consultan por intervalo, mano y copia de equipo.

Dos ataques simultáneos reciben exactamente la misma instantánea previa; ningún atacante cancela el ataque del otro por morir durante ese mismo lote. Las pruebas comprueban escudos, desgaste de la copia correcta, PA no duplicados, daño simultáneo y ausencia de mutaciones prematuras.

**Alcance estricto:** solo golpes físicos básicos sin movimiento compuesto ni efectos que necesiten parches adicionales. Ataques mágicos, habilidades, construcciones, invocaciones, estados y consumibles se rechazan explícitamente; no se omiten silenciosamente. Falta implementar los cambios de posición, buffs, recursos, roturas con modificación estadística y narración de cada evento para poder activar V2 en todos los combates nuevos.


## V2.6 — movimiento físico y crónica en lotes (integración pura)

- Un lote confirmado puede contener **desplazamientos horizontales**, pérdida de HP, desgaste, retroceso por impacto, continuidad de trayectoria del arma/puño y registros narrativos. Los resultados simultáneos se calculan desde la misma posición y los mismos HP previos, no desde mutaciones parciales.
- `lib/combat/timeline-basic-actions.ts` implementa la primera ejecución coordinada de **MOVE**, **WAIT**, **GUARD** y golpes físicos básicos. Los movimientos usan la geometría y las reglas de alcance del motor original en una copia temporal; sus resultados se trasladan al reloj absoluto al concluir el evento. Las guardias ocupan un intervalo y no se ejecuta una reacción extra por cada golpe.
- Un golpe que empuja a otro combatiente conserva también el cambio de posición; un movimiento o retroceso rompe la continuidad de trayectoria física. Una nueva acometida sin desplazarse comienza donde acabó el golpe anterior. No se trasladan los contadores de PA/ticks de la simulación V1.
- El historial de combate asienta los movimientos y resultados en el **tick absoluto de finalización**, conserva el historial narrativo y marca los cruces de fronteras de 100 ticks. Un doble KO conserva su empate y genera una narración final.
- La ejecución simple **rechaza expresamente** construcciones, invocaciones, estados, bonificaciones temporales, micromódulos, armas arrojadas y equipo derivado que necesita reajuste. Los cambios de estadísticas tras romper una pieza también se rechazan hasta contar con parches de estado completos. Eso evita presentar un daño parcialmente simulado como si fuera definitivo.

**Importante:** esta fase todavía es una biblioteca pura para pruebas y para una futura transacción de sesión, no una nueva ruta de combate activa. La siguiente fase debe ejecutar sin omisiones habilidades, recursos, estados, proyectiles, equipamiento y eventos periódicos, e integrar una actualización de API/HUD para nuevos encuentros. Los anteriores no requieren reescritura.


## V2.7 — magia básica, maná y soporte modular personal

La resolución V2 ya puede aplicar daño **mágico básico** (1 maná por ataque), con las mismas fórmulas existentes de tipo mágico, defensa, contacto y desgaste, y sin trasladar PA/ticks de la simulación del motor anterior. Dos lanzamientos que concluyen en el mismo tick consumen el maná de cada atacante y se evalúan contra la **misma** instantánea previa. Un escudo físico anticipado no se transforma en un campo mágico gratuito.

El commit atómico de un lote autoriza también gasto y restauración de maná, curación, bonificaciones temporales, estados propios y cooldowns; todos se validan antes de modificar el resultado. El maná restaurado **no puede pagar retroactivamente** un lanzamiento simultáneo que no tenía recursos suficientes. La declaración comprueba recursos y cooldowns sin descontar nada antes de que finalice la acción.

Se añade ejecución estricta de habilidades **COMPOSED SUPPORT personales, aprobadas y valoradas en PCH**. La declaración conserva la compilación **autorizada en el servidor**, no un gráfico proporcionado por el cliente. El resolutor ejecuta exclusivamente el grafo personal aprobado mediante `resolveApprovedSupportActivation` y aplica en un único lote sus curaciones, bonos y estados; rechaza objetivos externos, movimientos y mecánicas adicionales. No ejecuta, ni simula, habilidades ofensivas, invocaciones, construcciones, fusiones, cargas o consumibles como si fueran soportes.

Las bonificaciones y estados expiran durante los cruces del reloj compartido (tick 100, 200, …), **antes** de calcular cualquier impacto que termine en el tick de vencimiento. Este estado previo corregido se comparte entre todos los cálculos simultáneos. Se comprueban mediante pruebas de daño simultáneo, gasto de maná, cooldown, soporte modular y caducidad.

**Sigue pendiente el despliegue funcional de V2:** esta fase conserva la integración como biblioteca pura (no cambia la ruta de sesiones ni la UI). Hace falta resolver en V2 los efectos de área persistentes, invocaciones autónomas, reparaciones, armaduras derivadas, reacciones avanzadas, skills ofensivas, objetos y demás recursos, y adaptar API/HUD para partidas nuevas. No se modifican combates históricos.


## V2.8 — ofensivas aprobadas y reacciones declaradas con duración temporal

`lib/combat/timeline-offensive-skill.ts` ejecuta habilidades **OFFENSE** previamente aprobadas en un shadow desechable del motor existente. Conserva las fórmulas de daño físico/mágico, alcance y área configurada, daño de dos canales de contacto y estado hostil modular revisado. Cualquier debilitamiento se añade al lote V2 solo si el shadow confirma el contacto o HP real exigidos por el canal aprobado. El compromiso simultáneo conserva maná, cooldown, desgaste, retroceso, continuidad de trayectoria, estados temporales y crónica. No interpreta micromódulos arbitrarios remitidos por el navegador.

`PREPARE_REACTION` permite reservar antes de un impacto una postura de **DODGE, ENDURE, REPEL, DEFLECT o MAGIC_FIELD** durante `turnTicks` absolutos. La declaración cuesta un PA y permanece activa para impactos compatibles dentro de ese intervalo; no se cobra otro PA por cada defensa. El ángulo de desvío y la predicción de esquiva se validan al declarar. El golpe usa el cálculo actual de evasión, alineación angular, resistencias y desplazamientos. Una defensa incompatible (REPEL frente a magia, campo mágico frente a golpe físico, desvío de área) no se transforma en protección universal.

El campo mágico reserva su intervalo y paga **un maná en total**, en el primer impacto que cubre o al acabar la postura si no hubo ataques; el recibo de pago persiste entre lotes. Un KO no devuelve el PA reservado y no puede evitar el maná ya gastado al cubrir un hechizo. Los dos impactos que terminan en un mismo tick se resuelven contra el mismo estado inicial de ese tick.

**Restricciones expresas:** continúan pendientes movimiento compuesto + técnica, contraataque simultáneo, esquiva con desplazamiento, construcciones y espejos, invocaciones autónomas, consumibles y otras mutaciones de inventario, mantenimiento y autorreparación, cambios de estadísticas derivados de roturas y reglas de colisión entre acciones que modifican el mapa. No activar V2 en la API ni en la interfaz hasta tener estos casos resueltos y una transacción íntegra. Los combates pasados permanecen sin modificar.


## V2.9 — consumibles oficiales y recursos en el lote temporal

`lib/combat/timeline-consumables.ts` reutiliza la acción oficial de consumibles del motor V1 en una copia de cálculo y solo traslada a V2 el resultado de una acción completada: **una unidad** de inventario de encuentro, curación HP o restauración de maná y log narrativo en el tick absoluto. El coste de 1 PA ya quedó reservado en el planificador y no vuelve a cobrarse. El monto no viene del cliente sino de la receta compilada y autorizada por el servidor; solo se admite `HEAL_HP` o `RESTORE_MANA` con una receta única y un stock positivo.

La declaración valida identificador real de la copia del jugador, disponibilidad y recursos incompletos, **sin gastar la unidad**. Dos consumos simultáneos de los participantes se confirman en el mismo lote. Un recurso restaurado en el mismo tick no puede pagar retroactivamente una habilidad para la que faltaba maná. El resolutor rechaza copias inexistentes, débito doble y peticiones con cantidades manipuladas.

**Pendiente de producción:** la transacción del endpoint debe descontar también `characterItem.quantity` real al confirmar V2 y ofrecer el HUD de consumo temporal; no activar solo el estado JSON del encuentro. Otras acciones avanzadas de invocaciones, construcciones, autorreparación y contraataque permanecen para fases posteriores.


## V2.10 — invocaciones: materialización, órdenes seguras, mantenimiento y agenda propia

Las invocaciones de una habilidad `SUMMON` aprobada aparecen al **terminar** la acción en el reloj continuo. El simulador usa la formación en espiral, cálculos de enlaces de estadísticas, coste de maná y límite de 30 criaturas del motor original. El parche autorizado añade cada criatura solo una vez, con su propia `autoNextTick`, y no traslada PA/ticks del cálculo V1 al invocador.

El mantenimiento de cada invocación se resuelve únicamente cuando el reloj atraviesa una frontera absoluta de 100 ticks. Se conserva el orden de criatura para cobrar maná, caducidad, KO del dueño, insuficiencia de maná y radio de control, antes de los impactos que terminan en esa frontera. Cambiar el comportamiento, escoger objetivo o dar una orden de movimiento son acciones de un PA que finalizan en su tick. Las acciones `ATTACK` y `ACT`, que requieren contacto, se rechazan por ahora en este adaptador.

`scheduleAutonomousSummonTicks` calcula la agenda propia de una criatura siguiendo su velocidad y PA reales. Es una **agenda**, no impactos automáticos aún; el siguiente paso debe integrar cada uno en el resolutor de eventos simultáneos para evitar daños gratuitos, pérdida de reacciones y saltos de ticks. Las reglas con inversión de estados/cargas y campos de distorsión seguirán necesitando eventos específicos.

Esta implementación continúa aislada de la API de combates reales; los encuentros anteriores permanecen intactos.


## V2.11a — construcciones, barreras físicas y primer rayo de espejo

El commit V2 acepta construcciones de habilidades `CONSTRUCTION` revisadas, que aparecen al finalizar la acción, con posición de mapa y centro de puntería separados. La creación reutiliza la validación oficial de alcances, materiales, alturas y cilindros sólidos; dos bloques medidos no pueden crearse dentro de un combatiente ni solaparse simultáneamente. Los objetos solo ilustrativos siguen **sin bloquear movimientos ni proyectiles**.

Los golpes físicos, magia y habilidades ofensivas trascienden el obstáculo usando su geometría real: se proyecta a V2 el desgaste y el número de impactos de cada construcción. Dos ataques que terminan en el mismo tick acumulan desgaste sobre la **misma durabilidad anterior**, sin que el orden de evaluación altere el resultado. Si la durabilidad llega a cero, la barrera desaparece de ese lote. Los espejos existentes conservan la intercepción del **primer espejo real sobre la trayectoria** del rayo, no del icono de puntería.

Una creación de espejo genera su **primer rayo** mediante las reglas actuales y el coste de una habilidad aprobada. `scheduleMirrorRayTicks` planifica sus disparos autónomos de rondas posteriores en ticks absolutos 100/200/...; mientras el despachador autónomo no esté conectado al lote, el motor impide **saltarse** esos rayos al resolver una acción posterior.

**Queda para V2.11b / V2.10b:** despachar disparos recurrentes y acciones autónomas de familiares junto a los impactos y defensas simultáneas; aplicar efectos de área persistentes y destrucción de espejos por golpes directos a objetos. No habilitar todavía la ruta real de sesiones V2.
