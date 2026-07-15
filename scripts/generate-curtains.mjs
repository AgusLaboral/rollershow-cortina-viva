// Genera los 3 paneles de cortina tradicional (hiperreales, con pliegues verticales),
// como imagen que LLENA el frame de borde a borde para mapearla sobre el mesh de física.
// Uso: node scripts/generate-curtains.mjs         (quality medium, para iterar)
//      ASSET_QUALITY=high node scripts/generate-curtains.mjs   (final aprobado)
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const KEY = process.env.ROLLERSHOW_OPENAI_API_KEY;
if (!KEY) throw new Error('Falta ROLLERSHOW_OPENAI_API_KEY en el entorno');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(ROOT, '_scratch', 'raw');
const IMG_DIR = path.join(ROOT, 'img');
const QUALITY = process.env.ASSET_QUALITY || 'medium';

async function generateImage({ prompt, size, quality = QUALITY }) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size, quality, background: 'opaque', n: 1 }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`OpenAI images API error: ${JSON.stringify(json, null, 2)}`);
  return Buffer.from(json.data[0].b64_json, 'base64');
}

const FILL = 'The drapery fills the entire image frame edge to edge, top to bottom, ' +
  'with no gaps, no rod, no wall, no floor, no window and no background visible, just the fabric. ' +
  'Vertical orientation, evenly diffused soft front studio lighting, photorealistic, ultra sharp fabric detail.';

const CURTAINS = [
  {
    key: 'curtain-blackout-gris',
    prompt:
      'Hyperrealistic traditional pleated drapery curtain, heavy fully opaque blackout fabric ' +
      'in deep charcoal grey, elegant regular vertical pinch pleats and soft folds running from ' +
      'top to bottom, deep soft shadows in the fold valleys and gentle highlights on the fold ' +
      'crests, luxurious matte velvety drape, rich and dense, no light passing through. ' + FILL,
  },
  {
    key: 'curtain-gasa-beige',
    prompt:
      'Hyperrealistic traditional sheer voile curtain, light translucent airy open-weave gauze ' +
      'in warm beige, delicate regular vertical folds and soft gathers running top to bottom, ' +
      'luminous glowing highlights, ethereal and weightless, fine visible threads. ' + FILL,
  },
  {
    key: 'curtain-torsor-blanco',
    prompt:
      'Hyperrealistic traditional curtain made of textured twisted-yarn torsor weave in warm ' +
      'off-white cream, elegant regular vertical pleats and soft folds top to bottom, subtle ' +
      'shadows in the valleys and soft highlights on the crests, medium weight natural linen-like ' +
      'drape, tactile woven texture. ' + FILL,
  },
];

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(IMG_DIR, { recursive: true });
  const reprocess = process.argv.includes('--reprocess');

  let i = 1;
  for (const c of CURTAINS) {
    const rawPath = path.join(RAW_DIR, `${c.key}-raw.png`);
    let raw;
    if (reprocess) {
      console.log(`[${i}/3] Reprocesando ${c.key} desde raw...`);
      raw = await readFile(rawPath);
    } else {
      console.log(`[${i}/3] Generando ${c.key} (quality=${QUALITY})...`);
      raw = await generateImage({ prompt: c.prompt, size: '1024x1536' });
      await writeFile(rawPath, raw);
    }
    // Panel a tamaño manejable para el warp por mesh (no hace falta 1024px por celda).
    await sharp(raw).resize(720, 1080).png({ quality: 92 }).toFile(path.join(IMG_DIR, `${c.key}.png`));
    console.log(`    listo -> img/${c.key}.png`);
    i++;
  }
  console.log('\nCortinas generadas. Revisar en img/ antes de usar.');
}

main().catch((e) => { console.error(e); process.exit(1); });
