# XAHYA — D3.3: HP reales, protección y desgaste por canal

Fecha: 9 de noviembre de 2026. Basado en la PR #223, fusionada en
`2d36c8b5876d6f9f7d705f8499a8db0062ceaef8`.

## Problema detectado

D3.2 ya descontaba HP como suma de daño físico y mágico con
resistencias independientes, pero `applyWearableOnConfirmedHpHit`
recibía el `pending.usesMagic` del golpe, siempre `false` cuando
la magia está imbuida en un contacto físico. Esto producía dos errores:

1. La armadura con desgaste configurado para MAGICAL no respondía
   a la fracción mágica que sí había perdido HP.
2. La armadura con desgaste solo PHYSICAL tomaba como daño físico
   la totalidad del golpe, incluso su parte mágica.

No se debía arreglar llamando dos veces al desgastador: los objetos
con regla `ALL` podrían sufrir desgaste doble y las piezas rotas
podrían invalidar bonificaciones más de una vez.

## Solución

El motor ya calcula el daño de **cada canal después de todas las
defensas y coberturas**. Antes de descontar HP, obtiene el daño
efectivamente perdido, que puede ser menor que el daño nominal de un
golpe letal.

`attributeActualHpDamage` divide el HP realmente perdido entre
físico y mágico **en proporción al daño que sobrevivió las defensas**,
redondeando al entero más cercano y con empate determinista a favor
del componente físico. Conserva exactamente la suma original y nunca
atribuye más daño a un canal del que causó. Rechaza entradas negativas,
fraccionarias, no finitas o que excedan el daño real.

Un ejemplo donde el ataque resuelve 60 físico + 40 mágico contra
alguien con solo 5 HP: se pierden 3 HP físicos y 2 HP mágicos. El
sistema **no** desgasta la armadura como si el enemigo hubiera
perdido 100 HP.

`equipmentWearFromAttributedHit` aplica la regla específica del
objeto: PHYSICAL usa el HP físico atribuido; MAGICAL, el mágico;
ALL usa la suma real **una sola vez**. La ejecución conserva el
desgaste por copia única (`characterItemId`), los ajustes de
bonificaciones y la lógica de ruptura, autorreparación y persistencia.

La ruta antigua `applyWearableOnConfirmedHpHit(state, ..., magic)`
continúa vigente para todos los ataques históricos de un canal.
La ruta híbrida pasa un desglose opcional validado.

## Resultado visible

El registro `RESOLVE` añade, únicamente cuando se resuelve un golpe
híbrido:

- `damageChannels`: daño físico/mágico luego de defensas y cobertura,
  antes del límite por HP del oponente;
- `hpDamageChannels`: HP realmente quitado por canal, teniendo en
  cuenta el HP disponible;
- `mitigatedChannels`: cuánto mitigaron las resistencias
  estadísticas, separado por canal **tras aplicar cobertura**.

El resumen narrativo final indica que fue un solo golpe con dos
contribuciones. Si hubo daño letal excesivo, aclara cuántos HP
existían para descontar. Los mensajes `EQUIPMENT_WEAR` describen
la cantidad de HP del canal que activó el desgaste, no el total
del ataque por error.

Los parámetros internos siguen ocultos mientras el ataque está
pendiente. Solo aparece el desglose después de la respuesta del
defensor. No se altera la geometría, el coste, la iniciativa ni la
reflexión de los espejos.

## Validación simulada

`tests/combat-d3-3-hybrid-channel-wear.test.mjs` cubre:

- Reparto determinista de miles de casos enteros y rechazo de
  daños corruptos.
- Desgaste separado de equipos PHYSICAL, MAGICAL y ALL.
- Golpe real, con una sola acción y una sola ruta de ejecución.
- Exceso de daño letal con HP bajo: desgaste solo por HP real.
- Bloqueo físico, campo mágico, barrera completa y fallo del ataque.
- Compatibilidad de ataques antiguos y registro de la crónica.
- Consistencia entre daño, mitigación y desglose.

## Límites posteriores (D3.4)

No se habilitan todavía ataques de largo alcance multicanal, áreas,
módulos hostiles por canal, daños elementales combinados ni
reacciones independientes. Tampoco hay cambio de cotización PCH
ni de inventario real.

La siguiente etapa puede trabajar en **efectos posteriores al impacto
por canal** (por ejemplo, estados activados por componente, cuando
la habilidad de ese tipo sea aprobada), sin permitir que una descarga
mágica sin daño genere debilitamientos gratuitos.
