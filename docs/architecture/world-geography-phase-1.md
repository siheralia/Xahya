# Xahya — propuesta de implementación de geografía mínima

**Estado:** plan técnico para revisión; no implementado.  
**Rama prevista:** `docs/world-simulation-architecture`.  
**Alcance:** preparar una primera entrega pequeña de geografía sin tocar datos, Prisma, migraciones ni despliegues.

Este documento aterriza la arquitectura de `world-and-simulation.md` en una propuesta de implementación revisable. La prioridad es introducir una identidad geográfica estable sin acoplarla prematuramente a viajes, negocios, reclamaciones o población.

## 1. Auditoría del contrato actual que condiciona el diseño

Revisión estática de `prisma/contract.prisma` y `package.json` en esta rama:

- El modelo comercial existente es `Business`; su ID es `Int @id @default(autoincrement())`.
- `Business` ya enlaza propietario, puestos, registros de pago, productos, planes de suscripción, inversiones y ventas de propiedades. No tiene actualmente una relación geográfica.
- `BusinessProduct` tiene una relación única por `businessId + itemId`; no debe suponerse que representa inventario independiente por sede.
- Los modelos usan principalmente IDs `Int` autoincrementales, estados como `String`, y fechas `DateTime`. Hay convenciones particulares, incluida `temporal.updatedAt()`, que deben conservarse donde corresponda.
- Existe `AuditLog`, con actor, acción, tipo/ID de entidad, personaje objetivo y detalles. Antes de crear otra bitácora hay que evaluar su reutilización.
- `Item` y sus rutas de imagen usan campos como `imagePath`; esto no demuestra por sí solo qué contrato debe usarse para almacenar mapas.
- `package.json` define `prisma contract emit` en `postinstall` y `prebuild`. La fuente de contrato a revisar es `prisma/contract.prisma`; no se debe crear o editar a mano un `schema.prisma` generado sin respetar ese flujo.

Esta auditoría es estática: no ejecuta comandos Prisma, no inspecciona la base de producción y no confirma el estado de migraciones desplegadas.

## 2. Decisión de alcance

### Primera entrega propuesta: solo WorldLocation

La primera migración debería añadir únicamente la entidad geográfica `WorldLocation`, sus relaciones padre/hijas y los índices estrictamente necesarios.

**No incluir todavía:**
- `TravelConnection`: necesita acordar el contrato de requisitos, direccionalidad y validación de viajes.
- `BusinessLocation`: necesita decidir cómo se comportan las sedes frente a inventarios, puestos, inversiones y precios existentes.
- `CommunicationNode`: requiere modelar red, cobertura y acceso de Red Nova.
- `TerritoryClaim`, asentamientos, población o reinos.
- datos semilla de continentes, ciudades, islas o negocios.

Esto permite validar el contrato geográfico primero y evita una migración inicial que cambie simultáneamente geografía, rutas y economía.

## 3. Contrato candidato de WorldLocation

Los nombres son candidatos de diseño, no un bloque Prisma listo para copiar. Los tipos finales se confirman al preparar la migración.

| Campo | Propuesta | Motivo |
|---|---|---|
| `id` | `Int`, autoincremental | Sigue la convención predominante del contrato actual y ofrece una identidad estable. |
| `name` | texto obligatorio | Nombre visible; no debe ser ID ni exigir unicidad global. |
| `type` | texto obligatorio validado por servidor | Permite continentes, regiones, ciudades, islas, archipiélagos, islas flotantes, barrios, edificios y puntos de interés. |
| `parentId` | entero opcional | Relación autorreferenciada para jerarquía flexible. |
| `description` | texto opcional | Permite crear lugares incompletos sin inventar detalles. |
| `publicationStatus` | estado separado | Distingue borrador, publicado y archivado/oculto; valores finales pendientes. |
| `operationalStatus` | estado separado | Distingue disponibilidad operativa de publicación. |
| `claimability` | estado/regla separado | No inferir reclamabilidad a partir de publicación ni de actividad. |
| `createdAt` | fecha conforme a Prisma actual | Auditoría temporal. |
| `updatedAt` | fecha conforme al patrón aprobado | Elegir el mecanismo de actualización después de revisar la convención del contrato. |
| mapa/imagen | aplazado o referencia opcional | Confirmar el contrato de almacenamiento antes de definir el campo; nunca condicionar la existencia del lugar a tener mapa. |

