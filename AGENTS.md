# rollershow-cortina-viva — guía para agentes

Landing interactiva de **cortinas tradicionales** RollerShow: una escena 3D donde
el usuario mueve una cortina real (física de tela) con el mouse (hover, sin clic),
el dedo (touch) o inclinando el teléfono (acelerómetro), pasa entre 3 productos
con un carrusel, fija ancho/alto con steppers y pide presupuesto por WhatsApp.

**Deploy:** GitHub Pages sirviendo `main`/root → https://aguslaboral.github.io/rollershow-cortina-viva/
`main.js` es la fuente y `npm run build` genera `app.js`, bundle local de
Three.js y postprocesos que también se versiona para Pages. No volver a imports
runtime desde CDN: multiplicaban requests y demoraban el primer cuadro mobile.
`.nojekyll` en raíz.
Dev local: `python -m http.server 8934` en la raíz del repo → http://localhost:8934/

## Arquitectura (decisiones ya tomadas — no re-litigar)

- **Escena 3D real con Three.js** (v0.169 vía importmap/unpkg), NO fotos planas.
  Historia: v1 usó foto de fondo + textura tileable (quedó "roller" y trucho);
  v2 warp de foto de cortina sobre malla en canvas 2D (costuras + 13fps);
  v3 = actual. Agus rechazó explícitamente volver a foto plana: la iluminación
  del ambiente DEBE reaccionar a la cortina y su transparencia.
- **La fuente de luz es LA VENTANA** (exigencia explícita de Agus):
  - `DirectionalLight` (sol) ubicado AFUERA del cuarto, detrás de la pared
    trasera, entrando por el hueco de la ventana. La pared (`backWall`,
    ShapeGeometry con agujero) tiene `castShadow=true`: el sol solo entra por
    el hueco. La cortina blackout con `castShadow=true` bloquea el charco de
    sol del piso de verdad.
  - **God-rays reales** (radial blur clásico): pase de oclusión a render target
    chico donde TODO se pinta negro salvo un plano brillante en el hueco de la
    ventana (layer 1, `glowPlane`); cada paño usa su propio material de oclusión
    durante el crossfade. Blackout bloquea 100%; Tusor deja un nivel
    intermedio; Gasa transmite mucha luz. El shader
    (`GODRAY_FRAG`) acumula muestras radiales desde el centro de la ventana.
  - HDRI fotográfico `img/env/sunset.hdr` (Poly Haven venice_sunset 1k, CC0):
    se usa sólo como IBL suave (`scene.environment`). El fondo visible es
    carbón casi negro; no volver a asignar el HDR a `scene.background`.
    La rotación `ENV_ROT=2.196` se calculó analizando el archivo con
    `_scratch/find-sun.mjs` (sol del HDRI en u=0.60 → centrado en la ventana).
- **Física de tela**: Verlet + constraints (portada del prototipo tearable de
  Desktop\rollershow\prototipo-tearable.html, misma matemática). El plegado de
  pinza es el ESTADO DE REPOSO de la malla (`gatheredU()` agrupa las columnas
  periódicamente y los rest-lengths usan esa distancia) — no pelear contra la
  física para mantener pliegues. El bulge en Z compara span local vs reposo.
- **Materiales de tela**: `MeshStandardMaterial` opaco con textura y normal. La
  Gasa y el Tusor mezclan una captura reducida y desenfocada del fondo dentro
  del shader (`frostMix` / `frostRadius`), conservando depthWrite y superficie
  textil para evitar los triángulos de alpha sorting. PROHIBIDO `transmission`
  de `MeshPhysicalMaterial`: agrega un render interno por objeto. La transmisión
  de luz ambiental vive en `sunFactor`; `shadowBlock` modula haze/oclusión.
  Toda tela bloquea el sol direccional en el shadow map: Gasa/Tusor recuperan
  energía con un charco difuso independiente, nunca copiando la grilla.
- **Atmósfera**: el haz combina oclusión radial y bloom. La bruma nace del pase
  de oclusión alineado con el vano; no usa sprites aditivos, porque generaban
  una falsa fuente ámbar sobre la pared izquierda. No resolver con blur global:
  destruiría pliegues y textura.
- **Receptor de luz**: el piso PBR es el receptor principal. Sólo el sol
  exterior lo ilumina; pared perforada, marco y tela viva dibujan la huella en
  el shadow map. Fuera del haz queda oscuro. La carpintería argentina es blanca.
- **Texturas**: tileables chicas que se repiten (pedido de Agus: livianas pero
  detalladas). Telas: `img/tela-*.png` (gpt-image-1 + mirror-tiling en
  `scripts/generate-assets.mjs`) + normal maps derivados
  (`scripts/generate-normals.mjs`, Sobel sobre luminancia, no gastan API).
  Paredes/piso: PBR reales CC0 en `img/env/` (plaster + Marble005 de ambientCG).
- **Interacción**: hover SIN clic en desktop (mouseenter/mousemove), dedo en
  mobile (touchmove con preventDefault), acelerómetro (`deviceorientation`,
  permiso iOS pedido en el primer gesto táctil, sin botón dedicado). El
  puntero se proyecta al plano de la cortina por raycast (`pointerToWorld`).
- **Carrusel**: 2 sets de 2 paños (4 mallas) con física propia; crossfade de
  opacity + lerp de parámetros físicos y de luz (`sunFactor` → sol, fill,
  god-rays) en ~560ms. Blackout Blanco / Gasa Beige / Tusor Natural.
