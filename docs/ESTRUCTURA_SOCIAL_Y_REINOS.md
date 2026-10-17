# Estructura social, seguidores y entidades políticas de Xahya

## Conceptos separados

- **PopulationCohort**: población agregada con ubicación, raza, ocupación, clase, edad, población, riqueza y parámetros demográficos.
- **WorldSocialGroup**: clan, gremio, comunidad religiosa/cultural, movimiento político, comunidad migrante, grupo militar u otra agrupación. Puede vincular cohortes de ubicaciones distintas.
- **WorldSocialGroupMembership**: estimación de cuántas personas de una cohorte pertenecen a una agrupación y qué riqueza se le atribuye. Una misma persona puede participar en más de una agrupación; por eso las afiliaciones no se deben sumar como si fueran censos exclusivos.
- **WorldLeaderRelation**: relación individual entre personajes, con tipo de vínculo y lealtad de 0 a 100. No crea personajes para habitantes agregados.
- **WorldPolity**: reino, ciudad-Estado, imperio, república, confederación, tribu, principado u otra entidad política.
- **WorldPolityLocation**: relación entre una entidad política y una locación: capital, territorio controlado, reclamo o zona de influencia. Permite reclamos rivales; registrar un reclamo no equivale a controlar el territorio.
- **WorldPolityGroup**: relación política entre agrupaciones y entidades: apoyo, membresía, oposición, neutralidad o sujeción.

## División y traslado de una cohorte

La acción split-cohort de /api/management/world/social-structure realiza una división real:

1. valida la cohorte activa, el destino y la cantidad solicitada;
2. dentro de una transacción vuelve a leer el origen y usa una actualización condicionada a su población y riqueza actuales para evitar asignar dos veces la misma porción;
3. descuenta la población y riqueza trasladadas del origen;
4. crea un nuevo fragmento en la ubicación de destino, copiando sus características sociales y parámetros demográficos;
5. registra en behavior la procedencia (splitFromCohortId), la fecha y el motivo;
6. opcionalmente crea la afiliación con una agrupación y la relación territorial con una entidad política, además de vincular el grupo a la entidad.

La riqueza trasladada puede indicarse explícitamente; si se deja vacía, se calcula proporcionalmente a la población actual de origen usando aritmética entera. La operación no permite trasladar toda la cohorte: el origen conserva un registro activo con habitantes.

## Crear una entidad política

Se puede crear una entidad política sin territorio inicial, lo que permite representar movimientos o proyectos de reino antes de reclamar/controlar un lugar. También se puede especificar fundador, capital inicial y agrupación que la apoya. Después se pueden añadir otros territorios y relaciones con agrupaciones.

## Interfaz

La página administrativa está en /management/world/social-structure, enlazada desde la gestión de cohortes. Requiere una cuenta con rol ADMIN, como las demás herramientas de gestión del mundo.

## Límites actuales

- Las afiliaciones de cohortes son cantidades agregadas estimadas, no listas de individuos ni un censo social exclusivo.
- Los personajes concretos se vinculan entre sí por WorldLeaderRelation; no se crea una fila de personaje por habitante.
- La entidad política guarda fundación, estado, fundador, grupos vinculados y relaciones territoriales, pero todavía no ejecuta automáticamente guerra, tributación, sucesión, diplomacia, administración pública ni simulación de cambios de lealtad.
- La acción de división conserva las características del origen; no inventa composición racial u ocupacional nueva.
- Los estados iniciales son deliberadamente prudentes (PROPOSED para nuevas entidades y relaciones territoriales de tipo CLAIM si no se indica otra cosa).

## Migración

La migración 20261017003200_world_social_groups_and_polities.sql crea las seis tablas nuevas e índices asociados. La migración se aplicó al proyecto Supabase mvewhbihcsehcinakksm; no creó agrupaciones o reinos ficticios en los datos existentes.
