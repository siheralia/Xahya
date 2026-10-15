# Xahya: arquitectura del mundo compartido y simulación

**Estado:** propuesta inicial; no implementada.  
**Objetivo:** conservar la visión del mundo y establecer una ruta técnica para añadir geografía, economía local, población agregada, transporte, seguidores y reinos sin rehacer los sistemas existentes.

## Decisiones acordadas

- Xahya tendrá un único mundo compartido por todos los jugadores.
- El mundo puede contener continentes, islas, archipiélagos e islas flotantes.
- La administración prepara los territorios y ciudades disponibles. Los jugadores pueden reclamar cualquier territorio marcado como libre y reclamable, pero no inventar mapas o territorios inexistentes.
- Una locación puede existir sin ciudad, habitantes, edificios ni detalle visual.
- El mapa general puede mostrar solo ciudades; el detalle de barrios, edificios y puntos de interés se muestra cuando exista y sea útil.
- Las islas flotantes pertenecen al mismo mundo y pueden requerir vuelo, monturas, magia, portales u otros medios configurables para acceder.
- Aurora son negocios existentes, no el nombre genérico de la tecnología. Las sedes de Santuario Aurora y El Gran Refugio Aurora pertenecen actualmente a Guha Arisel y deben poder estar en locaciones distintas, incluso en continentes diferentes o con una sede en una isla flotante.
- Un negocio que alcance el nivel de tecnología de teletransporte puede proponer una conexión con otro negocio; la conexión solo se activa si ambos propietarios la autorizan.
- Red Nova Link es un negocio existente y el equivalente al internet de Xahya: una red global de comunicación e información que incluye torres y satélites. Puede ofrecer acceso público mediante dispositivos compatibles y acceso mediante contratos con el negocio; ambos modelos deben poder coexistir. La cobertura de Red Nova no implica capacidad de teletransporte ni una ruta física.
- La población general se representa principalmente con cohortes estadísticas, no con una fila por habitante. Los NPC que necesiten identidad e historia propias pueden individualizarse.
- Los jugadores podrán reunir seguidores individuales y cohortes, fundar asentamientos y, si cumplen las reglas del juego, formar reinos.
- Las tiendas pueden tener catálogos, existencias y precios diferentes según su negocio y ubicación.
- El esquema actual ya contempla planes de suscripción y suscripciones de personajes a servicios de negocios (`BusinessSubscriptionPlan` y `BusinessSubscription`); antes de añadir servicios de Red Nova, se debe reutilizar y auditar este flujo en vez de crear una segunda suscripción equivalente.
- Los contratos con gobiernos o instituciones deben poder representarse como acuerdos comerciales/institucionales distintos de una suscripción individual recurrente, aunque puedan compartir conceptos como servicio, vigencia, precio, estado y condiciones.
- La simulación avanza por ciclos y guarda su estado; no recalcula el mundo entero cada vez que alguien abre una pantalla.

## Principios de arquitectura

### 1. Geografía jerárquica y detalle opcional

La jerarquía conceptual puede ser: mundo → continente o masa territorial → región → ciudad → barrio → edificio → punto de interés. No es obligatorio crear todas las capas. Una isla puede ser una región reclamable; una ciudad puede existir sin barrios; una mazmorra puede ser un punto de interés dentro de una región.

Cada locación podrá definir, según su tipo:
- locación padre e hijas;
- tipo: continente, isla, isla flotante, región, ciudad, barrio, edificio o punto de interés;
- estado de publicación/exploración;
- propiedades geográficas y recursos;
- capacidad o reglas de asentamiento;
- conexiones de viaje y requisitos de acceso;
- si es reclamable y bajo qué condiciones.

Las coordenadas, el mapa visual y el editor de mapas pueden llegar después. La primera versión no necesita simulación física ni un mapa visual completo.

### 2. Geografía, reclamaciones, asentamientos y reinos son entidades diferentes

