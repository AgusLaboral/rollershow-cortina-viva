# PLAN — Cortina viva

> Estado vivo del proyecto. La guía técnica completa está en **AGENTS.md**.

## Decisiones cerradas (v3 — escena 3D)

- Repo standalone (no frontend-lab), sin build, GitHub Pages `main`/root.
  Live: https://aguslaboral.github.io/rollershow-cortina-viva/
- **v3 = escena 3D Three.js**. Las dos versiones anteriores quedaron descartadas
  por decisión de Agus:
  - v1 (foto de fondo + textura tileable sobre física 2D): parecía roller, no
    tradicional; la iluminación estaba horneada en la foto.
  - v2 (foto hiperreal de cortina warpeada por triángulos en canvas 2D):
    costuras de gradiente visibles en tela lisa + framerate malo. Tercer parche
    fallido = replantear (regla de Agus) → WebGL/3D.
- **La fuente de luz es la ventana** (exigencia explícita). Sol afuera del
  cuarto + pared con agujero que bloquea + god-rays por oclusión real de la
  cortina (la transparencia de la tela modula el haz). HDRI golden hour de
  Poly Haven visible por la ventana con blur (haze). Detalle en AGENTS.md.
- Blackout: opaco total, castShadow, cuarto en penumbra con luz interior tenue
  fija para legibilidad. Gasa/Torsor: translúcidas, el ambiente se ilumina.
- Interacción: hover sin clic (desktop) / dedo (mobile) / acelerómetro.
  Física Verlet con plegado de pinza como estado de reposo.
- Steppers 60-300 x 60-260cm (default 120x150) + CTA WhatsApp producción
  (`5491140813223`), aparecen tras la primera interacción.
- Imágenes: gpt-image-1 autorizado por Agus (telas tileable) + normal maps
  derivados por Sobel + recursos CC0 Poly Haven (HDRI, PBR pared/piso).

## Historial de bugs resueltos

- v1/v2: ver historial git. Claves: mirror-tiling para texturas (el
  offset+feather dejaba cruz visible), CSS del stage contain-sin-JS,
  Google Fonts eliminado (bloqueaba render en sandbox y suma LCP).
- v3: pared con hueco por ShapeGeometry (los 4 paneles a mano tenían gaps);
  `transmission` eliminado (5fps → alpha simple); pase de oclusión con
  autoClear manual (si no el segundo render pisaba el primero); HDRI rotado
  2.196 rad (sol localizado analizando el archivo con `_scratch/find-sun.mjs`);
  cuarto cerrado (sin pared derecha/techo entraba sol con blackout puesto);
  luz interior fija (blackout ilegible); encuadre retrato (cámara más lejos
  y FOV más abierto bajo aspect 0.8).

## v4 (2026-07-15, tarde) — escenario de oscuridad

Pivote de dirección de arte decidido por Agus: **sin cuarto**. Oscuridad total,
la ventana como único objeto 3D (marco aluminio + barral + vidrio) y única
fuente de luz (HDRI golden hour blureado detrás + sol direccional + god-rays).
Piso de estudio negro apenas reflectante. Look fotográfico: viñeta + grano en
el shader final.

Transición de carrusel: CINEMÁTICA (la física pura falló 3 veces: enredo,
alfombra voladora, alas — regla del tercer parche → replanteo). La saliente se
pliega hacia su borde y sale; la entrante llega plegada y se despliega, con
lag por fila. La física libre (hover/gravedad/tilt) retoma al terminar.
Física en sub-pasos fijos de 1/60s => idéntica a cualquier framerate.

## Pendiente inmediato

1. Juicio visual de Agus sobre la ronda actual (screenshots `_scratch/r15-*`).
2. Push a main → Pages se actualiza → verificar live con screenshot (gate).
3. Perf en móvil real de gama media/baja (headless no es representativo).

## Abierto / a criterio

- Calibración fina de PLEAT_COUNT/AMPLITUDE y parámetros físicos por tela.
- Copy de hint y mensaje de WhatsApp: calca producción, no pasó por write-as-agus.
- Si Agus quiere el disco del sol visible por la ventana: bajar
  backgroundBlurriness (hoy 0.22) o subir backgroundIntensity.
