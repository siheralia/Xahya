# Xahya — auditoría de combate y claridad de interfaz (fase C)
**Corte:** 8 de noviembre de 2026 · **Base:** PR #210 fusionada · **Alcance:** revisión del motor, interfaz de `/combat/[id]`, compatibilidad e inventario.

## Propósito y método

Se revisaron las rutas GET/POST del encuentro, la vista filtrada `combatClientView`, el motor `turn-engine`, los replays matemáticos de básicos/derivados/recursos, el desgaste por golpes, bloqueo con escudo y autorreparación. Se inspeccionaron los componentes de interfaz, sus botones, condiciones `disabled`, sus mensajes y el estado mostrado.

**Validación:** pruebas automáticas con combates sintéticos creados en memoria que emplean el **motor real** (incluido `applyCombatCommand`) y pruebas de contrato de los componentes React mediante código fuente. Se ejecutan junto con CI (pruebas Node, TypeScript, compilación). **Esto no equivale a una prueba visual manual** de todos los navegadores/tamaños de pantalla ni a introducir equipo en personajes reales.

Ningún test escribe en `Character`, `CharacterResource`, `CharacterItem` ni en combates existentes. La rama no modifica esquemas de base de datos.

## Matriz: qué permite la página y cómo lo explica

| Elección visible | Requisitos / comportamiento efectivo | Explicación comprobada o mejorada |
| --- | --- | --- |
| Solo mover | Iniciativa, PA/ticks y desplazamiento dibujado válido; motor comprueba distancia y obstáculos | Acceso junto al plano vertical y advertencia si falta el trazo |
| Mover y atacar / Atacar y mover | Dos PA, ticks disponibles, ataque preparado, distancia/alcance válido antes o después según orden | Se informan alcance actual y posterior, falta de PA, trazo y opciones de ataque |
| Solo atacar | Iniciativa, alcance, tipo/arma/magia y objetivo válidos | Botón desactivado con pistas en el mismo panel; resultado de la acción vuelve a mostrarse arriba |
| Terminar turno | `WAIT` agota los PA/ticks restantes de ese turno | Etiqueta consistente con el motor; se registra quién terminó |
| Reaccionar / Bloquear | Ataque pendiente, presupuesto de reacción y arma/escudo elegible | Escudo roto no se utiliza; panel de equipo muestra su durabilidad, desgaste y motivo |
| Esquivar y predecir magia | Se dibuja impacto probable, no zona segura; defensa del motor resuelve | Pista de 2×2 casillas, advertencia y área real oculta hasta resolverse |
| Habilidades aprobadas | Solo selección autorizada, coste real, cooldown, objetivo y maná; las no ejecutables explican por qué | Selector independiente, mensajes de maná, condiciones y objetivo; ahora las acciones básicas también confirman resultado |
| Crear objetos | Solo si existe una habilidad de construcción autorizada y un lugar/altura válidos | Plano horizontal + vertical, dimensiones y acceso a habilidades compatibles |
| Inventario y equipamiento | Equipo del combate es una instantánea; el inventario de ficha puede cambiar por separado | **Corregido:** primero estado vivo, durabilidad por copia y coste/calendario de reparación; inventario de ficha relegado a referencia |
| Equipo roto | No se usa como escudo; solo se desactivan los bonos compatibles con el replay validado del encuentro | **Corregido:** indicador en HUD contraído/expandido, aviso junto a acciones y acceso a detalle |
| Desgaste/reparación | Daño de HP solo si se activó la regla; bloqueo desgasta escudos; reparaciones solo al inicio de rondas elegibles y pagando maná | **Corregido:** mostrar canal, porcentaje, próxima ronda, coste, maná insuficiente y eventos recientes |
| Capacidad de HP/maná | La rotura puede reducir máximos; al repararlos, nunca rellenar gratis | **Corregido:** registro muestra máximos y reservas antes y después, con nombres en español |
| Historial/resultado | Eventos persistidos, crónica al finalizar | **Corregido:** último resultado de MOVE/WAIT/ATTACK/DEFEND/COMMAND_SUMMON se confirma cerca del control, no solo abajo |

## Problemas confirmados y solución en esta PR

