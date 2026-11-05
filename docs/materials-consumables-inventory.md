# Materiales, pociones y persistencia inicial del inventario — Fase 3

## Alcance de esta entrega

La base conserva `public.item` y `public."characterItem"` como fuente de verdad de los objetos
y el inventario. No se crea un catálogo de objetos paralelo.

### Materiales

- `public.material`: nombres únicos, tipos **madera, metal, mineral, líquido, planta, hueso, piel y tela**.
- Parámetros configurables: dureza, resistencia física y resistencia mágica (0 a 1.000.000 de máximo técnico;
  el acero 100 es la referencia, no el máximo), peso por unidad en kg, bonos de ataque/defensa,
  efecto especial y formas natural/mínima/bruta/comercial, reacción a fuego, rayo y hielo.
  La gestión de tipos es dinámica (`/management/material-types`).
- `item.materialId` es **nullable**, con etiqueta visible «Sin definir». Los
  138 objetos existentes inicialmente siguen sin material; no se les inventa uno.
  Si se elimina un material, los objetos permanecen, con `materialId = NULL`.
- Se precargaron 16 materiales. Hierro 80, acero 100, wootz 120, acero oscuro 140 y mitrilo 160
  son valores configurables de resistencia física y dureza. Fresno, tejo y roble
  otorgan un bono de ataque físico +20 **con armas de esa madera** contra objetivos
  que tengan la perk `Cuerpo ethereo` (sin condición racial).
  Los valores desconocidos no se infieren.
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
más baja. El desgaste por **bloquear con un arma** usa ahora la resistencia física
de su material, sin cambiar los HP ni la probabilidad de bloquear:

```text
base = max(1, ceil(potencia_del_ataque / 8))
resistencia = material.resistenciaFisica si es >0; en otro caso 100
desgaste = max(1, ceil(base * 100 / resistencia))
durabilidadFinal = max(0, durabilidadAnterior - desgaste)
```

Por ejemplo, desgaste base 10: hierro (80) gasta 13, acero (100) gasta 10
y mitrilo (160) gasta 7. La resistencia 0 o un material sin definir
se consideran neutros (100) para no dividir entre cero y no volver
invencible al arma. La durabilidad sigue de 0 a 100.
El servidor lee el material cuando se crea el encuentro; el valor queda
en el arma de esa sesión hasta el siguiente encuentro.
Cada mano puede tener una resistencia diferente: el jugador selecciona
el arma que bloquea, y solamente esa copia pierde durabilidad.
El descuento se escribe en el inventario real dentro de la transacción
bloqueada; las sesiones antiguas importan su desgaste acumulado previo.

Por ahora no hay reparaciones, desgaste por atacar, deterioro según dureza
ni un modificador de daño/defensa derivado de la resistencia física o mágica.
El bono específico de arma contra una perk sí es mecánico; los bonos generales
de ataque y defensa siguen pendientes de una fórmula.

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
