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
    ventana (layer 1, `glowPlane`); la cortina se pinta negro CON la opacidad
    de su tela → la gasa deja pasar ~45% del haz, el blackout 0. El shader
    (`GODRAY_FRAG`) acumula muestras radiales desde el centro de la ventana.
  - HDRI fotográfico `img/env/sunset.hdr` (Poly Haven venice_sunset 1k, CC0):
    es lo que se VE por la ventana (scene.background con
    `backgroundBlurriness=0.22` = el haze cálido pedido) y da la IBL suave
    (`environmentIntensity` bajo; el sol real lo pone la DirectionalLight).
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
- **Texturas**: tileables chicas que se repiten (pedido de Agus: livianas pero
  detalladas). Telas: `img/tela-*.png` (gpt-image-1 + mirror-tiling en
  `scripts/generate-assets.mjs`) + normal maps derivados
  (`scripts/generate-normals.mjs`, Sobel sobre luminancia, no gastan API).
  Paredes/piso: PBR reales de Poly Haven en `img/env/` (plaster + wood, CC0).
- **Interacción**: hover SIN clic en desktop (mouseenter/mousemove), dedo en
  mobile (touchmove con preventDefault), acelerómetro (`deviceorientation`,
  permiso iOS pedido en el primer gesto táctil, sin botón dedicado). El
  puntero se proyecta al plano de la cortina por raycast (`pointerToWorld`).
- **Carrusel**: 2 mallas (meshA/meshB) sobre la MISMA física; crossfade de
  opacity + lerp de parámetros físicos y de luz (`sunFactor` → sol, fill,
  god-rays) en ~560ms. Blackout Gris / Gasa Beige / Torsor Blanco.
- **Medidas → WhatsApp**: steppers (60-300 x 60-260cm, paso 10) reconstruyen
  la malla (`applySize()`); CTA `wa.me/5491140813223` con producto+medidas.
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

## Estado al 2026-07-15 (ronda r32)

Hecho: escena 3D completa con god-rays por oclusión real de la cortina, HDRI
golden hour por la ventana, PBR en paredes/piso, cuarto cerrado, luz interior
tenue fija (legibilidad del blackout), pliegues de pinza como reposo físico,
carrusel con luz reactiva, steppers, CTA y encuadre responsive. Las medidas
ahora reconstruyen juntas ventana, marco, barral, haz, cortina y cámara sin
perder el foco del producto. RectAreaLight suma envolvente suave; SMAA queda
solo en desktop y mobile limita pixel ratio a 1.5 + shadow map 512.

QA r31/r32: Playwright recorrió Blackout, Gasa y Tusor, deformación, 120×150 y
240×220 en mobile y desktop sin errores de página. Capturas en `_scratch/`.
Los FPS headless (5 mobile / 2 desktop) son render por software y no representan
GPU real; sirven únicamente como línea base comparativa.

Pendiente / ideas anotadas:
- Juicio visual final de Agus sobre la ronda r32 (screenshots en `_scratch/`).
- Performance en un teléfono físico de gama media/baja; shadow map 512 y
  pixelRatio 1.5 ya están aplicados. Si no alcanza, degradar god-rays por FPS.
- Cada push a main actualiza Pages; verificar el live con captura post-push.
- El copy del hint/label puede pasar por write-as-agus si Agus lo pide.