- **Medidas → cotizador**: steppers (60-300 x 60-260cm, paso 10) reconstruyen
  la malla (`applySize()`); debajo de 200 cm, ventana y cortina quedan elevadas
  con antepecho; desde 200 cm pasan a puerta-ventana al piso. CTA
  `https://www.rollershow.com.ar/cotizar/tradicionales`. No derivar directo a WhatsApp.
  Aparecen tras la primera interacción (o 2.6s), nunca antes (regla de Agus:
  no pedir nada antes de la acción).

## Reglas de Agus que aplican acá (violarlas = rechazo)

- Cero "tells de IA": sin middots, em-dashes, pills verdes, dots titilantes,
  cajas flotantes. CTA en Rojo Teja `#C63A21` — único acento de color.
- Mobile first (90% del tráfico). Verificar SIEMPRE en viewport mobile.
- Nada se reporta "listo" sin verlo funcionando (screenshot del live).
- Gate de deploy: nunca pasar link sin verificar CSS/render/imágenes vivas.
- Blackout = oscuridad total (nunca dejar pasar luz); las sheer sí la dejan.
- Animaciones no se gatean en prefers-reduced-motion.
- El look debe ser premium/hiperreal, NUNCA "Minecraft"/colores planos:
  si un recurso se ve pobre, buscar recurso pro ya hecho (Poly Haven etc.).

## Verificación

- `_scratch/shoot.mjs` (Playwright, devDependency): screenshots mobile+desktop
  de los 3 productos + drag sintético (`window.__cortina.pokeScreen`) + FPS.
  `TAG=rX node _scratch/shoot.mjs` con server local corriendo.
- FPS en headless es render por software (no representativo — en GPU real
  vuela); usarlo solo para comparar relativo entre iteraciones.
- Hook de introspección: `window.__cortina.getState()` / `.pokeScreen(x,y,dx,dy)`.
- Acelerómetro: solo verificable en dispositivo real (iPhone pide permiso al
  primer toque; Android no pide).

## Estado al 2026-07-21 (ronda r65)

`Abrir y cerrar` conserva la apertura elegida y deja de conservar las arrugas
accidentales del gesto. Las constraints horizontales, exclusivamente en este
modo, corrigen sólo el eje X; antes convertían parte de la compresión lateral
en empujes verticales que cruzaban filas y formaban bolsas. Las diagonales, la
gravedad y el resorte del riel siguen activos, por lo que el recorrido conserva
su retraso orgánico sin shape matching ni puntos nuevos fijados.

Al terminar un drag se espera 1 s y la malla se asienta durante 680 ms hacia su
caída local usando como referencia el `openTargetSpread` exacto de cada paño.
No vuelve a `spread=1`, no cierra el vano y una nueva interacción interrumpe el
asentamiento. QA extremo mobile/full redujo la deformación residual de 0.102 a
0.0043 sin deriva de apertura (0.16 antes y después); desktop terminó en 0.0040.
La regresión r64 de onboarding pasó completa en mobile y desktop.

### Estado r64 preservado

La primera visita enseña la interacción dentro de la propia escena con tres
demostraciones causales y distintas. `Mover tela` muestra una gota, dos ondas y
un gesto lateral; la tela recibe solamente una onda Z localizada de 12 mm, sin
inyectar un arrastre falso en la física. `Abrir y cerrar` lleva ambos paños a
0.62 de apertura mediante sus resortes existentes y los devuelve al reposo.
`Roller` recorre verticalmente de 1 a 0.58 y vuelve usando el smooth-damp real.
La guía superpuesta anima sólo `transform` y `opacity`, no captura eventos y no
agrega dependencias, videos, texturas ni requests.

El arranque espera 1.4 s después de `scene-ready`, para no competir con la
composición inicial mobile; los cambios de modo esperan 520 ms. Cada capacidad
se muestra como máximo una vez por visita y su primer gesto manual cancela la
guía y guarda una clave independiente en `localStorage`. Desde entonces esa
demostración no reaparece en ese navegador. Los tres estados se inspeccionan y
pueden forzarse de forma determinista desde `window.__cortina` para QA.

### Estado r63 preservado

La jerarquía óptica Tradicional vuelve a separarse de forma inequívoca por
pedido explícito de Agus. Blackout permanece en transmisión 0 y bloqueo 1.
Tusor baja a `frostMix 0.42` / `sunFactor 0.38`, sube a `frostLod 4.65` y
`shadowBlock 0.64`: conserva cuerpo textil y luz difusa, pero revela mucho
menos la ventana. Gasa sube moderadamente a `frostMix 0.79` / `sunFactor 0.88`,
baja su LOD a 3.05 mobile y 3.75 desktop y bloquea sólo 0.14: la carpintería se
lee mejor detrás de la trama sin convertirla en vidrio ni usar alpha.

QA r63: comparación controlada de Blackout, Tusor y Gasa con idéntica medida,
abertura y cámara en 390x844 lite y 1440x900 full. Energía de fuente medida:
0.01 / 0.387 / 0.881; haze: 0.003 / 0.153 / 0.727. La inspección visual confirma
tres niveles claros y consola limpia. Capturas en `_scratch/audit-r63/`.

### Estado r62 preservado

Roller deja de reutilizar los mapas de Gasa y Tusor. Los tres productos usan
una misma base blanco cálido y tres superficies procedurales tileables de
256x256: trama cerrada fina en Blackout, tejido denso con slub en Decorativa y
malla abierta fina en Screen. Al generarse sincrónica y localmente no agregan
requests, binarios ni un estado de carga parcial; albedo y normal se cachean.