- **Locación/territorio:** existe en el mundo y lo prepara la administración.
- **Reclamación territorial:** indica quién controla o reservó un territorio, su estado e historial.
- **Asentamiento:** población y estructuras que existen dentro de un territorio.
- **Reino/facción:** organización política que puede controlar varios territorios y asentamientos.
- **Propiedad privada:** negocio o edificio que puede pertenecer a un personaje sin convertirlo en soberano del territorio.

Las reclamaciones se validan en el servidor y se resuelven transaccionalmente para impedir que dos jugadores reclamen a la vez el mismo territorio. Se deberán definir fronteras, expansión a territorios vecinos, abandono, disolución de reinos y zonas reservadas para la historia.

### 3. Viajes y acceso

La geografía y las rutas se modelan por separado. Las conexiones pueden ser terrestres, marítimas, aéreas, mágicas o portales/teletransportación. Cada conexión puede definir origen, destino, estado, coste opcional y requisitos.

El vuelo y la magia deben ser requisitos configurables, no excepciones codificadas exclusivamente para islas flotantes. Los negocios son establecimientos físicos; sus conexiones de transporte se modelan aparte de sus ubicaciones. Cada sede conserva su propia economía.

#### Terminología sánscrita propuesta

Estos nombres son etiquetas de diseño pendientes de validación; no son sistemas implementados ni cambian los nombres comerciales actuales:

- **Dvāra (द्वार, «puerta»):** tecnología/capacidad de teletransporte que un negocio puede adquirir y mejorar por nivel. No es un negocio independiente ni reemplaza nombres como Aurora o Red Nova Link.
- **Setu (सेतु, «puente»):** conexión de teletransporte autorizada entre dos extremos compatibles. Cada extremo pertenece a una sede física y mantiene su identidad, inventario, empleados, precios y economía.
- **Mahāsetu (महासेतु, «gran puente»):** nombre conceptual reservado para una posible infraestructura distribuida de transporte físico con múltiples nodos y rutas. No representa Red Nova Link ni su red de internet; solo se usaría si Xahya incorpora una infraestructura de transporte de ese tipo.

#### Reglas de una conexión Dvāra/Setu

1. La capacidad Dvāra pertenece al negocio y tiene un nivel propio; no se confunde con el nivel del personaje propietario ni con el nivel general del negocio.
2. Un negocio con el nivel requerido puede solicitar conectar una sede con otra sede compatible.
3. La conexión queda pendiente hasta que los propietarios de ambos negocios la autoricen. La autorización debe registrarse por cada extremo; no basta con que un único propietario controle ambos negocios.
4. La conexión puede activarse, suspenderse o revocarse según las reglas que se definan. El estado y las autorizaciones deben persistir y validarse en el servidor.
5. La ubicación física nunca se falsifica: una sede en un continente y otra en una isla flotante siguen siendo locaciones distintas aunque estén conectadas instantáneamente.
6. Una conexión entre dos sedes no implica que todo el negocio comparta inventarios o precios, ni concede acceso automático a otras sedes.
7. Si en el futuro existe una infraestructura de transporte Mahāsetu, podrá tener múltiples nodos y rutas, con requisitos y permisos propios. Debe modelarse por separado de la red de comunicación Red Nova Link y no como una lista de enlaces bilaterales Aurora.

#### Casos de referencia actuales

- **Santuario Aurora** y **El Gran Refugio Aurora** pertenecen actualmente a **Guha Arisel**. Pueden ubicarse en continentes diferentes; una de las locaciones podría ser una isla flotante. Aunque hoy compartan propietario, sus ubicaciones y economías siguen separadas. La regla de autorización de ambos extremos se conserva para permitir que, en el futuro, se conecten negocios de propietarios distintos.
- **Red Nova Link** también pertenece actualmente a **Guha Arisel** y se concibe como el internet de Xahya, con torres repartidas por el mundo y satélites. Su modelo debe representar nodos de comunicación, cobertura, capacidad y acceso. Puede haber acceso público con dispositivos compatibles y acceso mediante contratos comerciales; la coexistencia y las condiciones exactas de ambos modelos quedan por definir. Tener cobertura Red Nova no concede acceso a portales ni permite teletransportarse.

