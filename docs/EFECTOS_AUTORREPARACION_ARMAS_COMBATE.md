# Autorreparación modular de armas — primera integración de combate

Esta fase reutiliza **Leer objeto** (`READ_ITEM`), **Leer estadística** (`READ_STAT`), **Calcular** y **Restaurar durabilidad** (`REPAIR_DURABILITY`), implementados para habilidades manuales en PR #166 y #167.

## Configurar un arma (Gestión → Objetos)

1. Edita o crea un **arma**. Las armaduras y accesorios tendrán adaptadores propios más adelante; no se activan por accidente con este efecto.
2. Activa «Autorreparación de esta arma».
3. Elige **maná por activación** entre 1 y 1000 (obligatoriamente positivo) y **cada cuántos turnos** entre 1 y 50.
4. En el constructor visual, conecta `READ_ITEM SOURCE_ITEM` → `REPAIR_DURABILITY.target` y una expresión numérica a `REPAIR_DURABILITY.amount`. Ejemplo: leer `MAGIC_DEFENSE`, multiplicar por `0.1`, restaurar esa cantidad. También se admite una constante.
5. Guarda el objeto con permiso de gestión. Solo las configuraciones validadas por el servidor se almacenan.

**No admite** objetivos ajenos, `HEAL`, daño, acciones arbitrarias, reservas `STORE/CONSUME`, eventos inventados o fuentes externas. No permite un efecto sin gasto de maná ni con intervalo cero.

## Ejecución en encuentros

- En el **inicio de un nuevo turno completo de combate**, el motor examina las armas de ambas manos capturadas al comenzar el duelo. El primer disparador posible es el **turno 2**; con intervalo 2 vuelve a dispararse en los turnos 4, 6, etc.
- Se ejecuta únicamente cuando la pieza siga en una mano, tenga durabilidad menor de 100 y el personaje disponga de maná suficiente en la **reserva del encuentro**. Si no hay desgaste o no hay maná suficiente, no se consume maná ni cambia la durabilidad.
- La fuente `SOURCE_ITEM` no es un número elegido por el cliente: señala el `characterItemId` real del arma que contiene el efecto. El intérprete no puede aplicar reparaciones a otra copia.
- La cantidad restaurada es **entera** y el resultado se limita a **100**. Un arma que se rompió a 0 puede autorrepararse al cumplir su disparador.
- El efecto no consume PA extra porque se paga mediante su **maná positivo**, y respeta el intervalo indicado. La operación aparece en el registro del combate como `WEAPON_REPAIR`.
- Los cambios del mismo turno se guardan en la transacción que serializa el combate, en la fila `characterItem` correcta: daño y reparación del mismo evento se contabilizan una sola vez, en lugar de usar solamente `LEAST` (que impediría toda restauración).
- El efecto **no se activa** al abrir la ficha, consultar inventario, renderizar el HUD, equipar/desquipar ni reintentar una acción ya procesada.

## Límites deliberados

- Solo armas equipadas; los objetos del suelo no se reparan durante el encuentro, y los NPC sintéticos no tienen inventario real.
- Los efectos se fijan al comenzar el encuentro. Cambiar la definición del catálogo durante un duelo no cambia ese duelo a mitad del combate.
- No se añaden tablas, migraciones, habilidades gratis, servicios de taller ni recetas. Los talleres y la forja utilizarán un adaptador transaccional específico, con tarifas y materiales configurables. La autorreparación de armaduras, accesorios y el tiempo fuera de combate quedan como próximos incrementos.
- El maná gastado es el del encuentro, siguiendo la regla actual de que la reserva de combate es una instantánea. No se cobra una segunda vez al inventario.