La óptica Roller también queda separada de Tradicional. Blackout usa frost 0,
transmisión 0 y bloqueo 1. Decorativa usa LOD 5.9: deja pasar luminosidad y
siluetas amplias, pero elimina la lectura de la carpintería. Screen usa LOD
0.72 y transmisión alta: la estructura exterior sigue reconocible a través de
la microtrama. Los tres conservan exactamente el mismo `ROLLER_WARM_WHITE`.
Cambiar de familia restaura el producto tradicional equivalente y sus valores
aprobados; no se recalibró Gasa, Tusor ni el Blackout tradicional.

QA r62: Playwright recorrió los tres perfiles en 390x844 lite y 1440x900 full,
consola limpia y retorno Roller a Tradicional correcto. Los estados medidos
fueron Blackout 0/1, Decorativa 0.46/0.56 y Screen 0.82/0.20 para transmisión y
bloqueo respectivamente. La inspección visual confirma opacidad total, sombra
difusa sin vista y vista exterior legible en ese orden. Capturas en
`_scratch/audit-r62/`.

### Estado r61 preservado

En Roller, el contrapeso inferior vuelve a ser una pieza realmente interna.
La geometría recorre todo el ancho y sigue bloqueando sombra, oclusión y haze,
pero `colorWrite=false` impide que se pinte como una barra clara separada o
muestre remates laterales. El usuario sólo ve el bolsillo denso de la propia
tela, cuyo shader ya corta el frost en el ruedo.

La interfaz oculta por completo `Cómo querés probarla` cuando la familia activa
es Roller: Mover tela y Abrir y cerrar son comportamientos exclusivos de la
cortina tradicional. El selector óptico deja de depender de pictogramas chicos;
cada opción muestra producto y nivel causal en texto: Sin paso, Paso medio o
Paso alto. La misma gramática se conserva en Tradicional y Roller.

QA r61: Playwright recorrió 390x844 lite y 1440x900 full. Verificó contrapeso
interno opaco sin escritura de color, cobertura completa del ruedo, grupo de
interacción oculto únicamente en Roller, restauración al volver a Tradicional,
selectores contextuales correctos, targets de 68 px, cero overflow y consola
limpia. Las capturas finales están en `_scratch/audit-r61/`.

### Estado r60 preservado

La interfaz separa tres decisiones que antes estaban mezcladas. `Tipo de
cortina` elige Tradicional/Roller; `Cómo querés probarla` ofrece Mover tela o
Abrir y cerrar sólo dentro de Tradicional; `Paso de luz` conserva el selector
óptico contextual de cada familia. Al volver desde Roller, Tradicional recuerda
su última interacción. Desktop ubica toda la configuración en el margen negro
izquierdo y mobile en la franja superior anterior a la tela, sin tapar el
producto ni competir con el CTA inferior.

El CTA ya no abre un modal. Revela una segunda sección vertical, desplaza la
simulación hacia arriba y lleva el foco accesible al título del presupuesto. La
configuración elegida permanece visible en el resumen, el formulario conserva
la API v2 y Volver restaura la escena y el foco del CTA. La cuenta regresiva del
panel de medidas comienza después de `scene-ready`: una carga lenta ya no puede
cancelarlo permanentemente durante el reveal atómico.

QA r60: capturas Playwright en 390x844 y 1440x900; cero overflow horizontal,
todos los targets visibles >=44 px, títulos y estados correctos, memoria de
Abrir al pasar por Roller, cero diálogos abiertos, scroll/foco de ida y vuelta y
consola limpia. El pase visual confirma que los controles terminan exactamente
antes de la tela en mobile y a su izquierda en desktop.

### Estado r59 preservado

La proyección del piso separa luz directa de luz transmitida. Toda superficie
de tela bloquea la componente direccional del sol, por lo que la carpintería
sólo deja líneas nítidas donde existe un hueco físico entre paños o bajo una
Roller levantada. Gasa y Tusor recompensan esa energía con un charco aditivo sin
barras, de caída amplia y feather creciente hacia los extremos; sus potencias
siguen ordenadas por `sunFactor`. Blackout no recibe ese aporte.

QA r59: inspección Playwright en desktop full y mobile lite sin errores. Gasa y
Tusor muestran iluminación difusa bajo tela; Blackout queda sin transmisión;
la apertura central conserva la proyección nítida. Roller usa la misma
separación y mantiene su grilla visible sólo como backdrop óptico del producto.

### Estado r58 preservado

La translucidez Roller deja de duplicar la carpintería. La lámina ya no recibe
el shadow map del marco porque ese mismo marco vive en la captura frost; sumar
ambos producía barras oscuras falsas. Su LOD de fondo baja únicamente en Roller
y la geometría tensada conserva sólo 2,5 mm de bombeo, por lo que la grilla se
lee continua y estable. El motor frost y los materiales tradicionales aprobados
no cambian.

La Roller suma el contrapeso inferior real: una barra interior retraída 3% por
lado, oculta dentro de un bolsillo de la misma textura. La franja final de 2,8
cm se vuelve densa dentro del shader y corta completamente el frost; la pieza
física aporta 4 cm de alto y acompaña la subida/bajada. Nunca transmite luz en
Blackout, Decorativa ni Screen y no muestra tapas laterales.

QA r58: Playwright revisó Screen y Decorativa en 390x844 lite y 1440x900 full,
sin errores. Verificó contrapeso visible, ancho interior, bloqueo óptico total y
posición solidaria con el paño al enrollar. Las capturas confirman una sola
grilla de ventana, sin la onda ni las sombras duplicadas anteriores.

### Estado r57 preservado