### 4. Población agregada y NPC individualizados

Una cohorte representa un número de habitantes con características compartidas o distribuciones estadísticas; no es un personaje jugable. Puede contener:
- locación o asentamiento;
- cantidad de habitantes;
- raza, cultura u otros grupos demográficos cuando aplique;
- distribuciones/probabilidades de estadísticas y afinidades;
- ocupaciones y especialización;
- necesidades, productividad y situación económica;
- parámetros de nacimientos, muertes y migración;
- fecha o versión del último ciclo simulado.

Las distribuciones deben ser compactas y validables. No crear una fila por persona para representar la población general.

**Individualización:** si un habitante necesita nombre, relaciones, inventario, decisiones o historia persistente, se crea un NPC individual y se descuenta de su cohorte de origen en una operación atómica. Así no se cuenta dos veces a la misma población. La muerte, migración o reintegración de NPC debe mantener las cantidades consistentes.

Los nombres y descripciones genéricos viven en catálogos compartidos. Las identidades personales permanecen en registros individuales. Un ID sustituye datos repetidos de catálogo, no el nombre propio de una persona.

### 5. Seguidores y reinos

Distinguir:
- **NPC seguidor individual:** persona con identidad e historial asociada a un jugador/personaje.
- **Cohorte de seguidores:** grupo de colonos, trabajadores, población o fuerzas que representa muchas personas.
- **Población territorial:** habitantes de un asentamiento o reino, que no necesariamente son seguidores personales del gobernante.

Un jugador puede reunir seguidores, trasladar cohortes, fundar asentamientos y eventualmente crear un reino. Lealtad personal, residencia, empleo y soberanía son relaciones distintas: trabajar para un jugador no convierte automáticamente a un habitante en seguidor suyo.

Cuando una cohorte se establece en una locación, la población se transfiere entre grupos/localizaciones sin duplicarla. Las reglas de creación de reinos, costes, requisitos y gobierno se definirán en una fase posterior.

### 6. Economía local y comercios

Separar el catálogo compartido de bienes de la disponibilidad y precios locales. Conceptos:
- tipo de recurso/producto;
- inventario local por ciudad, asentamiento o negocio;
- reglas de producción: recursos consumidos y productos generados;
- demanda/consumo estimados de población y actividades;
- precio local, calculado o configurado con base en precio base, oferta, demanda, transporte, impuestos y modificadores;
- negocio con sede, empleados, inventario y reglas propias.

Las tiendas pueden vender catálogos distintos y aplicar precios diferentes por ubicación. No duplicar nombre y descripción del artículo en cada tienda: referenciar el catálogo y guardar localmente stock y valores comerciales variables. El precio base de un artículo no equivale al precio de venta local.

El esquema actual ya incluye Business y BusinessProduct, con existencias y precios de compra/venta por negocio. Antes de añadir tablas, evaluar cómo asociar negocios a locaciones y extender el mercado sin romper tiendas ni economía existentes.

### 7. Ciclos de simulación

La simulación se ejecuta por ciclos diarios, mensuales u otro calendario configurable, nunca en cada carga de pantalla. Un ciclo puede procesar:
1. producción y consumo de recursos;
2. inventarios, oferta, demanda y precios;
3. empleo e ingresos;
4. nacimientos, muertes y migración;
5. crecimiento o contracción de asentamientos;
6. acontecimientos y consecuencias políticas;
7. registro del resultado y avance del ciclo.

