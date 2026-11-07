# Xahya — Órbitas sonoras (partituras)

Ruta: `/musica-orbital` (requiere iniciar sesión).

## Notas y recorridos

- 16 círculos, de Do4 a Do6 (afinación temperada, La4 = 440 Hz), incluyendo Fa♯5.
- Más lejos del centro = sonido más agudo.
- Los anillos 1–4 comparten un recorrido y los anillos 5–16 otro. Ambos tienen duración de vuelta y dirección independientes.
- Cada anillo se puede activar/desactivar sin perder sus notas, retrasar su inicio de 0 a 30 segundos y configurar su posición angular.
- Los controles angulares se despliegan desde **Ajustar** en cada anillo para simplificar la interfaz.

## Guardar, importar y exportar

- **Guardar aquí** almacena la partitura mediante `localStorage`, solo en ese navegador y dispositivo.
- **Cargar** y **Borrar guardada** operan sobre las partituras guardadas en el navegador.
- **Exportar JSON** descarga notas, alturas por círculo, encendidos, fases, retrasos y los dos recorridos.
- **Importar partitura JSON** aplica el archivo, pero no lo guarda hasta pulsar **Guardar aquí**.
- La importación valida formato, versión, rangos de ángulos y grupos, notas duplicadas y un máximo de 1 MB por archivo.
- No se han añadido tablas ni datos de usuario en el servidor.

Formato `xahya-orbital-score` versión 1: propiedades `format`, `version`, `title`, `groups` (2 elementos con `duration` y `direction`) y `rings` (cada uno con `pitch`, `enabled`, `phase`, `delay` y `angles`). Se identifican los anillos por `pitch`, para admitir archivos anteriores que contengan menos anillos.

## Melodía proporcionada

El botón **Cargar melodía proporcionada · 53 notas** distribuye las seis frases de notas suministradas por la usuaria en 65 posiciones temporales; 53 tienen notas, con dos posiciones vacías entre frases y una al principio y al final.

Asignación provisional: La4, Si4, Do5, Re5, Mi5, Fa♯5, Sol5. Ambas familias giran en sentido horario, con duración de 16 segundos por vuelta, fase e inicio 0°. Así la secuencia suena en orden. Como las letras de notas no especifican octavas, tempo, silencios exactos o duración individual, es una **aproximación editable**, no una transcripción rítmica exacta.

La partitura puede guardarse y exportarse como cualquier otra composición. No se almacena audio.

## Tema épico de Xahya

**Ascenso de Xahya — batalla** es la composición predeterminada del laboratorio y los encuentros. Está escrita específicamente para Xahya, con una sensibilidad de aventura y JRPG clásico, sin copiar melodías de videojuegos. Se sintetiza con Web Audio sin muestras ni archivos de terceros. Una vuelta de **8 segundos** (antes 16) desarrolla cuatro secciones armónicas **La menor → Fa mayor → Sol mayor → Mi menor**, contrapunto grave y pulsos rítmicos. Incluye **tres glissandos breves de semitono** en lugar de siete barridos largos.

Los deslizamientos son notas existentes ampliadas con una lista opcional `slides: [{ angle, toPitch, duration }]` por circunferencia. La duración es de 0,1 a 3 segundos; el origen siempre debe corresponder a una nota real. En el gráfico se dibuja un arco luminoso desde el origen hasta el anillo de destino y un marcador lo recorre durante la reproducción. El oscilador cambia continuamente de frecuencia, en vez de disparar dos notas separadas.

El formato **sigue siendo versión 1**: partituras antiguas sin `slides` se importan sin efectos deslizantes.

## Tema personal de cada jugador

La nueva ruta protegida `/api/music-theme` permite a cada usuario autenticado:
- GET: leer exclusivamente su partitura personal.
- PUT: guardar la partitura que edita en el laboratorio (reemplaza el tema personal).
- DELETE: volver a utilizar el tema épico predeterminado.

Los borradores múltiples del laboratorio siguen viviendo en `localStorage`. La composición marcada **Guardar como mi tema** se guarda en el perfil y se puede usar al iniciar sesión en otro dispositivo. Para ello se añade `User.musicTheme Json?` al contrato y la migración `migrations/20261107223000_user_orbital_music_theme.sql`. **La migración debe aplicarse a la base de datos antes de publicar esta PR**.

## Música durante combates

El encuentro incluye un panel **Música** para elegir entre Ascenso de Xahya y el tema personal del jugador, pulsar reproducir/pausar, ajustar el volumen y visitar el editor. La reproducción no empieza automáticamente: requiere una interacción explícita por las restricciones de audio de los navegadores. Se detiene al finalizar el combate o abandonar la página, no utiliza la API de combate y no modifica PA, maná, ticks, el orden de iniciativa ni las acciones.

### Timbre y notas de transición

El sintetizador utiliza voces diferenciadas: graves más redondos (fundamental senoidal con subarmónico), agudos de carácter casi orquestal/retro (diente de sierra suavizado con filtro de paso bajo). Los sonidos normales tienen articulación corta para destacar el ritmo, no colas de casi un segundo. Los glissandos sostienen su primera altura y sólo se deslizan durante los **últimos 60–140 ms** de la nota; así se conservan efectos largos personalizados sin convertirlos en sirenas. Las partituras personalizadas siguen siendo compatibles; su período de vuelta y configuración de glissandos no se alteran.

El tema de sistema mantiene un ciclo de 8 s. Si un usuario había guardado una versión anterior como **tema personal**, se conserva tal cual: debe cargar la nueva partitura del sistema y guardarla otra vez si desea adoptarla.
