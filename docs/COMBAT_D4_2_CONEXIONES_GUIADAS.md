# XAHYA — D4.2: conexiones del editor modular comprensibles

Fecha: 10 de noviembre de 2026. Base: `main` en `6c6f05f3`.
Esta mejora es independiente de D4.1, PR #230.

## Problema observado

Antes de D4.2, el editor React Flow solo llamaba a `isValidConnection` y
rechazaba una unión incompatible sin explicar a una persona por qué falló.
En móvil (320/390 px) el zoom y los puntos de conexión pequeños también
pueden dificultar arrastrar un enlace.

## Comportamiento

- Debajo del diagrama hay un **asistente de conexión sin arrastre**,
  utilizable con teclado: origen → destino → entrada.
- El origen muestra el nombre descriptivo del módulo y su salida.
  La entrada muestra su tipo: valor, objeto, objetivo o estadística.
- Un comprobador puro comparte las reglas existentes del editor React Flow:
  solo salidas reales de pasos anteriores y tipos coincidentes. Se indica
  en español si falta una salida, si el destino está antes del origen, si
  falta una entrada o si hay incompatibilidad de tipos.
- Al finalizar un arrastre fallido se informa al usuario en el editor;
  el asistente permite identificar y corregir incompatibilidades.
- El asistente invoca **la misma acción `onConnect`** que el cable visual,
  conserva el guardado normal y no modifica los tipos persistidos,
  la ejecución, los precios, PCH ni los permisos.
- React Flow mantiene su diagrama y la validación del servidor sigue
  siendo autoridad definitiva al guardar y aprobar.

## Pruebas y límites

`tests/combat-d4-2-micro-connection-feedback.test.mjs` cubre conexiones
válidas, orden, entradas inexistentes, incompatibilidad tipada,
solo lectura, salida faltante y presencia de accesibilidad.

Esta entrega **no garantiza aún** que el diseño de grafos amplios funcione
visualmente sin problemas a 320/390 px. Hace falta recorrido real con
un personaje autorizado, capturas móvil/escritorio, teclado y lector de
pantalla; el ajuste de zoom y tamaño de nodos queda en el backlog de D4.

No se habilitan resolutores nuevos, ejecución sin aprobación ni efectos
adicionales. Los precios de PCH y sus controles de integridad son la
siguiente línea de auditoría de D4.