Requisitos:
- idempotencia: repetir un ciclo no duplica pagos, nacimientos ni producción;
- guardar último ciclo aplicado y versión de reglas;
- registrar eventos importantes y facilitar auditoría;
- procesar solo regiones activas cuando sea seguro;
- probar límites para evitar crecimiento descontrolado;
- hacer reproducible la aleatoriedad cuando sea necesario depurar.

No conservar solo las cohortes más exitosas: eso reduciría la diversidad y podría extinguir grupos artificialmente. Considerar azar, migración, ambiente y diversidad.

## Modelo lógico inicial (nombres orientativos)

Son conceptos de diseño, no nombres finales ni tablas creadas:

| Concepto | Responsabilidad |
|---|---|
| WorldLocation | Jerarquía de continentes, islas, regiones, ciudades y puntos de interés |
| TravelConnection | Rutas y conexiones, incluidos vuelo, magia y teletransportación |
| TerritoryClaim | Reclamación/control territorial e historial |
| Settlement | Asentamiento dentro de una locación |
| PopulationCohort | Cantidad de habitantes y distribuciones |
| Npc | Habitante individual persistente |
| CohortTransfer | Movimientos de población sin duplicación |
| ResourceType | Catálogo compartido de recursos y bienes |
| LocationInventory | Existencias locales |
| ProductionRule | Entradas, salidas y requisitos de producción |
| LocalMarketRule / LocalPrice | Oferta, demanda y precios locales |
| SimulationRun / SimulationState | Ciclos, estado, versión de reglas e idempotencia |
| WorldEvent | Acontecimientos persistentes |
| FollowerGroup | Cohortes bajo seguimiento o autoridad de un personaje |
| Kingdom / Faction | Organización política |
| KingdomTerritory | Relación entre reinos y territorios |
| BusinessLocation | Relación entre un negocio y cada una de sus sedes físicas; permite que un negocio tenga varias ubicaciones o torres |
| BusinessCapability | Capacidad tecnológica que posee un negocio y su nivel, por ejemplo Dvāra |
| ServiceAgreement / InstitutionalContract | Acuerdo comercial con una institución o gobierno; propuesta futura, distinta de una suscripción individual |
| BusinessSubscriptionPlan / BusinessSubscription | Modelos existentes en Prisma para planes de suscripción de negocios y suscripciones de personajes; auditar y reutilizar antes de extender servicios |
| TeleportLink / Setu | Conexión entre dos sedes con autorización registrada de ambos extremos |
| CommunicationNode / RedNovaNetwork | Torres, satélites, cobertura, capacidad y acceso a la red global de comunicación equivalente al internet |
| TeleportNode / MahāsetuNetwork | Nodos y rutas de una posible infraestructura distribuida de transporte físico, independiente de Red Nova Link |

No crear todas estas tablas de una vez. El esquema definitivo debe respetar las convenciones actuales de Prisma, las relaciones, los tipos de fecha y las claves de Xahya.

## Auditoría técnica preliminar del sistema existente

Esta revisión es estática del contrato Prisma y de las rutas de negocio/cobro en el repositorio; no modifica datos ni ejecuta pagos. Antes de diseñar migraciones, estos son los hallazgos útiles:

### Lo que ya existe y conviene reutilizar

- `Business` representa la entidad comercial y contiene propietario, caja, ingresos pasivos, inversiones y estado activo.
- `BusinessProduct` ya guarda catálogo por negocio, existencias y precios de compra/venta independientes; no hace falta duplicar el catálogo de artículos para cada locación.
- `BusinessSubscriptionPlan` define planes de suscripción propiedad de un negocio. `BusinessSubscription` enlaza el plan con un personaje, guarda si está activa y cuándo corresponde el siguiente cobro.
- `app/api/businesses/subscribe/route.ts` valida la propiedad del personaje, comprueba saldo y, dentro de una transacción, cobra la primera cuota y abona la caja del negocio.
- `lib/economy.ts` procesa cobros recurrentes desde el cron de economía. Si el personaje no tiene fondos suficientes, la suscripción actual se desactiva.
- `EconomyPaymentLog` tiene una clave única para evitar duplicar ciertos pagos por periodo. Sin embargo, los cobros de suscripción no crean actualmente una fila en ese registro; su avance depende de actualizar `lastChargedAt` y `nextChargeAt`.