1. **Inventario desactualizado visualmente.** El modal mostraba `characterData.equipment` de la ficha, no `state.actors[side].equippedWearables` de la sesión. La persona podía ver otra durabilidad o no entender por qué un escudo ya no sirve. Se incorpora un panel de equipo **real del encuentro** con ranura, integridad, desgaste y reparación, y se separa la ficha en una sección plegable de referencia.
2. **Rotura sin visibilidad inmediata.** Los eventos `EQUIPMENT_BREAK`, `EQUIPMENT_CAPACITY` y `EQUIPMENT_STATS` podían quedar fuera de pantalla en el registro. Se agrega un aviso contextual y un indicador visible desde el HUD, con acceso al estado de equipo.
3. **Mensajes técnicos en registros.** `EQUIPMENT_STATS` podía mostrar `physicalDefense -6` y `maxHp` sin contexto. Se usan nombres españoles (`Defensa física`, `HP máximo`, etc.). `EQUIPMENT_CAPACITY` expresa máximos y reservas **antes/después**.
4. **Acciones ordinarias sin confirmación cercana.** Había respuesta de curación/objeto/karma pero no de mover, esperar, atacar, defender u ordenar invocaciones. Se refleja el último evento nuevo del servidor inmediatamente sobre el encuentro.
5. **Indicador heredado duplicado.** `weaponIntegrity` se mostraba como una barra global de «último bloqueo» incluso si cada arma/escudo tenía su propia durabilidad. Se retira esa fila redundante del resumen; se mantienen los valores específicos.
6. **Modelo matemático enviado innecesariamente al cliente.** La vista pública incluía `equipmentDerivedReplay`, que almacena fórmulas y contribuciones por copia; el servidor lo necesita, la página no. `combatClientView` elimina esos modelos para ambos bandos antes de responder. Las estadísticas finales, durabilidad y reglas de reparación siguen visibles.

## Escenarios de regresión

- **Ataque físico + bloqueo real con escudo:** el escudo puede romperse por desgaste de bloqueo; si el bloqueo no absorbió todos los HP, **otra armadura con regla de desgaste físico pierde durabilidad por el daño residual**. Son dos causas distintas del mismo golpe, no un doble cargo arbitrario. Tras avanzar legalmente de ronda, la autorreparación restaura la copia autorizada y descuenta maná una vez.
- **Impacto sobre HP + dos piezas:** desgaste independiente, eventos distintos, bono directo de defensa se desactiva y el registro lo relata en español.
- **Barras/replays:** PR #210 comprueba máximos HP/maná, restricciones por cero, bonos externos, 288 transiciones de múltiples golpes, curación real por habilidad ficticia y rechazo por maná insuficiente.
- **Serialización y privacidad:** el combate original conserva los replays autorizados; el JSON enviado al navegador no incluye el grafo ni sus fórmulas.
- **UI estática:** conexiones de panel, indicadores, mensajes de estado, botones desactivados y ausencia de un falso botón de reparación manual.

## Pendientes — no confundir con funciones ya listas

- **No existe un botón de reparación instantánea durante el combate.** Solo se ejecutan efectos de autorreparación autorizados en el inicio de una ronda válida, además de servicios o efectos que tengan su propio contrato. El panel no simula una acción nueva.
- **No todos los objetos se desgastan por perder HP.** Requieren una regla de desgaste configurada por administración. El bloqueo sí usa la durabilidad física del escudo/arma compatible.
- **No todos los efectos narrativos son ejecutables.** La interfaz muestra por qué una habilidad no está habilitada; no deben activarse acciones arbitrarias desde la petición del cliente.
- **Cobertura visual manual pendiente:** probar en móvil real y escritorio la disposición de alertas, el modal al teclado y el scroll durante reacciones. La auditoría de código y pruebas no certifica la accesibilidad completa ni la ergonomía real.
- **Fuentes especiales de desgaste:** rayos reflejados, superficies ambientales y daños compuestos no siempre siguen el mismo punto de desgaste por daño directo. Necesitan pruebas específicas antes de prometer paridad total.
- **Persistencia simultánea externa:** los tests unitarios y la revisión SQL cubren el contrato `characterItemId` y `LEAST`, pero no sustituyen una prueba de concurrencia contra base de datos de producción.

## Próxima fase recomendada

Tras fusionar, desplegar y comprobar en dispositivo estas explicaciones, iniciar fase D: instalación autorizada de micromódulos en habilidades aprobadas, estados persistentes y eventos tipados, conservando límites de coste PCH, objetivo, área, defensa y reintentos.
