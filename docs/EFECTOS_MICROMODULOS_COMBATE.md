# Hito 3 — eventos y estado de micromódulos integrados al combate (opt-in)

## Integración real, controlada

- Se amplía `CombatState` con `microEffects` **opcional**, serializable dentro de `lastAction.combatV1` de la tabla combatSession. No hay migración ni una segunda fuente de estado.
- La ruta POST de acciones existente **ya bloquea la fila de combate con una transacción** y guarda `combatV1:next`. Los módulos ejecutados en este estado participan automáticamente de la misma transacción, no se guardan por separado.
- `combatClientView` elimina las definiciones, valores almacenados y tokens de reintento antes de responder al navegador: son estado privado del encuentro.
- `installEncounterMicroEffects` es un punto de instalación **solo desde código de servidor autorizado** y NO se expone en la API de jugadores ni se conecta a las habilidades guardadas. Es un opt-in para pruebas de combate aisladas hasta implementar precios PCH, aprobación y editor de módulos. Los encuentros sin `microEffects` mantienen el comportamiento anterior.

## Eventos incorporados al motor

| Evento | Punto del ciclo | Micromódulo autorizado |
| --- | --- | --- |
| PASSIVE | Antes de calcular la protección ante un ataque | MODIFIER de RESISTANCE |
| DAMAGE_RESOLVED | Después de calcular contacto, defensa, daño final y registrar RESOLVE; antes de finalizar el combate | STORE de evento.MITIGATED_DAMAGE |
| TURN_START | Al cambiar a la siguiente ronda del encuentro y caducar buffs, una vez por lado | HEAL; máximo HP garantizado |

Las cargas se almacenan como valores independientes, por propietario de combate (PLAYER/NPC). El identificador de evento se deriva de un contador monotónico persistido en la sesión; el evaluador reconoce duplicados, y el bloqueo transaccional del endpoint impide que dos solicitudes simultáneas sobrescriban el estado.

**Sin beneficio gratuito:** `installEncounterMicroEffects` rechaza módulos DAMAGE, CONSUME, IMPACT u otros fuera de estas tres fases. No se permite instalar los módulos por campos enviados desde el cliente. Retribución divina sigue siendo un fixture de laboratorio hasta implementar lanzamiento y resolución multicanal.

## Qué se entiende por daño mitigado

En este hito **resistencia** significa la reducción atribuible a la estadística de defensa física o mágica contra el ataque que hizo contacto. Se calcula una segunda estimación con defensa estadística igual a cero y con el resto de factores (crítico, tipo, reacción, daño final, racial) **iguales**:

- `MITIGATED_DAMAGE = max(0, daño_sin_defensa - daño_con_defensa)`.
- No produce cargas un ataque esquivado, sin contacto, o interceptado con reducción de escala cero.
- BLOCK/ENDURE/construcciones por sí solas no generan carga por su mitigación de reacción.
- El bono `RESISTANCE ×1.3` de Santuario Interior aumenta la estadística de defensa usada en esa resolución, antes de añadir la primera carga.
- El primer golpe utiliza el estado de cargas anterior; su resultado puede activar regeneración y desactivar el bono defensivo **para el siguiente evento**, sin retroactividad.
- La regeneración ocurre al comienzo de cada nueva ronda, no en la creación de la sesión. Cura hasta un 10% del HP máximo por ronda cuando hay al menos una carga.

Estos criterios se fijan provisionalmente para las pruebas y se deben contrastar con el diseño más amplio de resistencias raciales, barreras y eventos de múltiples impactos. No se modifica la fórmula heredada del combate cuando los módulos están desactivados.

## Pruebas

`tests/combat-micro-modules.test.mjs` ejecuta ataques reales del motor y comprueba:
1. Compatibilidad de encuentros sin micromódulos.
2. Primera defensa de Gloria con +30% y captura exacta del daño mitigado.
3. Desactivación de esa bonificación cuando hay cargas.
4. No acumulación por esquivas.
5. Regeneración una sola vez en el siguiente turno con cargas.
6. Ausencia de regeneración sin cargas y tope de HP.
7. Rechazo de daños y acciones no autorizadas.
8. Almacenamiento separado por combatiente.
9. Persistencia por JSON y uso del bloqueo existente del endpoint.

## Pendiente para habilitar en personajes

Crear el contrato de edición y aprobación de efectos modulares, introducir la valoración PCH, definir compatibilidad con daños compuestos/terrenos, y conectar solo configuraciones autorizadas al inicio del combate. El motor no debe aceptar definiciones de habilidad desde la petición del usuario.