La navegación cíclica Anterior/Siguiente fue reemplazada por un selector óptico
explícito y accesible. Ordena siempre los productos desde menor a mayor paso de
luz y usa una misma gramática causal: sol, paño y cero/uno/tres rayos que lo
atraviesan. El icono nunca queda solo: se acompaña por producto y beneficio
óptico. En tradicional ofrece Blackout / Tusor / Gasa; en Roller ofrece
Blackout / Decorativa / Screen. La taxonomía coincide con la API oficial:
Oscuridad total, Luz y privacidad, Luz y visibilidad al exterior.

Ancho y Alto son ahora inputs numéricos editables además de conservar los
steppers. Validan 60-300 x 60-260 cm, paso 10, y reconstruyen la misma escena y
estado compartido en Tela, Abrir y Roller. El CTA congela producto, familia y
medidas actuales, abre un diálogo modal con el fondo completo desenfocado,
pregunta formato y WhatsApp y recién al confirmar ejecuta POST a
`https://www.rollershow.com.ar/api/v2/cotizar`. Usa `origen=cortina-viva` y una
tela real representativa del catálogo para cada variante. La API no promete ni
devuelve precio: el éxito informa contacto humano en menos de 24 horas hábiles.

QA r57: Playwright recorrió 390x844 y 1440x900, los nueve cruces de modo y
producto, edición directa 180x220, selector único y ausencia de overflow o
errores. El POST se interceptó localmente: se verificaron URL, `tela_id`,
medidas, formato, detalle y origen sin crear una solicitud real. CORS oficial
respondió 204 con origen permitido para GitHub Pages.

### Estado r56 preservado

Los dos modos experimentales dejan de deformar la tela con transformaciones
cinematicas. En `Abrir`, el gesto mueve un objetivo de apertura y los anclajes
superiores lo siguen mediante un resorte amortiguado; el cuerpo continua bajo
Verlet y constraints, por lo que cada fila llega con retraso y la caida conserva
inercia. Los rest lengths proyectados se comprimen solo en X y esa longitud
reaparece como profundidad de pliegue. No se escala el alto ni se inmoviliza el
cuerpo del pano.

En `Roller`, el cilindro cubre el 102% del ancho de la tela y usa los mapas PBR
del producto. El radio crece con la longitud enrollada mediante conservacion de
area y la superficie gira en proporcion al tejido guardado. La lamina visible
recorta su rango UV al mismo porcentaje que su largo: la densidad de trama queda
constante en vez de estirar la textura completa. El drag alimenta un SmoothDamp
estable por tiempo real para conservar tactilidad sin overshoot en FPS bajos.
Gasa y Tusor mantienen el frost aprobado solo en la lamina desplegada; el rollo
multicapa se representa denso. Blackout permanece totalmente opaco.

QA r56: Playwright recorrio mobile lite y desktop full con consola limpia.
Comprobo que `Abrir` conserva diferencia temporal entre objetivo y pano antes
de estabilizar, que Roller retiene su posicion, que el radio aumenta al subir,
que el span UV coincide con el largo visible y que el rollo supera el ancho
completo de la cortina. Se revisaron capturas de Gasa, Blackout y Tusor en
Roller y de la cortina tradicional recogida.

### Estado r55 preservado

La experiencia arranca siempre en Gasa y sus mapas pasan a ser los recursos
críticos del primer cuadro. En mobile únicamente, el LOD de difusión baja 20%
(4.1 a 3.28), sin alterar `frostMix`, trama, transmisión, sombra ni la
calibración desktop aprobada. El boot espera mapas, HDRI y una composición
estable, fuerza el primer shadow map antes de revelar el canvas y prepara la
capa WebGL/UI oculta para que Gasa no aparezca blanca, transparente ni
sobreexpuesta antes del primer toque.

La misma URL incorpora un laboratorio reversible con tres modos editoriales:
`Tela` mantiene el gesto libre y, tras 1 segundo sin entrada, devuelve ambos
paños a su caída de reposo mediante una transición material de 520 ms; `Abrir`
permite arrastrar cada paño hacia su lateral y conserva la abertura; `Roller`
usa una sola malla liviana que sube o baja con drag vertical y oculta el barral
tradicional. Los dos modos experimentales reutilizan escena, materiales,
oclusiones, luz y loop existentes: no triplican motores ni URLs. Son candidatos
de prueba, no un estándar aprobado ni un reemplazo definitivo de la cortina
tradicional.

QA r55: Playwright headless verificó mobile lite y desktop full con Gasa como
inicio, consola limpia y capturas de los tres modos. En mobile, la deformación
libre volvió a una desviación media de 0,03 mm luego del reset; la apertura
lateral pasó de 9,0% a 47,2% y se conservó; el roller quedó en 16,3% de caída
con 58,6% de ventana expuesta. Blackout y Tusor siguieron disponibles y
visualmente conservaron sus niveles de bloqueo.

### Estado r54 preservado

El pie ya no colisiona con el piso. La urdimbre usa un límite unilateral sólo
vertical que impide que la gravedad alargue el paño, pero conserva libre todo
movimiento lateral. En puerta-ventana termina 6 mm por encima del piso; en
ventana elevada conserva el solape bajo el vano. Blackout/Gasa/Tusor mantienen
esa separación a 150/200/260 cm sin clamps, pestañas ni doblez hacia arriba.

La carga inicial es atómica: canvas, producto y controles permanecen ocultos
sobre el fondo carbón con el wordmark hasta que Blackout tiene sus dos mapas y
existe un primer frame compuesto. Hay fallback opaco a los 5 s; nunca se revela
una tela transparente. El HDRI y los otros productos se precargan en idle.
Three.js y addons se empaquetan localmente en `app.js` (629 KB) para eliminar
la cascada de módulos desde unpkg. Los normal maps textiles pasaron de 9,0 MB a
1,9 MB y los cinco mapas PBR de ambiente de 4,3 MB a 0,98 MB en WebP, con la
misma resolución 1024².

