// Gera os ícones do app a partir de public/logo.svg (mesma fonte do TrevilleLogo).
// Uso: node scripts/generate-icons.mjs [--preview]
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'public', 'logo.svg');
const ASSETS = join(ROOT, 'assets');
const ICON_BACKGROUND = '#0F172A';
const LOGO_BLUE = '#3B82F6';

const rawSvg = readFileSync(SOURCE, 'utf8');
const [, , vbWidth, vbHeight] = rawSvg.match(/viewBox="([^"]+)"/)[1].trim().split(/\s+/).map(Number);

function svgAt(width, color) {
  const height = (width * vbHeight) / vbWidth;
  return Buffer.from(
    rawSvg
      .replace(/width="[^"]*mm"/, `width="${width}"`)
      .replace(/height="[^"]*mm"/, `height="${height}"`)
      .replaceAll(LOGO_BLUE, color),
  );
}

async function renderLogo(width, color = LOGO_BLUE) {
  return sharp(svgAt(width, color)).png().toBuffer();
}

// Distância (em fração da largura) do pixel opaco mais afastado até o centro do logo.
// O logo tem conteúdo nos cantos do bounding box, então o raio real é o que importa
// para caber nas máscaras circulares do Android.
async function farthestRadiusRatio() {
  const width = 1000;
  const { data, info } = await sharp(await renderLogo(width)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cx = info.width / 2;
  const cy = info.height / 2;
  let max = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 24) max = Math.max(max, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
    }
  }
  return max / width;
}

async function square(size, logoWidth, { background, color } = {}) {
  const logo = await renderLogo(Math.round(logoWidth), color);
  const meta = await sharp(logo).metadata();
  const image = sharp({
    create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: logo, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) }]);
  return image.png().toBuffer();
}

async function write(name, buffer) {
  const file = join(ASSETS, name);
  await sharp(buffer).png({ compressionLevel: 9 }).toFile(file);
  const meta = await sharp(file).metadata();
  console.log(`${name.padEnd(32)} ${meta.width}x${meta.height} alpha=${meta.hasAlpha}`);
}

const radiusRatio = await farthestRadiusRatio();
const SIZE = 1024;

// iOS: App Store rejeita ícone com canal alpha, então o fundo é sólido e o alpha é removido.
const icon = await sharp(await square(SIZE, SIZE * 0.7)).flatten({ background: ICON_BACKGROUND }).removeAlpha().png().toBuffer();
await write('icon.png', icon);

// Android adaptive: canvas de 108dp, só o círculo central de 66dp é garantido visível.
const safeRadius = (SIZE * (33 / 108)) * 0.97;
const adaptiveWidth = Math.min(SIZE * 0.6, safeRadius / radiusRatio);
await write('adaptive-icon.png', await square(SIZE, adaptiveWidth));
await write('adaptive-icon-monochrome.png', await square(SIZE, adaptiveWidth, { color: '#FFFFFF' }));

// Splash: exibido com imageWidth 200dp; 1024px cobre densidades altas. O logo cabe no
// círculo inscrito porque o Android 12+ recorta o ícone do splash em círculo.
await write('splash-icon.png', await square(SIZE, Math.min(SIZE * 0.9, (SIZE / 2) * 0.92 / radiusRatio)));

await write('favicon.png', await square(48, 46));

if (process.argv.includes('--preview')) {
  const { buildPreview } = await import('./icons-preview.mjs');
  await buildPreview({ root: ROOT, assets: ASSETS, background: ICON_BACKGROUND });
}
