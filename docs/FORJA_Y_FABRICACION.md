# Forja y fabricación administradas — Xahya

## Alcance de este incremento

La herrería y la fabricación comparten el principio del catálogo central de
reparación: **Gestión define qué existe y qué negocios pueden ofrecerlo; los
dueños no pueden inventar fórmulas, estadísticas ni productos**.

El catálogo nuevo se encuentra en
`/management/businesses/crafting` y su API administrativa es
`/api/management/businesses/crafting`, reservada a `ADMIN`.
No modifica la API de reparación ni la producción de objetos por habilidades.

Cada receta contiene:

- ID estable, nombre, descripción, estado activo e identificadores de negocios
  explícitamente autorizados.
- Tipo: **FORGE** para armas, armaduras y accesorios; **FABRICATE** para esos
  tipos y además materiales, consumibles u otros objetos de catálogo.
- **Objeto resultante predefinido** por `item.id`, con `acquisitionType = CRAFTED`,
  no `PROPERTY`, sin asignación `propertyBusinessId`.
- Cantidad de salida 1–10 por encargo.
- 1–8 ingredientes distintos, cada uno un `item` de tipo `MATERIAL`, con
  cantidad 1–100. Los ingredientes deben pertenecer al personaje, estar sin
  equipar y tener cantidades suficientes.
- Tarifa 0–1 000 000 ◈, público o solo el propietario, empleado contratado
  activo opcional.

La definición está en `AppSetting.managed_craft_recipes_v1`, máximo 100 recetas
globales y 12 por negocio. No se crean migraciones SQL y no se publica ninguna
receta por defecto.

### Ciclo de gestión

1. Crear en **Gestión → Objetos** el objeto resultante con origen **Fabricado**.
   Sus estadísticas, efectos, modalidad de arma y propiedades se configuran
   **únicamente en ese catálogo**, no en la interfaz del negocio.
2. Crear o editar la receta en **Gestión → Negocios y empleos → Forja y fabricación**,
   seleccionando el resultado, ingredientes, tarifa y negocios autorizados.
3. Los dueños consultan una lista informativa de recetas asignadas en «Mis negocios»;
   no pueden cambiar precio, materiales, cantidad, destino ni reglas.
4. Los clientes usan `/businesses/crafting`: eligen taller, receta y personaje.
   La UI muestra materiales existentes, tarifa, resultado y posibilidad de encargo.

### Transacción autoritativa

El POST `/api/businesses/crafting` acepta **solo**
`{businessId, recipeId, characterId, requestId}`. Todo lo demás se resuelve
desde el servidor y los catálogos aprobados.

En una transacción:
1. Verifica usuario/propiedad del personaje, bloquea su fila y detecta
   `requestId` repetidos a partir de la auditoría, devolviendo el recibo
   original sin consumir nada más.
2. Rechaza combates activos, negocios inactivos, recetas retiradas o no
   autorizadas, clientes restringidos y requisitos de empleo incumplidos.
3. Bloquea la configuración global de recetas para impedir que una revocación
   coincida a mitad de un encargo.
4. Verifica nuevamente el objeto final `CRAFTED` y cada definición `MATERIAL`.
5. Bloquea recursos y resta cantidades reales mediante actualizaciones SQL
   condicionales sobre las pilas no equipadas de ese personaje.
6. Cobra la tarifa al personaje y la acredita al saldo del negocio.
7. Entrega al inventario copias `characterItem` nuevas: **una fila por cada
   ejemplar de equipo** para conservar desgaste/durabilidad individual, o una
   pila para materiales/consumibles; durabilidad inicial 100.
8. Registra el recibo completo en `auditLog`. Cualquier error revierte todos
   los movimientos de dinero, materiales y objetos.

### Pendientes deliberados

- **Calidad variable y maestría del artesano:** aún no afecta al resultado;
  el producto es el objeto del catálogo. Evita crear bonificaciones arbitrarias
  desde la empresa. Antes de ello habría que usar las estadísticas del
  empleado realmente asignado, junto con una regla central de calidad.
- **Fabricación para inventario del negocio**, costes de aprovisionamiento y
  catálogo de venta posterior: este incremento entrega el objeto al personaje
  que aporta los materiales. No introduce stock infinito ni hace que un
  propietario acuñe bienes desde una configuración.
- **Tiempo de elaboración**, reservas de materiales, puestos y procesos de
  múltiples etapas, desguace y refundición de equipo.
- La administración central de recetas es independiente del editor de
  grafos para habilidades. Las recetas no ejecutan micromódulos arbitrarios;
  la operación permitida es consumir materiales, cobrar y generar
  **exclusivamente** un `item` preaprobado.
