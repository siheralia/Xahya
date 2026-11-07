# Servicios de reparación: negocios, herreros, materiales y micromódulos

Este hito sigue las PR #168 (autorreparación de armas) y #173 (armaduras y accesorios). No modifica el combate ni requiere migraciones.

## Administración de servicios (Mis negocios)

Cada **propietario** de negocio, o un administrador del sistema, puede publicar hasta 12 servicios independientes desde `/businesses`:

- Nombre, descripción y estado disponible/inactivo.
- Tarifa en ◈ de **0 a 1 000 000** por activación.
- Opcionalmente, un objeto de catálogo de tipo **MATERIAL** y su cantidad **1–100**. Los materiales los entrega el personaje cliente desde sus propias pilas.
- Permiso de clientes: **Público** o **solo el personaje dueño del negocio**.
- Requisito opcional de **al menos un empleado contratado y activo** en un puesto activo del negocio.
- Fórmula visual de micromódulos con `ACTIVATE`: `READ_ITEM SELECTED_ITEM`, `READ_STAT USER`, `CALCULATE`, `REPAIR_DURABILITY`. El servidor enlaza el objeto real seleccionado y solo las estadísticas del propietario del taller. No se pueden ejecutar otros efectos, usar selectores de otro personaje ni recuperar durabilidad con dinero y materiales ambos a cero.

Los servicios se almacenan por negocio en la tabla ya existente `AppSetting`, con clave `business_repair_service_v1:<id>`; las escrituras serializan por el negocio. No hay tablas nuevas ni cambios de esquema.

## Contratar reparación (Catálogo de negocios → Talleres de reparación)

1. Elegir negocio, personaje propio, oferta y ejemplar dañado.
2. El servidor verifica que el personaje pertenezca al usuario, el negocio esté activo, la oferta sea válida y activa, el cliente tenga permiso y, si se pide, haya personal contratado activo.
3. Se comprueba que el ejemplar sea **una copia real**, no una pila, de tipo `WEAPON`, `ARMOR`, `ACCESSORY` u `OTHER`, con durabilidad menor que 100, fuera de todo combate (incluido el lado rival de PvP).
4. La fórmula se evalúa sobre esa copia y sobre las estadísticas efectivas actuales del propietario, con la autorización del servidor. Debe restaurar al menos 1 punto.
5. Se bloquea el saldo del cliente, se exige dinero suficiente, se bloquean y consumen las pilas necesarias del material no equipado, se acredita la tarifa al negocio, se actualiza la durabilidad **de esa misma copia** hasta un máximo de 100 y se crea la auditoría.

Todos esos pasos suceden dentro **de una sola transacción**. Un material insuficiente, objeto cambiado, falta de permiso, falta de personal o fórmula inválida revierten el conjunto completo: no hay cobros parciales.

Un `requestId` estable evita que un reintento tras perder la respuesta HTTP vuelva a cobrar o a reparar. La misma clave usada para cambiar negocio, servicio u objeto es rechazada en lugar de crear una segunda reparación.

**No se cobra maná del cliente**: aquí la contraprestación es dinero o materiales, distinta de una habilidad manual y de los pasivos de combate.

## Limitaciones deliberadas

- La tarifa se transfiere **al saldo del negocio**. Los materiales se consumen del cliente; no se crea todavía un almacén de materiales de negocio ni recetas de forja.
- El reparador cuya estadística se consulta es, en esta versión, el **propietario**. El requisito de un empleado contratado no cambia todavía la fuente de estadísticas; una fase posterior puede incorporar elección del artesano y experiencia del oficio.
- No hay recorrido físico ni horarios de apertura de talleres. El requisito de empleado verifica un contrato activo, no un fichaje en tiempo real.
- La reparación conserva las demás reglas existentes para habilidades y autorreparación. No constituye una manera de reparar durante combate.
- Los servicios solo se pueden gestionar desde el panel del dueño del negocio, no mediante parámetros arbitrarios del cliente.
