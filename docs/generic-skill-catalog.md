# Catálogo de habilidades genéricas

Dependencia: PR #97 (mecánicas declarativas) debe integrarse antes de este PR.

## Objetivo

Ofrecer un catálogo oficial de habilidades genéricas comprables con PCH. La moneda de creación sigue convirtiéndose en **10 PCH** a través de la ruta existente, sin alterar inventario ni economía.

En la ficha, después de consumir una moneda de creación, aparece el selector entre **Crear habilidad personalizada** (con aprobación habitual) y **Comprar habilidad genérica**. La compra también es accesible desde la sección de habilidades si quedan PCH sin consumir.

## Gestión de habilidades

La nueva pestaña **Genéricas** permite crear y publicar plantillas reutilizando el mismo constructor de efectos y mecánicas que las habilidades de personaje.

Cada plantilla tiene nombre, descripción, configuración heredable, estado de publicación y una **plantilla base opcional**. Las plantillas derivadas guardan **solamente los efectos y reglas adicionales**; heredan el conjunto anterior y pueden ajustar sus propios atributos no acumulativos (nombre, duración, coste de maná, etc.).

- Publicar requiere autorización de aprobar habilidades.
- Se prohíben ciclos, habilidades de personaje embebidas en plantillas y especializaciones cuyo precio no incremente la complejidad.
- Las variantes con **Imbuir elemento** pueden ofrecer elegir cualquier elemento no neutro del catálogo administrado. Los efectos variables guardan un marcador de plantilla que se reemplaza en el servidor.
- No se insertan plantillas por defecto. Para dar de alta Revestimiento de Maná y su variante elemental, el administrador debe crearlas en Gestión.

## PCH, compra y evolución

La compra usa el mismo motor de cálculo que las mejoras de habilidades existentes; el precio se **recalcula en el servidor** al confirmar, tomando en cuenta efectos, maná, alcance, velocidad, condiciones, descuentos de requisitos y mecánicas declarativas.

La compra de una plantilla raíz verifica su publicación, requisitos, saldo PCH; debita PCH y crea una habilidad APPROVED en una transacción, guardando origen, elemento elegido y auditoría.

La compra de una especialización requiere tener aprobada la habilidad base procedente del catálogo y desactivarla antes de evolucionarla. El precio es el total calculado de la especialización menos el total calculado de la base (mínimo 1 PCH). Se actualiza la **misma habilidad** sin duplicar efectos de la base, manteniendo la identidad y el elemento.

Las compras concurrentes se serializan mediante bloqueo de la fila del personaje y cargo atómico. Se rechazan compras repetidas y versiones inferiores de habilidades evolucionadas. Las compras crean un snapshot; cambios futuros en el catálogo no alteran lo adquirido.

## Efecto Imbuir elemento

ELEMENTAL_IMBUE es un tipo de efecto configurable, valorado con PCH y elemento explícito. Al activar una habilidad con ese efecto, se registra un estado ELEMENTAL_IMBUE con el elemento y destino configurados; se renueva mientras siga activa y se elimina al desactivarla.

Por ahora **no incrementa automáticamente el daño ni cambia la física del combate**: atribuye el elemento al revestimiento, arma, armadura o habilidad para usarlo posteriormente en reglas y resolutores. No se deben prometer efectos térmicos, eléctricos o de resistencia sin una regla ejecutable adicional.

## Despliegue

1. Aplicar primero la migración y el motor declarativo del PR #97.
2. Aplicar la migración supabase/migrations/20261102125500_generic_skill_catalog.sql.
3. Regenerar el contrato ORM con npx prisma contract emit y verificar tests, TypeScript y build de producción.
4. Probar publicación, compra de base, elección de elemento, evolución y rechazo de compra repetida.

La migración no crea ni modifica habilidades existentes por sí misma.
