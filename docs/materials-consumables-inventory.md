# Materiales, pociones y persistencia inicial del inventario — Fase 3

## Alcance de esta entrega

La base conserva `public.item` y `public."characterItem"` como fuente de verdad de los objetos
y el inventario. No se crea un catálogo de objetos paralelo.

### Materiales

- `public.material`: nombres únicos, tipos **madera, metal, mineral, líquido, planta, hueso, piel y tela**.
- Parámetros configurables: dureza, resistencia física, resistencia mágica (0 a 100),
  peso por unidad en kg (opcional), referencia de ataque/defensa, descripción,
  efecto especial y formas natural/mínima/bruta/comercial, reacción a fuego, rayo y hielo.
- `item.materialId` es **nullable**, con etiqueta visible «Sin definir». Los
  138 objetos existentes inicialmente siguen sin material; no se les inventa uno.
  Si se elimina un material, los objetos permanecen, con `materialId = NULL`.
- Se precargan 16 materiales de las imágenes compartidas. La ventaja contra espíritus
  de tres maderas se almacena como descripción, **no** se suma al ataque. Durezas,
  pesos, defensas y bonos desconocidos quedan sin especificar o en cero.
- `/management/materials` y API de gestión autorizada, con campos en español.
  `management.materials` se agrega al catálogo de permisos; mientras los roles
  se actualizan, quienes tengan permisos de `management.items` conservan acceso
  equivalente a CRUD para no bloquear el editor.
- El selector de material del editor de objetos obtiene los materiales de la base de
  datos; al crear un material, queda disponible en el próximo refresco del editor.

### Consumibles

| Objeto | Precio base | Acción |
|---|---:|---|
| Poción de salud (10 HP) | 1200 | Recupera hasta 10 HP, sin sobrepasar el máximo |
| Poción de maná (20) | 1500 | Recupera hasta 20 de maná, sin sobrepasar el máximo |

Las dos se añaden a la **tienda general existente** como `PURCHASABLE`;
las promociones o descuentos existentes siguen siendo responsabilidad de la tienda.
Se usan **en combate**, con una acción real y un PA/ticks de velocidad neutra;
no se aplica el modificador de contundente/corte/perforación. Una petición
reintentada conserva idempotencia. Las unidades del personaje se descuentan
en la misma transacción bloqueada que la sesión, con un `UPDATE` condicional
que rechaza existencias agotadas.

Un NPC de entrenamiento recibe **una poción de cada tipo**, con elección aleatoria
entre recetas del catálogo, y decide de manera aleatoria si las usa cuando tenga
HP o maná por recuperar; no recibe ni pierde objetos persistentes.
En PvP, cada personaje obtiene una copia de la lista real de consumibles
al iniciar el combate y gasta sus unidades persistentes al usarlas.

### Durabilidad

Se añade `characterItem.durability` (0–100, por instancia/copia). Las armas
equipadas cargan ese estado al empezar el duelo y la **pérdida existente al
bloquear** se escribe en la tabla real, dentro de la transacción del combate.
Se usa `LEAST` para evitar que un encuentro paralelo restaure una durabilidad
más baja. No hay aún reparaciones, deterioro pasivo por golpes, desgaste
diferenciado por material ni nuevas fórmulas de balance. Los efectos de ataque
y defensa procedentes del material **no** se aplican sin una fase específica
de precios y equilibrio.

## Migración requerida y seguridad

1. **Antes de desplegar código**: aplicar `supabase/migrations/20261105160614_materials_and_potions_20261105152000.sql`
   mediante el flujo de migraciones de Xahya y comprobar que aparece
   `public.material`, `item.materialId`, `characterItem.durability` y dos
   pociones comprables. Repetir comprobaciones con consultas de solo lectura.
2. La tabla `material` tiene RLS activo y se revocan privilegios de Data API;
   el CRUD requiere autenticación Clerk y permisos del servidor. Los nuevos
   valores no deben exponerse mediante permisos públicos de escritura.
3. Validar que `prisma contract emit`, `npm test`, TypeScript y `npm run build`
   continúan correctos con el esquema actualizado. Revisar pruebas de
   combate, inventario, tienda y roles antes de fusionar.
4. Tras integrar a `main`, verificar el despliegue Vercel en estado READY y
   comprobar desde una cuenta autorizada que el selector y la tienda muestran
   los datos y que los consumibles cobran unidades reales.

**Nota de compatibilidad:** un preview sin esta migración en su base de datos
puede compilar perfectamente pero fallar al consultar el catálogo.
La migración no se aplica automáticamente por crear o fusionar una PR.

**No fusionar hasta autorización explícita de la usuaria.**
