# Xahya — Motor declarativo de mecánicas de habilidades

Este módulo es genérico. **No instala ni crea habilidades**; permite configurarlas mediante Gestión de Habilidades, la ficha y el catálogo de efectos existente.

## Preparación

1. Aplicar la migración aditiva \`supabase/migrations/20261102053000_skill_interaction_engine.sql\` antes de publicar la API.
2. Regenerar los artefactos de contrato Prisma con \`npx prisma contract emit\` (el prebuild y el workflow de pruebas lo hacen).
3. Ejecutar \`npm test\`, \`npx tsc --noEmit\` y \`npm run build\`.

No modificar/insertar registros en \`skill\` durante el despliegue. Las configuraciones viejas tienen \`mechanics: {}\` por defecto y conservan su flujo anterior de acumulación sin nuevos cargos.

## Configuración

El campo \`skill.mechanics\` es un objeto JSON validado en la creación y la edición. El editor compartido ofrece:

- Familia y habilidad madre (requisito real de adquisición para la ejecución).
- Condiciones: concentración mínima en campo, exposición acumulada, habilidad activa, estado presente o evento.
- Reglas para eventos: \`ACTIVATE\`, \`TURN\`, \`HIT\`, \`ENTER_FIELD\`.
- Vínculos con una segunda habilidad activa.
- Acciones: crear campo, consumir concentración, exponer, limpiar exposición, crear estado y dedicar maná a una protección.

El editor añade un recargo PCH por reglas ejecutables. Los efectos habituales mantienen sus precios, rango, duración y requisitos propios. Por seguridad, una regla solo puede usar acciones tipadas; no se admite JavaScript arbitrario.

Cada campo tiene \`material\` (clave ASCII mayúscula como \`FIRE\`), anillos de radio exterior y ppm, velocidad de dispersión por turno, porcentaje de transferencia y duración opcional.

## Ejecución

- Al iniciar una habilidad desde \`/api/characters/:id/skills/tick\`, se verifica si tiene reglas. Solo habilidades con reglas nuevas descuentan maná al activarse; los controles de acumulación anteriores mantienen su comportamiento.
- El gasto usa \`characterResource.currentMana\`, persistido. \`NULL\` significa que el saldo aún no se inicializó y se toma el maná máximo vigente una sola vez.
- Las habilidades pasivas aprobadas ejecutan reglas de \`TURN\` sin necesitar activación manual. Las activas requieren un estado activo.
- Las reglas con \`linkedSkillId\` solo se ejecutan cuando dicha técnica está activa.
- Cada turno efectivo de combate procesa dispersión, expiraciones, condiciones y exposición.
- Las modificaciones de \`AGI\` afectan el cálculo de velocidad de combate. Otros estados quedan guardados para su interpretación por subsistemas que los soporten.
- Los campos se almacenan en \`combatSession.mechanicsState\`, \`mazeRoom.mechanicsState\` o \`character.mechanicsState\` según el contexto al activar.

### Protección de maná

La acción \`MANA_WARD\` puede configurarse en **una habilidad futura**, sin crearla ahora. Consume la inversión declarada además del coste de la habilidad, y reduce exposición con:

\`\`\`text
ppm_reducidas = floor(manaInvestment * nivel / 5)
exposición_nueva = max(0, concentración - ppm_reducidas)
\`\`\`

Las inversiones solo son válidas en un evento \`ACTIVATE\`. Sus efectos duran el número de turnos indicado. No es una defensa universal automática contra daño.

### Posición y exposición

No se asignan distancias falsas al enemigo. Al crear un campo, el lanzador se encuentra en su centro. Para otros actores, un GM debe establecer la distancia al origen del campo:

- \`GET /api/combat/:id/mechanics\`: lectura autorizada del estado.
- \`PATCH /api/combat/:id/mechanics\` con \`{"actor":"NPC","distanceMeters":8}\`: actualizar distancia, exclusivamente GM/ADMIN.
- \`POST /api/combat/:id/mechanics\` con \`{"skillId":123,"event":"HIT"}\` o \`ENTER_FIELD\`: confirmar explícitamente un evento, exclusivamente GM/ADMIN.

Si la distancia no está definida, \`FIELD_MIN\` no se cumple para ese actor y \`EXPOSE\` con \`fromField:true\` no aplica exposición: se evita adjudicar inhalación fuera de alcance.

La dispersión realiza transferencia conservando la cantidad aproximada de material ponderada por el área de anillos. La caída de concentraciones inferiores a 50 ppm elimina esos campos, por ahora sin generar automáticamente un objeto de inventario.

### Maná de la ficha

\`GET/PATCH /api/characters/:id/mana\` permiten leer y guardar el saldo persistente. La ficha guarda las ediciones al salir del campo. HP sigue siendo local de la ficha, como antes.

## Limitaciones pendientes

- El motor de combate actual no tiene coordenadas físicas nativas ni confirmación automática de impactos. El GM debe proporcionar distancias y eventos verificables.
- Las habitaciones del laberinto guardan campos, pero el laberinto todavía no tiene turnos de combate físicos para dispersarlos automáticamente sin una acción de avance.
- Las estadísticas distintas de AGI no se recalculan automáticamente desde estados de combate en todas las vistas.
- No se implementaron una física completa de viento, humedad, combustión o radiación, ni una simulación real de partículas; esos comportamientos deben representarse mediante estados/reglas.
- No hay resolución PvP multi-actor automática. El modelo de exposición del combate actual diferencia PLAYER y NPC.
- No hay habilidades precargadas, especializaciones minerales ni poderes base. Se configuran cuando el dueño del juego lo decida.

Este documento es un contrato de las funciones realmente conectadas, no una afirmación de que exista ya un simulador físico universal.
