// One-off script: genera los assets con gpt-image-1 y los deja curados en img/.
// Correr a mano: npm run generate-assets (nunca en runtime del sitio ni en CI).
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const KEY = process.env.ROLLERSHOW_OPENAI_API_KEY;
if (!KEY) throw new Error('Falta ROLLERSHOW_OPENAI_API_KEY en el entorno');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, '_scratch', 'raw');
const IMG_DIR = path.join(ROOT, 'img');

const QUALITY = process.env.ASSET_QUALITY || 'medium'; // subir a 'high' solo en la corrida final aprobada

async function generateImage({ prompt, size, quality = QUALITY, background = 'opaque' }) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size, quality, background, n: 1 }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`OpenAI images API error: ${JSON.stringify(json, null, 2)}`);
  return Buffer.from(json.data[0].b64_json, 'base64');
}

const BACKGROUND_PROMPT =
  'Photorealistic interior photograph of a modern Buenos Aires apartment floor-to-ceiling ' +
  'window-door (puerta-ventana), closed glass panels, completely empty window with no ' +
  'curtains, no fabric, no curtain rod, no blinds visible anywhere. Warm golden hour ' +
  'sunlight streaming through the glass at a low angle, long soft shadows cast on a light ' +
  'plaster wall and warm wood floor. Shot on a full-frame camera, 35mm lens, shallow depth ' +
  'of field, editorial real-estate photography style, ultra high detail, natural light ' +
  'bleed on the window frame, cinematic warm color grade.';

const TEXTURES = [
  {
    key: 'tela-blackout-gris',
    prompt:
      'Seamless tileable fabric weave texture, flat top-down studio lighting, no shadows, ' +
      'no vignette, no fold, edge-to-edge uniform pattern, heavy weight blackout curtain ' +
      'fabric, dense tight weave, warm medium grey color, macro texture photography, ' +
      'evenly lit, seamless repeat pattern.',
  },
  {
    key: 'tela-gasa-beige',
    prompt:
      'Seamless tileable fabric weave texture, flat top-down studio lighting, no shadows, ' +
      'no vignette, no fold, edge-to-edge uniform pattern, sheer voile curtain fabric, ' +
      'light open weave, warm beige color, translucent threads visible, macro texture ' +
      'photography, evenly lit, seamless repeat pattern.',
  },
  {
    key: 'tela-torsor-blanco',
    prompt:
      'Seamless tileable fabric weave texture, flat top-down studio lighting, no shadows, ' +
      'no vignette, no fold, edge-to-edge uniform pattern, medium weight twisted yarn ' +
      'torsor curtain fabric, textured weave, warm off-white color, macro texture ' +
      'photography, evenly lit, seamless repeat pattern.',
  },
];

// Mirror-tiling: recorta un cuadrante central y lo compone con sus 3 reflejos
// (flop, flip, flip+flop) en una grilla 2x2. Garantiza continuidad exacta de
// píxel en cada borde (interno y de wrap-around) sin necesidad de content-aware
// fill — técnica estándar para texturas tileable, más robusta que un feather blend.
async function makeSeamlessTile(buffer, outPath, finalSize = 512) {
  const meta = await sharp(buffer).metadata();
  const shortSide = Math.min(meta.width, meta.height);
  const inset = Math.round(shortSide * 0.06); // recorta borde para evitar artefactos del modelo
  const cropSize = shortSide - inset * 2;

  const quad = await sharp(buffer)
    .extract({ left: inset, top: inset, width: cropSize, height: cropSize })
    .resize(finalSize, finalSize)
    .toBuffer();
  const quadFlopped = await sharp(quad).flop().toBuffer(); // espejo horizontal
  const quadFlipped = await sharp(quad).flip().toBuffer(); // espejo vertical
  const quadBoth = await sharp(quad).flip().flop().toBuffer();

  await sharp({
    create: { width: finalSize * 2, height: finalSize * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: quad, left: 0, top: 0 },
      { input: quadFlopped, left: finalSize, top: 0 },
      { input: quadFlipped, left: 0, top: finalSize },
      { input: quadBoth, left: finalSize, top: finalSize },
    ])
    .png()
    .toFile(outPath);
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(IMG_DIR, { recursive: true });

  const reprocessOnly = process.argv.includes('--reprocess-textures');

  if (!reprocessOnly) {
    console.log(`[1/4] Generando fondo golden-hour (quality=${QUALITY})...`);
    const bg = await generateImage({ prompt: BACKGROUND_PROMPT, size: '1024x1536' });
    await writeFile(path.join(RAW_DIR, 'ventana-golden-hour-raw.png'), bg);
    await sharp(bg).jpeg({ quality: 84 }).toFile(path.join(IMG_DIR, 'ventana-golden-hour.jpg'));
    await sharp(bg).toFormat('avif', { quality: 55 }).toFile(path.join(IMG_DIR, 'ventana-golden-hour.avif'));
    console.log('    listo -> img/ventana-golden-hour.{jpg,avif}');
  }

  let i = 2;
  for (const tex of TEXTURES) {
    const rawPath = path.join(RAW_DIR, `${tex.key}-raw.png`);
    let raw;
    if (reprocessOnly) {
      console.log(`[${i}/4] Reprocesando tile de ${tex.key} desde raw existente...`);
      raw = await readFile(rawPath);
    } else {
      console.log(`[${i}/4] Generando textura ${tex.key} (quality=${QUALITY})...`);
      raw = await generateImage({ prompt: tex.prompt, size: '1024x1024' });
      await writeFile(rawPath, raw);
    }
    await makeSeamlessTile(raw, path.join(IMG_DIR, `${tex.key}.png`));
    console.log(`    listo -> img/${tex.key}.png`);
    i++;
  }

  console.log('\nAssets generados. Revisar visualmente en img/ antes de commitear.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