QA r54: Playwright verificó mobile/desktop, carga oculta, arrastre real de
Blackout, carrusel Gasa/Tusor, ausencia de errores y las nueve combinaciones de
producto/altura. Capturas en `_scratch/qa-free-cloth/r54-*`.

### Histórico r53 (reemplazado por r54)

La ronda r53 reemplaza por completo el dobladillo estructurado de r52. La tela
queda fijada únicamente en la fila superior: laterales, cuerpo y pie se mueven
por las mismas constraints físicas y sólo colisionan con el piso real. Se
eliminaron shape matching de orillos, nivelado y suavizado del ruedo, ordenado
forzado de filas, reducción de profundidad en el pie y sombreado de doble capa.
No volver a resolver la silueta inferior con una banda geométrica o visual: si
aparece una imperfección se corrige en la malla o la restricción causal.

Blackout conserva mayor gravedad y opacidad total pero baja rigidez y aumenta
respuesta e inercia. Gasa y Tusor también quedan libres con distinta masa y
respuesta. El motor de transparencia, la potencia constante de ventana, el
barral retrasado y la jerarquía Blackout/Tusor/Gasa permanecen intactos.

QA r53: Playwright recorrió Blackout, Gasa y Tusor en 1440x900 y 390x844, en
reposo, arrastre y asentamiento. Los tres aumentaron su abertura durante el
gesto, el pie quedó por encima del piso real y no hubo errores de consola. Las
capturas están en `_scratch/qa-free-cloth/`.

### Histórico r52 (reemplazado por r53)

El pie se rehizo como un dobladillo estructurado, no como una fila de vertices
parchada. Un peso continuo distribuye la tension entre vecinos, mantiene las
filas en orden vertical y evita que el cuerpo atraviese el borde inferior. La
costura visual conserva el pliegue en profundidad con amplitud reducida y una
ondulacion de 2,5 mm; ya no colapsa toda la Z a cero ni genera dientes, abanicos
triangulares o tela doblada hacia arriba. El largo configurado es ahora un
limite fisico: ninguna parte del pano termina por debajo del ruedo.

En ventanas elevadas el pano solapa 10 cm por debajo del vano; en puerta-ventana
mantiene 4,5 cm de separacion del piso. La tela cuelga 18 cm delante del muro y
el barral queda retrasado al plano del marco, siempre detras de todos los
pliegues. El dobladillo se sombrea como doble capa. Esta geometria elimina los
puntos de sol que se filtraban por debajo y evita que el barral reaparezca al
reducir la distancia a la pared.

Blackout conserva gravedad y masa mayores, pero deja de sentirse inmovil. Baja
su rigidez localizada, amplifica el area y la respuesta del gesto y conserva
mas inercia, sin tocar opacidad, sombra, radiancia ni el motor frost aprobado.
La malla impide inversiones verticales durante un gesto fuerte, por lo que el
movimiento adicional no abre fugas de luz entre triangulos.

QA r52: Playwright recorrio full/lite, Blackout/Gasa/Tusor y alturas
150/200/260. En las 18 combinaciones `minY` coincide con `hemMinY`, sin ningun
vertice por debajo del pie, errores de consola ni overflow. Se revisaron
capturas mobile/desktop en reposo, movimiento y asentamiento; el Blackout se
desplaza visiblemente y recupera una caida continua. La metrica nueva mide
quiebres locales proyectados contra el segmento vecino, no contra el espaciado
irregular de columnas plegadas.

### Estado r51 preservado

El ruedo ya no conserva la onda Z del cuerpo hasta el ultimo vertice. Una banda
fisica de dobladillo de 16 cm aplana gradualmente la profundidad en todo el
ancho; la ultima fila termina en Z=0 y su peso nivela Y hacia el promedio del
pano sin inmovilizar el movimiento conjunto. El hook QA mide ahora toda la Z
del ruedo y su desviacion proyectada en pixeles, no solamente coordenadas XY o
las dos esquinas.

La fuga de luz ultrawide no era haze ni una fuente adicional: el piso visible
salía del frustum lateral del shadow map y Three lo trataba como iluminado. Los
limites se recalculan en cada resize y amplian solamente el lado que abre la
camara segun `camera.aspect`, preservando mas resolucion de sombra. La intensidad
correcta de la ventana, el bloom y la jerarquia optica quedan intactos.

El CTA desktop pasa a 60 px, 15 px/700, ancho minimo 292 px y padding lateral de
30 px. Usa `align-self:flex-end`, por lo que su borde inferior coincide con el
hairline de ambos steppers. Mantiene Rojo Teja, radio 6, animacion acotada y
ancho completo mobile, sin loop ni glow decorativo.

QA r51: Playwright recorrio 1440x900, 1920x1080, 2048x1024, 2560x1080,
393x852 y 320x700, full/lite, sin errores ni overflow. El ROI izquierdo quedo
con cero pixeles de alta luminancia en 1920, 2048 y 2560; el charco central no
cambio. CTA y steppers terminan exactamente en la misma coordenada. La matriz
lite/full de Blackout/Gasa/Tusor a 150/200/260 cm dio `hemMaxAbsZ=0` y una
desviacion proyectada maxima menor a 0,44 px, incluso despues de redimensionar.

### Estado r50 preservado