### Límites que el nuevo diseño debe resolver

1. **No existe una entidad geográfica asociada a Business.** No hay una relación que diga dónde está una sede física, y tampoco un modelo para múltiples sedes, torres o satélites de un mismo negocio.
2. **Las suscripciones actuales son individuales.** `BusinessSubscription` exige `characterId`; no representa directamente un contrato con gobierno, municipio u otra institución.
3. **La prevención de suscripciones duplicadas debe reforzarse.** El endpoint comprueba si ya hay una suscripción activa antes de crearla, pero el modelo no declara una restricción única que impida una duplicación concurrente del mismo personaje y plan.
4. **La idempotencia de cobros recurrentes merece una prueba específica.** Como el cobro de suscripción no registra una entrada en `EconomyPaymentLog`, se debe comprobar el comportamiento ante dos ejecuciones simultáneas del cron o reintentos antes de ampliar este sistema a servicios de Red Nova.
5. **El contrato institucional no debe fingir que un gobierno es un personaje.** Conviene modelar la contraparte institucional y el acuerdo por separado, reutilizando el motor de caja/cobros donde sea seguro, pero sin forzar `characterId` para un pagador no-personaje.

### Recomendación técnica resultante

- Mantener `Business` como entidad comercial, sin convertir cada torre, satélite o sucursal en un negocio distinto.
- Añadir en una fase futura `BusinessLocation` para cada sede o punto físico y asociarlo a `WorldLocation`; los nodos de comunicación de Red Nova deben distinguirse de las sedes comerciales ordinarias.
- Conservar `BusinessSubscriptionPlan` y `BusinessSubscription` para suscripciones de personajes. Antes de extenderlas, diseñar y probar un registro de cobro/idempotencia que permita auditar cada cuota.
- Modelar contratos institucionales como acuerdos con contraparte, alcance geográfico, servicio contratado, precio, vigencia, estado, condiciones de renovación y registro de pagos. Los detalles de gobierno, impuestos, penalizaciones y contratación quedan abiertos.
- No añadir todavía las tablas anteriores a producción. Primero cerrar el modelo lógico y preparar una migración revisable, incluyendo las restricciones e índices necesarios.

## Relación con el esquema actual

La inspección inicial de prisma/contract.prisma muestra, entre otros:
- Character y Race, con Character.raceId;
- Business, con propietario, saldo, inversiones, puestos y productos relacionados;
- BusinessProduct, con businessId, itemId, existencias y precios de compra/venta;
- Item, como definición compartida de productos.

Consecuencias:
- reutilizar Race e Item como catálogos donde corresponda;
- evaluar cómo asociar Business a una locación sin duplicar la lógica económica;
- conservar los personajes actuales y no convertir cohortes en fichas Character completas;
- auditar si el NPC individual reutiliza un modelo existente o necesita uno separado;
- conservar los nombres y registros comerciales existentes: Aurora y Red Nova Link son negocios, no nombres de tablas tecnológicas;
- no asumir que existe una implementación dedicada de Dvāra, Setu o Mahāsetu: son propuestas de nomenclatura y modelado;
- permitir que un negocio tenga varias sedes o nodos de comunicación, necesario para Red Nova Link, sin duplicar su entidad comercial ni mezclar economías locales.

## Plan de implementación

### Fase 0 — Auditoría y diseño
- Revisar el esquema Prisma completo, migraciones, código de tiendas/economía, el flujo existente `BusinessSubscriptionPlan` / `BusinessSubscription` y cualquier implementación de Aurora.
- Documentar relaciones actuales, IDs y convenciones de fechas.
- Acordar reglas de reclamación, unidades geográficas y permisos.
- Preparar diagrama de entidades y migración revisable.

