# PLAN — Cortina viva

## Decisiones cerradas

- Repo standalone nuevo (no frontend-lab), vanilla HTML/CSS/JS, sin build, deploy GitHub Pages clásico (branch `main`/root, `.nojekyll`), mismo patrón que `rollershow-reviews`.
- Imágenes generadas con gpt-image-1 usando `ROLLERSHOW_OPENAI_API_KEY` (autorizado explícitamente por Agus para este proyecto, no es el default — ver `~/.claude/skills/design-frontier-director/references/agus-operating-lessons.md`).
- Texturas de tela: mirror-tiling (cuadrante + 3 reflejos en grilla 2x2) en vez de offset+feather-blur — el blur dejaba una costura cruzada visible. El mirror-tile garantiza continuidad de píxel exacta en cada borde.
- Física: mismo motor de `prototipo-tearable.html` (`createCloth`), `tearMult:999` (nunca se rasga), `fillAlpha` nuevo por fabric + blend modes `multiply`/`screen` para pliegues y luz golden-hour atravesando la tela.
- Gravedad vectorial (`gravityX`/`gravityY`) para soportar `deviceorientation`; permiso iOS se pide dentro del primer `touchstart`/`mousedown` ya existente, sin modal/botón extra.
- Carrusel: un solo mesh compartido, crossfade dibujando ambos fabrics con alpha interpolado (~550ms) — no tres canvas en paralelo.
- Ancho/Alto: steppers (no drag de esquinas, choca con el gesto de la tela), crecen/decrecen el `cloth-wrap` proporcionalmente dentro del área fotografiada del vidrio (`FRAME` en el JS), no hay mapeo cm→px real (no hay objeto de referencia física en la foto).
- CTA WhatsApp reusa número y tono de producción (`5491140813223`, "Hola! Quiero cotizar...").

## Bugs encontrados y resueltos durante el build

- **CSS del stage**: `height:100svh` + `max-width:100vw` + `aspect-ratio` simultáneos es ambiguo — el navegador terminaba usando 100vw x 100svh completo (violando el aspect-ratio), lo que hacía que `object-fit:cover` recortara los costados de la foto. Fix: `width:min(100vw, calc(100svh*1024/1536)); height:min(100svh, calc(100vw*1536/1024));` sin `aspect-ratio` — el truco clásico de "contain sin JS".
- **Overlap label/panel**: el nombre de producto (bottom:9%) quedaba tapado por el panel de medidas al aparecer. Fix: clase `.raised` (bottom:34%) agregada en `revealMeasurePanel()`.
- **Browser MCP pane (herramienta de preview del agente, no del proyecto)**: el screenshot colgaba de forma intermitente en esta sesión — resultó ser inestabilidad del propio panel de preview (colgaba incluso en una página HTML trivial), no un bug de la app. La verificación real se hizo con Playwright directo (`_scratch/verify.mjs`), que es la herramienta correcta para este chequeo de todos modos.
- Google Fonts (Fraunces/Inter) se sacó del todo: en el sandbox de preview el `<link>` externo bloqueaba el render indefinidamente si no había salida a internet. Se usan fuentes de sistema (Georgia itálica para el nombre de producto, ya da el look editorial buscado) — también reduce una dependencia externa y mejora LCP en producción.

## Abierto / a criterio (avisar si Agus quiere ajustar)

- `FRAME` (líneas ~JS, área del vidrio en % del stage: `top:.115 left:.245 right:.925 bottom:.78`) está calibrado a ojo sobre la foto generada. Si se regenera el fondo, recalibrar viendo un screenshot.
- Rango de steppers: 60-300cm ancho, 60-260cm alto, default 120x150.
- Tamaño de tile de cada textura (`tileDisplayPx`: blackout 34, gasa 26, torsor 40) es estético, no medido contra tela real.
- Copy del mensaje de WhatsApp calca el tono de producción tal cual, no pasó por `write-as-agus`.
