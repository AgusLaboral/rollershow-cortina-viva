# Rollershow — Cortina viva

Hero interactivo para cortinas tradicionales Rollershow: una foto realista de una puerta-ventana en golden hour, con una cortina roller renderizada por física de tela (canvas 2D, no imagen estática) que reacciona al mouse, al dedo o al acelerómetro del celular. Carrusel entre Blackout Gris, Gasa Beige y Torsor Blanco sobre el mismo fondo. Tras la primera interacción aparecen dos steppers de Ancho/Alto (cm) y un CTA a WhatsApp con el producto y las medidas.

**Sitio vivo**: https://aguslaboral.github.io/rollershow-cortina-viva/

> Repo propio e independiente, mismo patrón que `rollershow-reviews`: no comparte historia con `rollershow` (landing) ni `rollershow-src` (frontend-lab de Nico).

- **`index.html`** — single-file, vanilla HTML+CSS+JS, sin build ni dependencias en producción. Mobile-first.
- **`img/`** — foto de fondo (golden hour, sin cortina) + 3 texturas de tela tileable, generadas con gpt-image-1.
- **`scripts/generate-assets.mjs`** — genera los 4 assets vía OpenAI Images API (`ROLLERSHOW_OPENAI_API_KEY`). Correr a mano, nunca en runtime del sitio. `--reprocess-textures` reprocesa el tileo de las texturas sin volver a gastar API.
- **`_scratch/`** — efímeros (screenshots de verificación, raw de imágenes generadas), ignorado.
- **`PLAN.md`** — decisiones de diseño y pendientes reales.

## Motor de física

Reusa `createCloth` de `prototipo-tearable.html` (simulador de cortinas que se rasgan): Verlet integration + mass-spring, fila superior pinned al roller. Acá `tearMult:999` (nunca se rasga) y se agregó `fillAlpha` + blend modes (`multiply`/`screen`) para la translucidez y el golden-hour atravesando la tela, y gravedad vectorial para el acelerómetro.

## Verificación

```bash
npm install                       # instala sharp + playwright (devDependencies)
python -m http.server 8934        # servir la carpeta
node _scratch/verify.mjs          # funcional: drag, carrusel, steppers, href de WhatsApp — 3 viewports
```

Screenshots quedan en `_scratch/screenshot-*.png` (gitignorado).

## Nota de escala (ancho/alto)

Los steppers no mapean cm reales 1:1 contra la foto (no hay forma honesta de hacerlo sin un objeto de referencia física): el cloth-wrap crece/decrece proporcionalmente dentro del área fotografiada del vidrio, centrado, ranurado desde el roller superior. Es un mecanismo de configuración y captura de intención, no un medidor preciso.

Detalle completo en `PLAN.md`.
