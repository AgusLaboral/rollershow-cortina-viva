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
- **Materiales de tela**: `MeshStandardMaterial` con alpha simple. PROHIBIDO
  `transmission` (MeshPhysicalMaterial): tira el framerate al piso (render
  interno extra por objeto) y no aporta nada — la opacidad ya deja ver el
  fondo real 3D. La traslucidez por producto vive en `PRODUCTS[i].opacity`,
  y su efecto en la luz en `sunFactor` (multiplica sol/fill/god-rays) +
  la opacidad del oclusor en el pase de god-rays.
- **Atmósfera**: la forma principal no es el viejo wedge geométrico. El haz
  combina oclusión radial, bloom, RectAreaLight y 18/9 sprites de bruma suave
  animados (full/lite). El plano con fBm queda sin intensidad para evitar las
  diagonales rectas que Agus rechazó. No resolver con blur global: destruiría
  pliegues y textura.
- **Receptores de luz**: fondo oscuro no implica materiales negros. Pared y
  piso usan MeshPhysical claro/medio con clearcoat; un SpotLight nace en la
  ventana y proyecta sobre piso, mesa lateral y cerámica. La mesa no es adorno:
  hace visible el rebote especular. La carpintería argentina queda blanca.
- **Texturas**: tileables chicas que se repiten (pedido de Agus: livianas pero
  detalladas). Telas: `img/tela-*.png` (gpt-image-1 + mirror-tiling en
  `scripts/generate-assets.mjs`) + normal maps derivados
  (`scripts/generate-normals.mjs`, Sobel sobre luminancia, no gastan API).
  Paredes/piso: PBR reales de Poly Haven en `img/env/` (plaster + wood, CC0).
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

## Estado al 2026-07-15 (ronda r38)

Hecho: ambiente negro con superficies reflectantes, HDR sólo como IBL, fuente
de ventana completa, proyector cálido, bloom, god-rays y bruma orgánica.
Blackout tiene transmisión cero, Tusor intermedia y Gasa alta; la oclusión usa
`shadowBlock`, separada de la opacidad visual. El barral queda detrás del
ancho y del borde superior de la tela. La pared y el piso son de 80/200 unidades
para que sus límites no entren en cámara. El piso usa los mapas PBR CC0
`wood_diff.jpg` + `wood_nor.jpg`: madera cálida real, `metalness: 0`, rugosidad
media y clearcoat mínimo. No volver a un color gris uniforme para representar el
piso ni validar una superficie como texturada si no usa mapas visibles. A 60-190
cm funciona como ventana elevada; a partir de 200 cm como puerta-ventana al piso.

Ocultamiento inteligente de límites: un zócalo 3D absorbe la junta pared-piso;
las sombras usan `normalBias`, radio y frustum ajustados; mesa y cerámica tienen
sombra de contacto; el shader final suma sólo halo localizado en el vano y una
viñeta asimétrica suave. El bloom es selectivo y la bruma se concentra cerca de
la fuente. No usar DOF, niebla global, grano, aberración ni blur del canvas para
disimular defectos: también borrarían trama, pliegues y respuesta del producto.

Calidad adaptativa: `full` y `lite` mantienen escena, interacción, bloom y haze;
sólo cambian DPR, límite de píxeles, shadow map, resolución/muestras del pase,
topología de tela, anisotropía y cantidad de capas. Overrides QA:
`?quality=full` / `?quality=lite`.

QA r38: Playwright/Chrome recorrió carrusel real Blackout→Gasa→Tusor, drag, steppers,
cotizador y alturas 60/200 en mobile+desktop. Chrome acelerado por RTX 2060 Super
midió 144 FPS en tier full. Headless por software dio 2/11 FPS y no se usa como
medición absoluta. Capturas `r35-*` en `_scratch/`.

Pendiente / ideas anotadas:
- Juicio visual final de Agus sobre la ronda r36 (screenshots en `_scratch/`).
- Performance en un teléfono físico de gama media/baja; el tier lite ya baja
  resolución/muestras/capas sin cambiar el producto.
- Cada push a main actualiza Pages; verificar el live con captura post-push.
- El copy del hint/label puede pasar por write-as-agus si Agus lo pide.