### Fase 1 — Geografía mínima
- Añadir locaciones jerárquicas y tipos de territorio.
- Registrar continentes, islas (incluidas flotantes), regiones y ciudades.
- Permitir locaciones sin contenido detallado.
- No generar todavía población masiva ni simulación económica.

### Fase 2 — Sedes comerciales y transporte
- Asociar cada sede física a una locación del mundo; permitir varias sedes por negocio.
- Modelar la capacidad Dvāra como tecnología de negocio con nivel, sin convertirla en un negocio separado.
- Crear el flujo de solicitud y autorización bilateral para conexiones Setu, con registro de consentimiento de ambos propietarios.
- Diseñar por separado la red de comunicación Red Nova Link (torres, satélites, cobertura y acceso) y las conexiones de teletransporte Setu. Considerar Mahāsetu solo si se define una infraestructura distribuida de transporte físico.
- Verificar que precios, inventarios, inversiones, empleos y pagos actuales no sufran regresiones.

### Fase 3 — Economía territorial
- Añadir inventario de recursos y reglas de producción/consumo.
- Introducir precios y disponibilidad por ciudad.
- Integrar población con consumo y mano de obra.

### Fase 4 — Cohortes y simulación
- Crear cohortes y ciclo idempotente.
- Probar escenarios pequeños antes de escalar.
- Individualizar NPC con transferencia atómica de población.

### Fase 5 — Seguidores, asentamientos y reinos
- Añadir cohortes de seguidores y movimientos entre locaciones.
- Permitir asentamientos en territorios libres.
- Añadir control territorial y reglas políticas.
- Diferenciar la población del reino de los seguidores personales.

### Fase 6 — Presentación y expansión
- Mostrar ciudades en la vista general y detalle solo donde exista.
- Incorporar mapas visuales, exploración y herramientas administrativas.
- Añadir continentes e islas sin cambiar el modelo base.

## Seguridad, integridad y rendimiento

- Validar en servidor reclamaciones, transferencias de cohortes y operaciones económicas.
- No confiar en datos del cliente para población, saldo, inventario o propiedad.
- Definir permisos administrativos y RLS para nuevas tablas expuestas por Supabase.
- Añadir claves foráneas, restricciones, índices y unicidad tras acordar relaciones.
- Usar transacciones para transferencias de población, reclamaciones y operaciones económicas.
- No guardar datos personales individuales para habitantes que solo existen como estadísticas agregadas.
- Medir volumen y duración de ciclos con simulaciones pequeñas antes de estimar escalabilidad.

## Criterios de aceptación

- Un continente puede contener ciudades e islas flotantes sin exigir mapas detallados de cada región.
- Una isla flotante puede requerir vuelo o magia.
- Dos sedes Aurora pueden estar en continentes diferentes y conectarse sin falsear su ubicación física.
- Tiendas de ciudades distintas pueden tener catálogos, existencias y precios diferentes.
- Millones de habitantes pueden representarse con muchas menos filas que habitantes individuales.
- Un NPC puede individualizarse sin duplicar población.
- Solo se pueden reclamar territorios disponibles; reclamaciones simultáneas no duplican el control.
- Cohortes de seguidores pueden trasladarse y formar parte de asentamientos/reinos sin confundirse con toda la población.
- Los ciclos no duplican efectos económicos si se repiten.
- Los personajes, negocios, tiendas y laberintos actuales siguen funcionando.

## Alcance de este documento

Este archivo conserva la visión y el diseño inicial. **No crea tablas, no ejecuta migraciones ni modifica la economía actual.** El siguiente paso técnico es auditar el esquema y el código existentes; después se prepara una migración pequeña y revisable para la primera fase.