La jerarquia optica queda separada en tres niveles inequívocos: Blackout bloquea
por completo, Tusor filtra en un nivel intermedio y Gasa transmite la mayor parte
de la luz. Tusor reduce su mezcla de fondo frost de 0,66 a 0,50 y su `sunFactor`
de 0,64 a 0,46; aumenta bloqueo de sombra de 0,38 a 0,56 y densidad de fibra,
oscurece mas los pliegues y limita su radiancia. Gasa permanece en 0,84 de
transmision y 0,18 de bloqueo; Blackout sigue en 0 y 1 respectivamente.

QA r50: Playwright verifico mobile lite y desktop full, sin errores, con igual
apertura y exposicion. La energia de fuente medida fue 0,010 para Blackout,
0,466 para Tusor y 0,842 para Gasa; el haze resultante fue 0,002, 0,206 y 0,653.
La comparacion visual confirma que Tusor conserva textura y translucidez real,
pero ya no se confunde con la luminosidad de Gasa.

### Estado r49 preservado

Se elimino la pestana rectangular que podia aparecer en la union inferior entre
orillo y ruedo. La causa no estaba en Verlet ni en la colision XY: despues de
resolver la fisica, `uploadGeometry()` agregaba casi 9 cm de profundidad Z a la
primera columna interior mientras el orillo quedaba en Z=0. La camara oblicua
proyectaba esa cresta fuera de la silueta y las metricas anteriores, limitadas a
X/Y del borde, no podian detectarla.

El pliegue usa ahora un taper cosido: durante el ultimo 20% de altura, su
profundidad se aplana gradualmente dentro del 14% lateral de cada extremo. No
cambia el centro del pano, la fisica, los materiales, la transparencia ni la
luz. El hook QA suma `bottomCornerDepth` para impedir que este defecto vuelva a
quedar oculto por una medicion incompleta.

QA r49: Playwright recorrio 18 combinaciones (lite/full, Blackout/Gasa/Tusor y
150/200/260 cm), ambos panos, sin errores. En full la profundidad inferior de
esquina quedo entre 0,8 y 1,1 cm; en lite, entre 2,4 y 3,2 cm por su topologia
mas espaciada, sin sobresalir de la silueta. Se revisaron visualmente reposo,
arrastre y las tres telas: la pestana desaparecio y los pliegues centrales se
conservaron.

### Estado r48 preservado

La luz exterior gana presencia sin cambiar la logica causal de la escena: el
sol fisico sube de 13,5 a 18, el haz ocluido aumenta de 0,16 a 0,27 y el bloom
constante de la ventana pasa de 0,24 a 0,36. La exposicion global permanece en
1,18 para no aclarar las zonas fuera del haz. La mascara de tela, los caps de
radiancia y todos los parametros del motor frost siguen intactos; Blackout no
se vuelve emisivo ni deja pasar luz.

Blackout queda levemente menos rigido en interaccion: baja su stiffness y la
estabilizacion localizada de orillo/ruedo, y sube moderadamente la respuesta al
gesto. Conserva mas estructura que Tusor y Gasa y mantiene la caida lateral
prolija de r47.

QA r48: Playwright recorrio Blackout arrastrado, Gasa y Tusor en mobile lite sin
errores. La revision visual confirmo mas intensidad en ventana, charco de luz y
halo de las telas translucidas, sin bloom sobre Blackout ni perdida de textura.
La corrida desktop produjo las cuatro capturas de producto necesarias; el
script largo agoto el timeout despues, durante el redimensionado/FPS bajo WebGL
por software, no durante la verificacion visual.

### Estado r47 preservado

La caida lateral y el ruedo modelan ahora la estructura localizada de los
orillos cosidos. Los constraints de bending son mas firmes solamente en las
dos columnas exteriores y en la fila inferior; un shape matching por producto
devuelve esos bordes suavemente hacia su linea de reposo sin rigidizar el centro
ni alterar la respuesta al arrastre. Blackout usa la terminacion mas estable;
Tusor y Gasa conservan progresivamente mas flexibilidad.

Se corrigio tambien el reparto del solver cuando uno de los vertices esta
fijado: la correccion completa se aplica al punto libre, en vez de perder la
mitad. La colision de piso deja de recortar vertices aislados en un unico plano
y usa un limite gradual para la banda inferior, respetando los 4,5 cm de
separacion del ruedo. Esto elimina tanto los picos triangulares al tocar el
porcelanato como la curva lateral exagerada. No se modificaron materiales,
transparencia, luz, haze ni el presupuesto de iteraciones full/lite.

QA r47: Playwright recorrio Blackout, Gasa y Tusor a 150, 200 y 260 cm en tier
lite sin errores. En Blackout el desvio lateral maximo quedo entre 2,2 y 5,5 mm;
Gasa, deliberadamente mas flexible, quedo por debajo de 18,9 mm, y Tusor por
debajo de 12,1 mm. A 200 y 260 cm los dos panos de los tres productos terminaron
completos en y=0,06 m, 4,5 cm sobre el piso, sin vertices sueltos. Tambien se
verifico Blackout full a 200 cm y una deformacion sintetica en mobile lite:
recupero el ruedo uniforme y el orillo recto sin errores.

### Estado r46 preservado

El editor de medidas deja de aplicar una cota horizontal a ambos campos. Reusa
el patron operativo de las landings actuales: flecha bidireccional horizontal
para Ancho y vertical para Alto, ambas como iconos semanticos junto al label.
Los steppers conservan 48 px, unidad inseparable, foco visible y CTA de 52 px;
el modulo sigue siendo una sola banda integrada a la escena, sin cards. Tambien
se corrigio el z-index de la capa animada del CTA que podia dejar un triangulo
rojo fuera del boton.

