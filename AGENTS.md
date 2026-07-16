# rollershow-cortina-viva — guía para agentes

Landing interactiva de **cortinas tradicionales** RollerShow: una escena 3D donde
el usuario mueve una cortina real (física de tela) con el mouse (hover, sin clic),
el dedo (touch) o inclinando el teléfono (acelerómetro), pasa entre 3 productos
con un carrusel, fija ancho/alto con steppers y pide presupuesto por WhatsApp.

**Deploy:** GitHub Pages sirviendo `main`/root → https://aguslaboral.github.io/rollershow-cortina-viva/
Sin build step: `index.html` + `main.js` son el entregable. `.nojekyll` en raíz.
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
  de luz ambiental vive en `sunFactor`; la sombra, en `shadowBlock`.
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

## Estado al 2026-07-16 (ronda r44)

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
- Performance en un teléfono físico de gama media/baja; el tier lite ya baja
  resolución/muestras/capas sin cambiar el producto.
- Cada push a main actualiza Pages; verificar el live con captura post-push.
- El copy del hint/label puede pasar por write-as-agus si Agus lo pide.
