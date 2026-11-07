# Servicios de herrería y reparación — catálogo central

## Autoridad: Gestión, no el propietario del negocio

Las definiciones se crean en **Gestión → Negocios y empleos → Servicios de herrería**.
Solo un usuario con rol `ADMIN` puede editar el catálogo en
`/management/businesses/repair-services`. El control se repite en la API
`/api/management/businesses/repair-services`: cambiar el navegador o enviar
POSTs manuales desde una cuenta de jugador no concede autoridad.

Cada definición autorizada comprende:

- Nombre, descripción y disponibilidad global.
- Tarifa en ◈, entre 0 y 1 000 000.
- Material opcional del catálogo (tipo `MATERIAL`) y cantidad, 1–100.
- Clientes admitidos: público o solo el personaje propietario.
- Requisito opcional de un empleado activo contratado.
- Fórmula modular `ACTIVATE` limitada a lectura del objeto elegido y estadísticas
  del reparador, cálculos y una única `REPAIR_DURABILITY`.
- **Negocios autorizados**, elegidos mediante casillas desde Gestión.

La configuración se almacena en el `AppSetting` único
`managed_repair_services_v1`, con hasta 100 definiciones globales y 12
asignaciones por negocio. Se guarda como lista de definiciones completas y listas
de identificadores de negocios autorizados. No requiere migración SQL.

La configuración antigua por negocio con clave
`business_repair_service_v1:<id>` es **histórica e inactiva**: no se ejecuta
ni autoriza ofertas. No había registros con estas claves en producción al
preparar este cambio; no se migra ni se publica ninguna oferta por defecto.

## Qué puede hacer cada participante

**Administración** crea y modifica servicios, incluso el precio, coste de
material, fórmula y negocios elegibles. Retirar un negocio de la autorización
inhabilita inmediatamente todas sus ofertas de ese servicio.

**Dueños de negocios** consultan las ofertas asignadas desde «Mis negocios»,
pero no pueden crear, editar ni asignar servicios. La antigua ruta de escritura
`POST /api/businesses/repair-services` responde 403 para todos.

**Clientes** ven solamente negocios activos con servicios autorizados activos
en «Talleres de reparación», eligen el servicio, un personaje propio y un
ejemplar dañado del inventario.

## Ejecución y protección de recursos

La contratación mantiene una sola transacción: bloquear personaje y negocio,
bloquear el **catálogo global** antes de comprobar la asignación actual, validar
el ejemplar de inventario con cantidad 1, empleado contratado si se requiere,
estadísticas efectivas del propietario, dinero y materiales aportados por el
cliente, y finalmente aplicar la restauración y registrar auditoría.

El servidor nunca utiliza fórmulas ni precios del cliente o del propietario del
negocio, tampoco una definición histórica. Los reintentos siguen usando
`requestId` idempotente. El servicio está prohibido mientras el personaje
participa en combate. El daño no se revierte y no hay reparación en PvP activo.

### Limitaciones

Los materiales se consumen del cliente; aún no existe almacén de taller ni
selección del empleado que realiza la reparación. La estadística de reparación
sigue siendo la del personaje propietario. No hay horarios, desplazamiento
físico ni recetas de forja; son hitos posteriores, diferentes de crear una
definición de servicio. No se modifican las reglas de autorreparación de equipo,
ni los HP/maná del personaje de combate.