QA r46: Playwright recorrio 320, 393 y 1440 px, acciono ambos steppers y midio
iconos, panel y CTA. Resultado: cero errores, cero overflow, valores 130/160 tras
la interaccion y CTA de 52 px. Carrusel real Blackout->Gasa->Tusor se reviso en
mobile y desktop; la corrida conjunta agoto el timeout al redimensionar desktop
bajo WebGL por software, pero ya habia producido las capturas necesarias y la
matriz corta completo las tres anchuras.

### Estado r45 preservado

La calidad mobile se decide en dos etapas sin cambiar producto, materiales ni
transparencia. Al inicio, `saveData`, memoria cuando el navegador la expone y
nucleos seleccionan `full` o `lite`; un mobile capaz sin `deviceMemory` no se
penaliza preventivamente y `?quality=full|lite` sigue disponible para QA. Luego
de omitir la compilacion inicial de shaders, dos ventanas lentas consecutivas
activan una unica degradacion: baja solamente el DPR interno y los buffers
auxiliares. En `lite` el shadow map se actualiza cuadro por medio cuando la tela
esta quieta, pero vuelve a cada cuadro durante arrastre, transicion o sensor.
Una pestana oculta no simula ni renderiza. La captura frost conserva su
resolucion aprobada para no degradar Gasa/Tusor.

La orientacion mobile afecta levemente la fisica, no la camara ni la luz:
inclinacion lateral aporta una fuerza amortiguada y la inclinacion perpendicular,
calibrada contra la postura del primer evento, varia la gravedad como maximo
+/-12%. Los ejes se adaptan a portrait/landscape y se recalibran al rotar. iOS
pide permiso solo desde el primer toque sobre el canvas; si el sensor no existe
o el permiso se deniega, la experiencia queda intacta. El hook QA
`window.__cortina.injectOrientation(beta, gamma)` verifica la respuesta fisica,
pero permiso y sensor real siguen requiriendo una prueba en telefono.

QA r45: Playwright en 393x852 con DPR 3, 2 GB informados y 4 nucleos eligio
`lite`, activo la reduccion dinamica a 0,78 y recorrio Blackout->Gasa sin errores
ni overflow. Un mobile simulado con seis nucleos y memoria no expuesta inicio en
`full`; el override `?quality=full` mantuvo calidad completa. La inclinacion
controlada produjo fuerza lateral y +9,5% de gravedad, dentro del limite, sin
tocar radiancia ni frost.

### Estado r44 preservado

La transparencia de r43 quedó aprobada explícitamente por Agus como resultado
definitivo y motor reusable. No recalibrar `frostMix`, LOD, microtrama,
`foldShade`, `sunFactor`, `shadowBlock`, caps de radiancia ni la máscara de haze
sin un pedido nuevo. La receta evita alpha/transmission: material Standard
opaco + captura reducida con mipmaps + cuatro muestras sesgadas + fibra macro y
micro + longitud de recorrido, con luz y sombra gobernadas por separado.

La interfaz r44 elimina las hojas poligonales y la caja exterior del cotizador.
Anterior/Siguiente son controles editoriales transparentes sobre Penumbra
localizada, con hairline y palabra. Medidas usan la firma de marca "Cota activa":
línea continua con tics que se dibuja al revelar el módulo. El CTA mide 52 px,
mantiene Rojo Teja sólido/radio 6 px y anima sólo entrada, hover y flecha; nunca
late en loop. Mobile conserva una banda inferior Tinta por legibilidad.

El ruedo usa terminación float: `HEM_CLEARANCE=0.045` y el largo visual termina
4 cm por debajo del vano o 4,5 cm sobre el piso, lo que evita comprimir la malla
contra la colisión y doblarla hacia arriba. QA r44 recorrió 320, 393 y 1440 px,
carrusel real y puerta-ventana de 260 cm sin errores ni overflow; el CTA midió
52 px y la banda no usa radio ni caja anidada.

### Histórico r43 (reemplazado por r44)

La interfaz media deliberadamente entre el manual RollerShow y la escena
experimental: navegación tipo "consola óptica" con hojas traslúcidas oscuras,
tipografía Manrope, crema y hairlines de marca; medidas y CTA comparten una
sola superficie ahumada y el Rojo Teja sigue siendo el único acento. En tier
lite el panel desactiva `backdrop-filter` y usa un fondo opaco equivalente.

Blackout no usa frost, emisión ni translucidez: limita también la contribución
del postproceso mediante una máscara de tela independiente, recorta la respuesta
de contracara y reduce la profundidad dinámica cerca del ruedo. Gasa y Tusor
desenfocan la captura del fondo mediante mipmaps (cuatro muestras, no nueve),
con difusión distinta por producto, oscurecimiento por longitud de recorrido,
microtrama y variación macro de fibra. Conservan material opaco con profundidad
y no usan `MeshPhysicalMaterial.transmission`.

QA r43: Playwright recorrió 320, 375, 393 y 1440 px en tiers lite/full sin
errores de consola ni overflow; verificó carrusel real, arrastre y steppers. El
recorrido full capturó Blackout normal/arrastrado, Gasa y Tusor. El script largo
agotó el timeout al reconstruir doce veces la malla bajo WebGL por software,
pero el redimensionado ya quedó cubierto en la matriz corta full/lite.
Las cuatro mallas de paño tienen `frustumCulled=false`: sus bounds cambian al
entrar desde fuera de cuadro y el bounding sphere inicial podía dejar el paño
derecho descartado en mobile después de completar el carrusel.

### Histórico r42 (reemplazado por r43)

