# Red Nova Link — modelo de infraestructura

## Canon que se conserva

- Red Nova Link transmite información; no transporta personas ni objetos.
- Dvāra/Setu y sus portales son un sistema distinto.
- La geografía canónica vive en `worldLocation`: las 27 ciudades ya registradas no se recrean ni se renombran.
- La red contiene 26 torres terrestres, cuatro satélites orbitales llamados **Ojos de Nova** y una sede central global adicional. La sede no cuenta como torre.
- La migración de esquema no inventa nombres, coordenadas, órbitas, historias, cobertura ni enlaces.

## Persistencia

### `worldInfrastructure`

Cada instalación tiene un `code` estable, nombre, clase (`TOWER`, `ORBITAL_SATELLITE`, `GLOBAL_HEADQUARTERS`), descripción, historia de fundación, tipo de construcción, cobertura, detalles técnicos y estados de operación/publicación.

`worldLocationId` apunta a una ubicación física de `worldLocation` para torres y sede. Las ubicaciones de instalaciones terrestres deberán ser nodos `BUILDING` o `POINT_OF_INTEREST` bajo la ciudad/territorio existente que corresponda. Los satélites pueden dejar esa relación nula; su información orbital va en `details`. No se debe fingir que un satélite está dentro de una ciudad.

### `worldInfrastructureLink`

Los enlaces son dirigidos y conectan dos instalaciones. `linkType` distingue `TRANSMISSION`, `BACKHAUL`, `SATELLITE_UPLINK`, `SATELLITE_DOWNLINK` y `HEADQUARTERS_CONTROL`. Cada enlace tiene estado y detalles extensibles. Los enlaces representan comunicaciones, nunca portales de transporte.

### Negocios

El contrato Prisma incluye `Business.locationId` como relación opcional a `WorldLocation`, para mantener negocios y sus ubicaciones en el mismo árbol geográfico. Esa columna ya existe en la base consultada; no se vuelve a crear en esta migración.

## Reglas de implementación

1. Mantener todos los identificadores y registros de las 34 ubicaciones existentes.
2. No crear instalaciones ficticias ni enlaces por defecto durante la migración.
3. Crear después, mediante Gestión del Mundo, los nodos geográficos terrestres y las instalaciones con nombres e historias acordados.
4. Antes de publicar, validar que existan exactamente 26 torres, cuatro Ojos de Nova y una sede central; esa validación debe considerar solo instalaciones publicadas/no archivadas y no contar la sede como torre.
5. Las conexiones y cobertura se deben editar desde la gestión real de Xahya, con autorización de GM/ADMIN y validación en servidor.
6. Las simulaciones por cohortes siguen separadas de la topología de comunicaciones. Una caída de enlaces podría afectar la disponibilidad informativa en una fase futura, pero no debe alterar automáticamente la población o la economía hasta definir esas reglas.

## Alcance de este cambio

Esta etapa añade el contrato de datos y la migración de esquema. No inserta instalaciones, no aplica la migración a Supabase, no cambia la interfaz ni despliega la aplicación. Esos pasos se realizan después de revisar la migración y completar la implementación de Gestión del Mundo.
