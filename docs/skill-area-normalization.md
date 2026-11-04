# Normalización de Área de efecto — PR #128

## Contrato sin ruptura de esquema
El formulario de habilidades, gestión, plantilla genérica y mejora deja de ofrecer texto libre y usa el mismo selector de tipos:
- `Objetivo único` (`SINGLE`)
- `Personal` (`SELF`)
- `Contacto` (`CONTACT`)
- `Área circular de N m` (`CIRCLE`, radio 0,1–10 m, hasta dos decimales)
- `Campo alrededor del usuario` (`SELF_FIELD`, sin inventar dimensiones)
- `No especificada` (`UNSPECIFIED`)

El alcance máximo sigue siendo **otro campo**, serializado como ` | Alcance máximo: N m`. Por compatibilidad, la base mantiene la columna `skill.areaOfEffect` de texto; el lector y escritor centrales normalizan la representación y evitan concatenar el alcance dos veces. No se añadieron columnas, por lo que **no se necesita migración de esquema**. El PCH y el alcance configurado no se modifican.

### Casos especiales de legado
Cualquier valor no clasificable se conserva de forma literal como `LEGACY`, visible y de solo lectura hasta que el propietario elija su tipo. Entre estos:
- `100m` de *Espejo mágico*: **no** se convierte en círculo de 100 m.
- `1m` de *Espada de acero*: no se presupone que represente radio o alcance.
- `Arena creada o controlada por Sikatā`: no se confunde con un círculo.
- Plantillas que incluyen objetivo y condiciones adicionales en el propio texto: se conservan para revisión manual.
- Los 12 registros `skill` que no especifican área permanecen `NULL`; el editor los presenta como «No especificada», sin afirmar alcance o radio.

Las áreas no clasificadas no autorizan nuevos ataques ofensivos. Los lanzamientos de espejo ya implementados siguen resolviéndose por su propio contrato. Círculos físicos o mágicos usan el radio tipado en el motor y nunca una cadena arbitraria del cliente.

## Limpieza de datos segura efectuada en Supabase (4 noviembre 2026)
Se comprobaron antes y después los valores de producción de `public.skill` (26 registros) y `public."genericSkillTemplate"` (20 plantillas). Se unificaron **solamente sinónimos inequívocos** sin alterar efectos, costes, maná, alcance ni aprobación:
- 1 registro de `skill`: «Objetivo unico» → «Objetivo único».
- 7 plantillas: «Usuario» → «Personal».
- 4 plantillas: «Oponente único» → «Objetivo único».
- 3 plantillas: variantes de «Oponente/Objetivo al contacto» → «Contacto».

Total: **15 registros normalizados**, comprobados con SELECT posterior. No hubo cambios de esquema ni de identificadores. Los valores especiales se mantuvieron textualmente y las habilidades sin área no fueron inventadas.

## Compatibilidad
Se mantienen los endpoints y la columna existentes, así como copiar, robar, aprobar, mejorar y comprar plantillas. La normalización en escrituras nuevas está centralizada en `lib/skills/area-of-effect.ts` y `lib/skills/range-storage.ts`. Las creaciones ordinarias rechazaran texto especial nuevo sin clasificar; las ediciones existentes podrán conservar literalmente el valor legado hasta su reclasificación.

**La PR #128 sigue sin fusionarse.** La limpieza de los 15 textos ya se aplicó con compatibilidad hacia atrás en la base de producción.