La interfaz usa el manual RollerShow v2.2 como fuente visual: wordmark oficial,
Bricolage Grotesque para producto, Manrope para UI, Rojo Teja como única acción,
navegación con palabra e icono y un único panel Crema para medidas y cotización.
El piso usa Marble005 CC0 con mapas de color, normal y roughness, placas de
120x80 cm y juntas de 4 mm. Se eliminaron el rebote emisivo de pared y los
sprites de haze que producían la luz falsa izquierda.

Blackout tiene menor respuesta al arrastre, más gravedad, amortiguación y
profundidad de pliegue. Gasa y Tusor usan transmisión difusa frost dentro de un
material opaco, con distinta difusión y bloqueo de sombra. La malla full/lite
subió a 32x56 / 18x30, sumó constraints diagonales y de bending y dejó de mostrar
triángulos por ordenamiento alfa.

### Histórico r40 (reemplazado por r42)

La escena usa porcelanato PBR blanco (`porcelain_diff/nor/rough.jpg`, ambientCG
Porcelain001 CC0) con micro-relieve, roughness, clearcoat y juntas de placas
120x80 cm calculadas en world-space. La trama de pared también usa albedo y
normal reales. Las telas Blackout y Tusor tienen albedos procesados para
conservar fibra sin quemar blancos y normal maps de escala contenida. Ninguna
tela suma emisión ni controla bloom: sólo recibe iluminación BRDF y cada producto
tiene un techo de radiancia por debajo del umbral de bloom. Gasa conserva la trama
visible pero ya no reutiliza el albedo como máscara alfa, porque contra una pared
oscura la convertía en una malla negra. Su sombra bloquea 14%, Tusor 72% y
Blackout 100%.

La iluminación del ambiente responde a una curva exponencial calculada con el hueco físico
entre paños. El movimiento real del puntero excita brevemente esa apertura y la
energía atmosférica cae de manera orgánica después del gesto. En full/lite hay
28/12 capas de bruma pequeñas, desalineadas y animadas dentro del recorrido
ventana→piso. La luminancia de la ventana y la intensidad de bloom son
constantes: abrir sólo expone más área y aumenta la energía sobre los receptores.
El radial blur 2D y el viejo plano triangular quedan con intensidad cero porque
sumaban luz por encima de la tela. QA de interacción real: abertura
9,7%→48,5%, energía/glow 0,024→1,0.

### Base causal heredada de r39

Hecho: ambiente negro, HDR residual casi nulo y una sola luz expresiva: el sol
exterior que atraviesa el hueco real de la ventana. Se eliminaron el proyector,
el spot interior, la RectAreaLight y el HemisphereLight que iluminaban el piso
sin respetar pared ni cortina. La pared bloquea sombras por ambas caras y el
frustum cubre todo el piso visible; fuera del haz el porcelanato permanece oscuro.
Blackout tiene transmisión cero, Tusor intermedia y Gasa alta; la oclusión usa
`shadowBlock`, separada de la opacidad visual. El barral queda detrás del
ancho y del borde superior de la tela. La pared y el piso son de 80/200 unidades
para que sus límites no entren en cámara. El piso usa los mapas PBR CC0 de
porcelanato, `metalness: 0`, rugosidad alta y clearcoat bajo. No volver a un color gris uniforme para representar el
piso ni validar una superficie como texturada si no usa mapas visibles. A 60-190
cm funciona como ventana elevada; a partir de 200 cm como puerta-ventana al piso.

Ocultamiento inteligente de límites: un zócalo 3D absorbe la junta pared-piso;
las sombras usan `normalBias`, radio y frustum ajustados; el shader final suma
sólo halo localizado en el vano y una
viñeta asimétrica suave. El bloom es selectivo y la bruma se concentra cerca de
la fuente. No usar DOF, niebla global, grano, aberración ni blur del canvas para
disimular defectos: también borrarían trama, pliegues y respuesta del producto.
La mesa y el jarrón procedurales se eliminaron: no agregar objetos reconocibles
sin modelo curado y mapas PBR reales.

Física r39: `CURTAIN_BOTTOM` sólo define el largo visual; la colisión ocurre
contra `FLOOR_Y`, no contra un plano suspendido. Cada delta del puntero se
consume una vez en el primer subpaso para que no se acumule como fuerza continua.

Calidad adaptativa: `full` y `lite` mantienen escena, interacción, bloom y haze;
sólo cambian DPR, límite de píxeles, shadow map, resolución/muestras del pase,
topología de tela, anisotropía y cantidad de capas. Overrides QA:
`?quality=full` / `?quality=lite`.

QA r39: Playwright/Chrome recorrió carrusel real Blackout→Gasa→Tusor, drag, steppers,
cotizador y alturas 60/200 en mobile+desktop. Chrome acelerado por RTX 2060 Super
midió 144 FPS en tier full. Headless por software dio 2/11 FPS y no se usa como
medición absoluta. Capturas `r35-*` en `_scratch/`.
Prueba causal Blackout: abertura 9,0%→12,9%; el ROI exterior al haz se mantuvo
en 0,02→0,64/255 mientras la franja iluminada se ensanchó.

Pendiente / ideas anotadas:
- Juicio visual final de Agus sobre la ronda r39 (screenshots en `_scratch/`).
- Performance, permiso de orientación y sensación física en un teléfono real
  de gama media/baja; selección automática, tier lite y degradación dinámica
  ya están cubiertos por QA sintético.
- Cada push a main actualiza Pages; verificar el live con captura post-push.
- El copy del hint/label puede pasar por write-as-agus si Agus lo pide.
