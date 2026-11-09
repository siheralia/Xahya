# Hito: desgaste y autorreparación de armaduras y accesorios

Este incremento parte del despliegue de PR #168 y de las invocaciones de #172 en `main`.

## Editor de objetos (Gestión → Objetos)

- Armas, armaduras y accesorios comparten el **mismo micromódulo de autorreparación**: `READ_ITEM SOURCE_ITEM` → expresión/estadística → `REPAIR_DURABILITY`. Cada activación cuesta **1–1000 de maná** y solo se ejecuta al comienzo de rondas de combate según el intervalo **1–50 turnos**.
- En armaduras y accesorios hay además un efecto optativo **Desgaste por impacto recibido**, independiente de la autorreparación. El administrador elige porcentaje entero **1–100% del HP realmente perdido** y canal **físico, mágico o ambos**.
- Las reglas se validan tanto al crear como al editar objetos, y se guardan en el JSON de `Item.effects`. Un objeto puede tener un efecto de cada categoría. Nunca se admiten disparadores de autorreparación gratuitos o selectores ajenos.
- Ningún objeto antiguo se desgasta automáticamente por este cambio. Hay que activar explícitamente su regla en Gestión.

## Qué pasa en combate

- Al crear un duelo, el servidor registra cada copia real con `characterItemId`, categoría `ARMOR`/`ACCESSORY`, ranura real admitida por el catálogo, durabilidad inicial y efectos permitidos. También se respetan configuraciones válidas no convencionales, como escudos clasificados como armadura en la mano secundaria.
- Un impacto confirmado que **reduce HP** desgasta las piezas con regla compatible: `min(durabilidad, max(1, ceil(HP_perdido × porcentaje / 100)))`. Es un efecto sobre la **durabilidad**, no una modificación del daño a HP o de las estadísticas del personaje.
- Esquivas, fallos, impactos con daño íntegramente absorbido o un canal distinto no causan desgaste. La durabilidad inicial de los objetos sin esta configuración se conserva.
- Al iniciar una ronda autorizada, la autorreparación toma solo la copia dueña del efecto, nunca otra pieza con el mismo nombre; si tiene maná suficiente, restaura hasta 100 y descuenta el maná en la instantánea del combate. No gasta PA ni ticks.
- El motor mantiene separados los eventos de desgaste y reparación, y los cambios se persisten durante la **misma transacción de sesión**, contra la fila original y comprobando la propiedad del personaje. Un desgaste normal no se convierte en restauración involuntaria.
- El inventario de la ficha y la tienda muestran la durabilidad y describen ambos efectos como reglas, no como estadísticas numéricas.

## Límites explícitos

- El desgaste se integra en el resolutor de **impactos directos a personajes**. Los reflejos mágicos, colisiones de otros objetos y acciones ambientales tienen resolutores específicos; su integración como fuentes de desgaste queda para una siguiente fase.
- Un objeto con durabilidad 0 no recupera capacidad automáticamente salvo por un efecto de reparación válido. **Actualización (PR #207–#210):** al romperse, los bonos directos, multiplicadores derivados y atributos básicos compatibles con el modelo exacto del encuentro se retiran; al repararse regresan. Los máximos de HP/maná también se recalculan cuando el replay está validado, pero **la reparación nunca rellena gratis las reservas**. Los encuentros antiguos o fórmulas incompatibles conservan el fallback seguro de su versión anterior.
- El estado de equipo se captura al crear el duelo. Cambios de equipamiento fuera de él no actualizan mágicamente ese snapshot, igual que ya ocurría con armas.
- No se crean recetas, talleres, recuperación fuera de combate ni tablas/migraciones nuevas.
- La autorreparación consume **maná del encuentro**, acorde con el comportamiento vigente de combates de Xahya. No modifica la reserva de maná de la ficha.

## Interfaz de combate (auditoría posterior)

La pantalla de combate muestra primero la **instantánea real de equipamiento**, con durabilidad individual, ranura, condición rota/desgastada, canal y porcentaje de desgaste opcional, autorreparación y su coste y próxima ronda válida. Los cambios registrados en la ficha se muestran aparte porque no modifican retroactivamente el equipo en un duelo ya iniciado. El HUD alerta al usuario sobre piezas rotas y el historial explica el antes/después de los recursos. Consulta `docs/COMBAT_FASE_C_AUDITORIA_INTERFAZ_2026-11-08.md` para matriz de acciones y cobertura de pruebas.
