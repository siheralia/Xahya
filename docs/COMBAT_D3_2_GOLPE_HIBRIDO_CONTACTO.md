# XAHYA — D3.2: primera técnica híbrida real, golpe imbuido

Fecha: 9 de noviembre de 2026. Base: PR #221 fusionada, commit
`88a6c038a414987f6243b405221b9b80ff83f40b`.
**El sistema de despliegue automático sigue desactivado.**

## Contrato de esta primera entrega

Se permite **solo un ataque físico de contacto imbuido con magia**, no
un hechizo que dispara dos proyectiles ni un área capaz de atravesar
obstáculos de forma independiente.

Un único trazo físico se compara contra la geometría del rival:
un **impacto**, una reacción, una tirada de crítico y **un coste** de maná,
PA, ticks y cooldown. La misma condición de contacto rige la entrega
de ambas componentes de daño.

Ejemplo de habilidad sintética, sin otorgar habilidades a jugadores:

- Nombre: «Puño imbuido».
- Ofensiva, aprobada con fecha y `pchCost` revisados.
- Tipo contundente, área «Contacto | Alcance máximo: 2 m».
- Duración «Instantánea», maná 10.
- Efecto `DAMAGE_MULTIPLIER` 60 % de `PHYSICAL_ATTACK`.
- Efecto `DAMAGE_MULTIPLIER` 40 % de `MAGIC_ATTACK`.

El usuario puede elegir proporciones entre 25/75 y 75/25
en puntos enteros, **siempre sumando exactamente 100 %**.
No son dos técnicas al 100 %: el golpe distribuye su potencia
para evitar multiplicar arbitrariamente el daño total.

## Resolución

La implementación reutiliza `resolveDamageChannels` de D3.1.
En el daño físico se usan ataque y defensa físicos, factores de
tipo y resistencias raciales físicas. En el daño mágico se usan
ataque y defensa mágicos, el tipo del campo defensivo y las
resistencias raciales mágicas.

Las reacciones son **una sola elección**, con protección coherente:

- **Esquivar/Desviar:** si evita el contacto, evita ambas partes.
- **Bloquear con arma, escudo o manos:** amortigua la parte física,
  pero no genera automáticamente un campo mágico adicional.
- **Campo mágico:** amortigua la parte mágica, no anula el impacto
  físico por arte de magia.
- **Resistir/Repeler:** actúa sobre el contacto común; se
  conservan las reglas actuales de desplazamiento.
- **Construcción de bloqueo:** el defensor puede absorber el golpe
  conjunto. Su resistencia y durabilidad enfrentan la presión
  de ambas componentes sumadas.
- **Cobertura material medida por el trazo 3D:** intercepta
  el contacto completo. Si bloquea todo, ningún canal daña HP.
  Si deja pasar parte, esa misma fracción se aplica a cada
  canal por separado, con redondeos propios y un único desgaste.
- **Contraataque:** conserva la respuesta simultánea existente;
  el daño físico y mágico del golpe principal no ejecuta
  dos contraataques.
- **Espejos:** *no* reflejan esta técnica porque no hay rayo
  mágico que viaje separado: la energía está ligada al golpe
  cuerpo a cuerpo. Los rayos mágicos anteriores siguen usando
  su interceptación habitual, sin cambios.

Los estados, construcciones, habilidades mágicas de objetivo único,
reacciones y ataques básicos anteriores conservan sus contratos.
No se acepta lanzar el golpe imbuido contra criaturas, espejos
ni un centro de área independiente del trazo.

## Contrato de habilitación y privacidad

Se requiere:
- `status: APPROVED`, `approvedAt` y `pchCost > 0`;
- coste de maná positivo, sin acumulación/mantenimiento;
- exactamente dos efectos numéricos de daño, uno de cada canal,
  sin otros campos, elementos, multiplicadores o estados ocultos;
- tipo contundente; área Contacto explícita; máximo 1 o 2 metros;
- condición narrativa vacía y mecánicas vacías, salvo vínculo
  `parentSkillId` ya validado por el catálogo;
- instantánea y cooldown conocido;
- desactivación individual respetada tanto en el catálogo como en
  la transacción de combate; `LEGACY_ONLY` rechaza técnicas nuevas.

La división del daño se compila desde la habilidad aprobada en
el servidor, nunca desde el navegador. Durante el ataque pendiente,
`combatClientView` elimina la división privada; el log de
`RESOLVE`, **tras** la defensa, informa el daño físico, mágico y
total en español.

La implementación no crea una nueva economía de PCH ni altera
fichas reales: utiliza la aprobación existente.

## Validación y límites

`tests/combat-d3-2-hybrid-contact.test.mjs` incluye casos
de recursos únicos, duplicación de requestId, cadencia, defensa
independiente, esquiva, barreras fuertes y frágiles, construcción,
espejos, precios no revisados, geometría, datos y áreas forjadas,
privacidad y estado de activación del personaje.

No se habilitan todavía ataques a distancia con dos proyectiles,
áreas híbridas, magia elemental de múltiples geometrías,
efectos hostiles COMPOSED sobre cada canal, familiares, ni
ataques que dividan la trayectoria en varios impactos. Estos
necesitan contratos separados de intercepción, daño y gasto.

## Continuación D3.3

Revisar la atribución del daño por canal en efectos posteriores
(desgaste de equipos, resistencia elemental, estados y narración),
y definir la siguiente clase de ataques mixtos **sin saltarse**
los obstáculos físicos ni la reflexión de rayos mágicos.
