# XAHYA — D4.5: presupuesto PCH real y experiencia móvil

Fecha: 10 de noviembre de 2026. Base: `d5af9e4d4d3cd39925b1214d54cea1f6b4775e5d` (D4.4).

## Comprobación de la economía existente

- **Moneda de creación:** 10 PCH, definido en `PCH_PER_COIN`.
- **Moneda de mejora:** 5 PCH y un crédito de mejora, definido en `PCH_PER_UPGRADE_COIN`.
- Los PCH forman un **saldo acumulable**; 10 PCH no es un límite de costo por habilidad.
- La creación reserva el PCH **provisional** y exige saldo suficiente. El valor revisado de un efecto modular puede ser mayor o menor al aprobar, con liquidación transaccional.
- La mejora únicamente paga `total nuevo − total anterior` cuando la diferencia es positiva.

## Corrección de experiencia

El modal muestra las cantidades relevantes sin ocultarlas detrás del botón de detalles:
presupuesto inicial de una moneda, PCH a reservar o incremento de mejora,
saldo real disponible, saldo restante y una causa visible si no alcanza.
Para módulos `COMPOSED` sin precio revisado, avisa que la estimación puede
variar en administración.

El desglose de mejoras ahora enseña correctamente **el incremento** como importe
a pagar, en lugar de restar el precio completo del saldo. El detalle compara el
precio con los 10 PCH de la moneda de creación o con los 5 PCH de mejora,
sin afirmar que la habilidad deba costar exactamente ese monto.

### Ejemplos con escala real

| Situación | Coste presentado | Saldo 10 PCH |
| --- | ---: | ---: |
| Una acción modular provisional sin descuento | 5 | Restan 5 |
| Esa acción si requiere contacto obligatorio | 4 | Restan 6 |
| Una acción con solo restricción de vida baja (15 %) | 5 | Restan 5; descuento redondeado a cero |
| Habilidad de 11 PCH | 11 | Falta 1; se puede acumular otro PCH |
| Mejora de 22 a 27 PCH, con saldo 5 | Incremento 5 | Saldo posterior 0 |

La tabla muestra costes **antes de ajustes de alcance, maná, duración,
requisitos y precio definitivo de revisión**, por lo que una habilidad real
puede quedar más cara o barata que el paso modular aislado.

La restricción de vida baja del 15 % puede resultar inútil en importes bajos
por redondeo. Se deja identificada como pendiente de **balance D4.6**:
no se cambia la fórmula aprobada en D4.4 ni se alteran retrospectivamente
las habilidades ya aprobadas en esta entrega.

## Móvil y verificaciones

- Barra superior de coste pasa a columnas en móvil y no obliga a mantener una
  única línea horizontal; controles adaptables a 320/390 px.
- Diálogo y desglose usan alturas relativas al viewport, con scroll dentro
  del contenedor en pantallas bajas.
- Tests unitarios y aserciones de estructura sobre cotización, saldo,
  mejoras, avisos de PCH provisional y clases de layout.
- **Pendiente aún:** verificación visual *real* mediante captura y uso en 320,
  390 px y escritorio, accesibilidad del modal con lector de pantalla y
  pruebas integradas con sesión autenticada. Los tests estructurales no
  sustituyen estas inspecciones.

Sin modificaciones de datos ni despliegue automático. La PR D4.5 se deja
abierta para una siguiente autorización.