### Estados y defaults

No fijar enums finales ni valores por defecto solo por comodidad. Antes de migrar, elegir explícitamente:
- estados permitidos de publicación;
- estados operativos permitidos;
- representación de reclamabilidad y sus posibles condiciones;
- comportamiento de los estados desconocidos o antiguos;
- qué datos pueden leer los jugadores y qué datos solo ve Gestión.

Si se opta por estados como cadenas, validar todos los valores en servidor y centralizar constantes/validadores para evitar diferencias de escritura. La base de datos no debe convertirse en una fuente de valores arbitrarios.

### Relación padre/hijas

- `parentId` acepta nulo.
- La relación no exige un árbol completo.
- No permitir que una locación sea su propia ascendiente.
- Validar ciclos al crear y al cambiar el padre; no basta con validar solo en el formulario.
- Definir las combinaciones válidas de tipos padre/hija en una función de dominio revisable. Evitar una regla rígida que impida una isla flotante bajo un agrupador geográfico legítimo.
- No usar el padre como sustituto de rutas, soberanía, propiedad o accesibilidad.

### Borrado y archivo

La política recomendada es archivo lógico para locaciones que ya estén referenciadas. El borrado físico debe bloquearse si hay dependencias. La decisión concreta de `onDelete` se deja para la migración revisable después de comprobar el soporte de la versión Prisma y el comportamiento de claves foráneas.

## 4. Contratos que deben quedar separados

| Entidad futura | Qué representa | Por qué no se incorpora aún |
|---|---|---|
| `TravelConnection` | Ruta explícita entre dos `WorldLocation` | Requiere requisitos evaluables, direccionalidad y flujo seguro de viaje. |
| `BusinessLocation` | Sede física de un `Business` existente | Requiere definir cómo se localizan productos, stock, personal e ingresos sin romper la economía actual. |
| `CommunicationNode` | Torre, satélite, sede global u otro nodo de comunicación | Red Nova necesita además pertenencia a red, cobertura y política de acceso. |
| `TerritoryClaim` | Reclamación/control e historial territorial | Propiedad de negocio, reclamación personal y soberanía política son relaciones distintas. |
| `Settlement` / `PopulationCohort` | Asentamiento y población agregada | Debe diseñarse después de geografía y reglas de simulación. |

Un negocio existente puede permanecer sin sede geográfica hasta que haya una asignación explícita. No crear filas ficticias para rellenar relaciones.

## 5. Servicios y rutas de servidor previstos

Los nombres siguientes son responsabilidades conceptuales, no rutas ni archivos ya existentes.

### Escritura administrativa
- Crear una locación en borrador.
- Editar nombre, tipo, descripción y padre.
- Validar el padre, el ciclo y la compatibilidad de tipos.
- Cambiar publicación, estado operativo y reclamabilidad mediante acciones explícitas.
- Archivar una locación solo tras comprobar sus dependencias.
- Registrar la acción administrativa usando `AuditLog` cuando su contrato sea suficiente.

### Lectura de jugador
- Consultar solo locaciones publicadas conforme a la política de visibilidad.
- No filtrar al cliente información reservada ni asumir que un padre publicado habilita a sus hijas.
- No exponer endpoints de escritura por el mero hecho de ocultar botones en la interfaz.

### Autorización
- Verificar el rol administrativo en servidor usando el mecanismo real del proyecto.
- No confiar en un rol, ID de usuario o estado de permiso enviado por el cliente.
- Revisar las políticas RLS si las tablas se exponen mediante acceso directo desde cliente; no asumir que una tabla nueva hereda seguridad de las existentes.
- Validar referencias y estados en toda escritura.

