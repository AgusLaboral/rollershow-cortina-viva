// Deriva un normal map tangent-space a partir de cada textura de tela tileable
// ya generada (luminancia -> heightmap -> gradiente Sobel -> normal RGB).
// No llama a ninguna API: reusa los PNG existentes en img/tela-*.png.
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG_DIR = path.join(ROOT, 'img');
const STRENGTH = 2.2; // cuanto más alto, relieve más marcado

async function makeNormalMap(srcPath, outPath) {
  const { data, info } = await sharp(srcPath).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const h = (x, y) => {
    const xi = (x + width) % width, yi = (y + height) % height; // wrap: la textura es tileable
    return data[yi * width + xi] / 255;
  };
  const out = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * STRENGTH;
      const dy = (h(x, y + 1) - h(x, y - 1)) * STRENGTH;
      // normal tangent-space: z siempre positivo (mira a cámara), xy codifica la pendiente
      let nx = -dx, ny = -dy, nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len; ny /= len; nz /= len;
      const idx = (y * width + x) * 3;
      out[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      out[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }
  await sharp(out, { raw: { width, height, channels: 3 } }).png().toFile(outPath);
}

async function main() {
  const files = (await readdir(IMG_DIR)).filter((f) => f.startsWith('tela-') && f.endsWith('.png'));
  for (const f of files) {
    const out = path.join(IMG_DIR, f.replace('tela-', 'normal-'));
    await makeNormalMap(path.join(IMG_DIR, f), out);
    console.log(`${f} -> ${path.basename(out)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
