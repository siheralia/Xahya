# Red Nova Link — modelo de infraestructura

## Canon que se conserva

- Red Nova Link transmite información; no transporta personas ni objetos.
- Dvāra/Setu y sus portales son un sistema distinto.
- La geografía canónica vive en `worldLocation`: las 27 ciudades ya registradas no se recrean ni se renombran.
- La red contiene 26 torres terrestres, cuatro satélites orbitales llamados **Ojos de Nova** y una sede central global adicional. La sede no cuenta como torre.
- La migración de esquema no inventa nombres, coordenadas, órbitas, historias, cobertura ni enlaces.

## Persistencia

### `worldInfrastructure`

Cada activo tiene un `code` estable, nombre, tipo, descripción, historia, construcción, cobertura, detalles técnicos y estados. Además de `TOWER`, `ORBITAL_SATELLITE` y `GLOBAL_HEADQUARTERS`, admite `BUILDING`, `WORKSHOP`, `WAREHOUSE`, `VEHICLE`, `EQUIPMENT`, `STORE` y `FACILITY`. Los detalles específicos se guardan en JSON para que el modelo pueda crecer sin crear una tabla por tipo.

`worldLocationId` apunta a una ubicación física de `worldLocation` para torres y sede. Las ubicaciones de instalaciones terrestres deberán ser nodos `BUILDING` o `POINT_OF_INTEREST` bajo la ciudad/territorio existente que corresponda. Los satélites pueden dejar esa relación nula; su información orbital va en `details`. No se debe fingir que un satélite está dentro de una ciudad.

### `worldInfrastructureLink`

Los enlaces son dirigidos y conectan dos instalaciones. `linkType` distingue `TRANSMISSION`, `BACKHAUL`, `SATELLITE_UPLINK`, `SATELLITE_DOWNLINK` y `HEADQUARTERS_CONTROL`. Cada enlace tiene estado y detalles extensibles. Los enlaces representan comunicaciones, nunca portales de transporte.

### Negocios y propiedad de activos

`worldInfrastructure.businessId` es una relación opcional a `business.id`. Un negocio puede tener muchos activos; cada activo tiene como máximo un negocio propietario. Si el negocio se elimina, el activo permanece y `businessId` pasa a `NULL`. Esto permite infraestructura de Red Nova Link y también activos de tiendas, talleres, almacenes, vehículos y otros negocios. Los activos independientes también son válidos. La ubicación (`worldLocationId`) es independiente de la propiedad. `Business.locationId` ya existe y no se vuelve a crear en esta migración.

## Reglas de implementación

1. Mantener todos los identificadores y registros de las 34 ubicaciones existentes.
2. No crear instalaciones ficticias ni enlaces por defecto durante la migración.
3. Crear después, mediante Gestión del Mundo, los nodos geográficos terrestres y las instalaciones con nombres e historias acordados.
4. Antes de publicar, validar que existan exactamente 26 torres, cuatro Ojos de Nova y una sede central; esa validación debe considerar solo instalaciones publicadas/no archivadas y no contar la sede como torre.
5. Las conexiones y cobertura se deben editar desde la gestión real de Xahya, con autorización de GM/ADMIN y validación en servidor.
6. Las simulaciones por cohortes siguen separadas de la topología de comunicaciones. Una caída de enlaces podría afectar la disponibilidad informativa en una fase futura, pero no debe alterar automáticamente la población o la economía hasta definir esas reglas.

## Gestión en Xahya

La ruta `/management/world/infrastructure` cuelga de la Gestión del Mundo existente y usa la API `/api/management/world/infrastructure`. Solo `ADMIN` puede leer o modificar los datos, siguiendo el control de acceso que ya utiliza la gestión geográfica. Permite registrar/editar/eliminar activos, asignarles un negocio propietario opcional y una ubicación existente, guardar cobertura/detalles como JSON y crear/eliminar enlaces dirigidos. El borrado de un nodo elimina sus enlaces por cascada; la interfaz pide confirmación.

Los nuevos nodos nacen como `DRAFT` y `PLANNED`. La interfaz muestra conteos, pero no declara la red lista por alcanzar una cantidad: antes de publicar se debe comprobar el conjunto de instalaciones activas/publicadas.

## Alcance de este cambio

Esta etapa añade el contrato de datos, la migración de esquema, la API protegida y la pantalla integrada en Gestión del Mundo. No inserta instalaciones ni enlaces, no aplica la migración a Supabase, no fusiona a `main` ni despliega la aplicación. La validación de Prisma/TypeScript y build sigue pendiente en un entorno de proyecto con dependencias.