## 6. Plan de migración revisable (no ejecutado)

1. Confirmar la versión de contrato y las convenciones de Prisma vigentes en la rama.
2. Acordar nombres y valores finales de los campos de `WorldLocation`.
3. Decidir cómo representar y validar estados, mapa opcional y actor de auditoría.
4. Diseñar la relación autorreferenciada y su política de borrado sin cascadas destructivas.
5. Añadir solo el modelo y las relaciones necesarias al contrato en una futura tarea autorizada.
6. Generar una migración explícita y revisarla; no modificar manualmente artefactos generados sin entender el flujo de Prisma Contract.
7. Probar la migración en una base de desarrollo/prueba, nunca usar producción como banco de experimentos.
8. Verificar alta, edición, publicación, archivo, jerarquía y rechazo de ciclos.
9. Verificar permisos de API, acceso de jugador, RLS y registro de auditoría.
10. Comprobar regresión de personajes, negocios, tienda, economía y laberinto.
11. Preparar estrategia de reversión y comprobar qué datos se perderían antes de aplicar cualquier migración.
12. Mantener el despliegue manual; no habilitar despliegues automáticos.

No se debe empezar la fase de sedes o rutas dentro de esta primera migración aunque el diseño conceptual ya esté documentado.

## 7. Matriz mínima de pruebas

| Caso | Resultado esperado |
|---|---|
| Crear ciudad sin mapa ni padre | Se permite. |
| Crear isla flotante sin ruta | Se permite; no se inventa accesibilidad. |
| Editar el nombre de una locación | Conserva el mismo ID. |
| Asignar como padre a sí misma | Se rechaza. |
| Mover una locación bajo uno de sus descendientes | Se rechaza por ciclo. |
| Enviar un tipo o estado desconocido | Se rechaza en servidor. |
| Publicar una locación | No la hace reclamable automáticamente. |
| Marcarla reclamable | No garantiza que cualquier personaje pueda llegar. |
| Jugador intenta crear/editar una locación | Se rechaza en servidor. |
| Usuario no autorizado consulta borradores | No recibe borradores. |
| Archivar una locación referenciada | No se borran dependencias ni historia; se exige resolución explícita. |
| Crear geografía nueva | No altera negocios, inventarios ni saldos existentes. |
| Locación sin hijos, mapa o rutas | Sigue siendo válida. |

## 8. Criterios para considerar lista la fase geográfica mínima

La fase solo se considerará lista cuando:
- el contrato y la migración estén revisados;
- la jerarquía opcional y anti-ciclos estén cubiertas por pruebas;
- publicación, operación y reclamabilidad no se mezclen;
- las escrituras administrativas estén autorizadas en servidor;
- la política de lectura y RLS esté documentada y probada;
- los lugares puedan crearse sin mapa;
- no haya datos semilla ficticios;
- se verifique que no existen regresiones en sistemas actuales;
- haya plan de reversión y aprobación manual de despliegue.

## 9. Decisiones que siguen abiertas

No bloquear la primera entrega por diseñar todo el mundo, pero tampoco fijar supuestos que luego sean difíciles de cambiar:
- vocabulario y valores finales de estados;
- si los nombres deben permitir duplicados en una misma región y cómo resolver búsquedas;
- modelo exacto de permisos y RLS;
- referencia de activos/mapas;
- política definitiva de borrado;
- si la auditoría actual basta para cambios geográficos;
- cómo representar requisitos de acceso de forma declarativa y segura;
- comportamiento de visibilidad cuando un padre está oculto;
- cuándo y con qué operación se asignarán sedes a los negocios actuales.

## Alcance de esta propuesta

Este archivo solo documenta el siguiente paso. No modifica `prisma/contract.prisma`, no crea migraciones, no escribe datos en Supabase, no asigna sedes, no inventa lugares y no despliega código.
