# XAHYA — D4.3: proteger el precio PCH de habilidades modulares aprobadas

Fecha: 10 de noviembre de 2026.
Base: `d4b3a1096c37278c8e265dc05f2b5c1865761021`, D4.1 + D4.2.

## Hallazgo de auditoría

La gestión de habilidades comprueba el precio definitivo de un efecto `COMPOSED`
al aprobarlo. Sin embargo, la edición posterior de una habilidad **ya aprobada**
bloqueaba únicamente cambios directos al conjunto de efectos. Era posible
conservar los mismos nodos y modificar alcance, duración, velocidad, cooldown,
maná u otras mecánicas sin pasar de nuevo por una valoración PCH.
Además, si se eliminaba el único `COMPOSED`, el booleano basado únicamente
en el nuevo efecto dejaba de proteger la ruta de edición y aprobación.

Esto es un **riesgo identificado en la implementación**; no constituye una
afirmación de que algún jugador lo haya explotado.

## Corrección incluida

1. Se compara el contrato anterior y el nuevo: efectos/conexiones, reglas,
   requisitos, maná, mantenimiento, acumulación, categoría, duración,
   recuperación, velocidad, alcance, tipos de combate, condición y PCH.
2. Una habilidad aprobada que tenga o haya tenido un efecto `COMPOSED`
   requiere la operación de **revisión/aprobación** para modificar cualquiera
   de esas propiedades. Cambiar solo nombre o descripción sigue permitido.
3. La ruta de aprobación recalcula en el **servidor** el precio PCH exacto
   de la habilidad completa, incluso cuando el nuevo conjunto elimina
   todos los módulos `COMPOSED`.
4. La revisión se repite después de bloquear la fila dentro de la
   transacción, para impedir una modificación gratuita concurrente.
5. Se preserva el control de saldo PCH no negativo en transiciones que
   incluyan o retiren efectos modulares.
6. La comparación ignora el orden de las claves de objetos JSON, sin
   ignorar cambios funcionales de contenido.

Las fórmulas y precios no se alteran y ningún personaje recibe recursos.
No se habilitan resolutores nuevos ni se concede permiso a grafos no revisados.

## Comprobaciones

`tests/combat-d4-3-modular-approval-pricing.test.mjs` verifica cambios
de todos los campos protegidos, eliminación del único `COMPOSED`,
cambio solo de nombre/descripcion, reordenación inofensiva de claves,
operación de aprobación/rechazo y lectura del guardado transaccional.

También se ejecutan `Combat validation` y `Automated tests`
(incluidos TypeScript, tests y build) antes de autorizar fusión.

## Pendiente en D4

- Pruebas visuales de flujo completo a 320 px, 390 px y escritorio.
- Estados activos y narración de invocaciones con origen/duración.
- Más tests de concurrencia con base de datos real y saldo PCH,
  incluidos dos aprobadores simultáneos.
- Previsualización clara de diferencias de cotización en administración.

**Estado de esta PR:** pendiente de fusión; no desplegar ni cambiar
la configuración de despliegues automáticos de Vercel.
