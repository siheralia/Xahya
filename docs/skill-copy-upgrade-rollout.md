# Copias y mejoras de habilidades — versión inicial

## Alcance
- El efecto configurable `COPY_SKILL` tiene las modalidades permanente, temporal, imitación instantánea y colección.
- `value` representa complejidad máxima en PCH. Mejorar esta propiedad (o las demás de una habilidad) usa una moneda de mejora y **únicamente el incremento positivo de PCH**.
- La moneda es un consumible de sistema `IMPROVE_SKILL`, registrado en el catálogo de objetos y entregable desde Gestión. Al consumirlo concede un crédito de mejora, no PCH.
- Las solicitudes de mejora se cargan y se cobran con una transacción y quedan pendientes de aprobación; el rechazo devuelve un crédito y los PCH.
- Las copias permanentes producen una habilidad aprobada. Las temporales duran turnos de combate reales; las de colección pueden almacenarse y equiparse de una en una por habilidad copiadora. La imitación devuelve un efecto instantáneo sin guardar una habilidad.
- La fidelidad porcentual afecta valores numéricos y multiplicadores; el origen se conserva mediante la tabla `skillCopy`.
- Las habilidades de copia no pueden copiar otras copias, ni habilidades de copia, y se respetan restricciones de raciales y especiales.

## Operación y migración
1. Aplicar `supabase/migrations/20261102013000_skill_copies_upgrades.sql` **antes** de habilitar estas rutas en producción. No se ha aplicado directamente a producción desde este PR.
2. Verificar/emitir el contrato de ORM con `prisma contract emit`, ejecutar `npm test`, `npx tsc --noEmit` y `npm run build`.
3. Entregar una `Moneda de Mejora de Habilidades` desde Gestión de objetos, consumirla en el inventario y comprobar el saldo de la ficha.
4. Crear y aprobar una habilidad `Copiar habilidad` con una modalidad; buscar una habilidad aprobada por un fragmento de su nombre, seleccionar el personaje correcto ante nombres repetidos y copiarla. Probar límite de complejidad, acentos, caracteres especiales de búsqueda y bloqueo de copias recursivas.
5. Solicitar mejora de complejidad, aprobar y rechazar solicitudes desde Gestión; comprobar cargos y devoluciones.
6. Probar colección: guardar, equipar y desequipar. Probar temporal: avanzar un combate hasta vencer el número de turnos y comprobar estado `EXPIRED`.
7. Probar permisos: un usuario no puede cargar/copiar/mejorar habilidades de personajes ajenos.

## Limitaciones de la primera versión
- El selector de origen ahora permite buscar habilidades aprobadas por nombre y propietario. Solo se listan resultados compatibles con la modalidad y complejidad; no exige conocer el ID.
- Todavía no hay un registro automático de habilidades observadas; el buscador localiza habilidades aprobadas disponibles, no demuestra que Sarya las haya presenciado.
- La imitación instantánea devuelve un registro de la reproducción (nombre, efectos y costo) y queda auditada, pero no se integra todavía con la resolución automática del daño o los demás efectos de combate. El combate actual no ejecuta de forma automática los efectos generales de habilidades creadas por usuarios.
- La expiración temporal ocurre cuando avanzan **turnos de combate** registrados; no es tiempo de reloj.
- Habilidades raciales que existan solo en el catálogo racial (sin entrada `skill`) no se pueden seleccionar como origen todavía.
- No activar esta funcionalidad antes de desplegar la migración. Mantener el PR en borrador hasta las pruebas de aplicación contra una base con la migración.

## Controles
- Las rutas verifican que el personaje pertenezca al usuario (con permisos administrativos existentes como excepción).
- PCH y crédito se descuentan en transacción; índices únicos impiden duplicar una copia idéntica y solicitar dos mejoras pendientes para una misma habilidad.
- Las tablas nuevas habilitan RLS y revocan acceso directo a `anon` y `authenticated`; solo se accede mediante rutas de servidor autenticadas.
