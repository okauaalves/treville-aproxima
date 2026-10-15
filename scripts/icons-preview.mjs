// Monta screenshots/icons/preview.png para conferência visual dos ícones gerados.
import { Buffer } from 'node:buffer';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const CELL = 260;
const GAP = 40;
const LABEL = 44;
const CANVAS_BG = '#475569';

function squirclePath(size) {
  const points = [];
  const r = size / 2;
  for (let i = 0; i <= 360; i += 2) {
    const t = (i * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    points.push(`${r + r * Math.sign(c) * Math.abs(c) ** 0.5},${r + r * Math.sign(s) * Math.abs(s) ** 0.5}`);
  }
  return `M${points.join('L')}Z`;
}

const maskSvg = (size, shape) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${
      shape === 'circle'
        ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/>`
        : shape === 'squircle'
          ? `<path d="${squirclePath(size)}"/>`
          : `<rect width="${size}" height="${size}" rx="${size * 0.2237}"/>`
    }</svg>`,
  );

async function masked(buffer, size, shape) {
  return sharp(await sharp(buffer).resize(size, size).png().toBuffer())
    .composite([{ input: maskSvg(size, shape), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function onColor(buffer, color, size = 1024) {
  return sharp({ create: { width: size, height: size, channels: 4, background: color } })
    .composite([{ input: buffer }])
    .png()
    .toBuffer();
}

// Launcher mostra só os 72dp centrais do canvas de 108dp.
async function launcherView(foreground, background) {
  const full = await onColor(await sharp(foreground).resize(1024, 1024).toBuffer(), background);
  const visible = Math.round((1024 * 72) / 108);
  const offset = Math.round((1024 - visible) / 2);
  return sharp(full).extract({ left: offset, top: offset, width: visible, height: visible }).png().toBuffer();
}

async function safeZoneView(foreground, background) {
  const guides = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
      <rect x="${(1024 * 18) / 108}" y="${(1024 * 18) / 108}" width="${(1024 * 72) / 108}" height="${(1024 * 72) / 108}" fill="none" stroke="#FBBF24" stroke-width="6" stroke-dasharray="20 14"/>
      <circle cx="512" cy="512" r="${(1024 * 33) / 108}" fill="none" stroke="#22C55E" stroke-width="6"/>
    </svg>`,
  );
  return sharp(await onColor(foreground, background)).composite([{ input: guides }]).png().toBuffer();
}

async function phone(splash, background, width = 200) {
  const w = 220;
  const h = 476;
  const scale = w / 360;
  const img = await sharp(splash).resize(Math.round(width * scale)).png().toBuffer();
  const meta = await sharp(img).metadata();
  const body = await sharp({ create: { width: w, height: h, channels: 4, background } })
    .composite([{ input: img, left: Math.round((w - meta.width) / 2), top: Math.round((h - meta.height) / 2) }])
    .png()
    .toBuffer();
  const frame = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="28"/></svg>`,
  );
  return sharp(body).composite([{ input: frame, blend: 'dest-in' }]).png().toBuffer();
}

async function checker(size, tile = 16) {
  let rects = '';
  for (let y = 0; y < size; y += tile) {
    for (let x = 0; x < size; x += tile) {
      if ((x / tile + y / tile) % 2 === 0) rects += `<rect x="${x}" y="${y}" width="${tile}" height="${tile}" fill="#CBD5E1"/>`;
    }
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#F1F5F9"/>${rects}</svg>`,
  );
}

const label = (text, width) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL}"><text x="${width / 2}" y="28" font-family="Segoe UI, Arial, sans-serif" font-size="17" fill="#F8FAFC" text-anchor="middle">${text}</text></svg>`,
  );

export async function buildPreview({ root, assets, background }) {
  const file = (name) => join(assets, name);
  const fg = file('adaptive-icon.png');
  const launcher = await launcherView(fg, background);

  const row1 = [
    ['icon.png (iOS, sem alpha)', await masked(file('icon.png'), CELL, 'ios')],
    ['adaptive · círculo', await masked(launcher, CELL, 'circle')],
    ['adaptive · squircle', await masked(launcher, CELL, 'squircle')],
    ['adaptive · zona segura 66dp', await sharp(await safeZoneView(fg, background)).resize(CELL).png().toBuffer()],
    ['monochrome (Android 13+)', await masked(await launcherView(file('adaptive-icon-monochrome.png'), '#334155'), CELL, 'circle')],
  ];
  const favBig = await sharp(file('favicon.png')).resize(240, 240, { kernel: 'nearest' }).png().toBuffer();
  const row2 = [
    ['splash · escuro #0F172A', await phone(file('splash-icon.png'), background)],
    ['splash · claro #EEF2FF', await phone(file('splash-icon.png'), '#EEF2FF')],
    ['favicon 48px (×5)', await sharp(await checker(240)).composite([{ input: favBig }]).png().toBuffer()],
    ['favicon 1:1', await sharp(await checker(48, 8)).composite([{ input: file('favicon.png') }]).png().toBuffer()],
  ];

  const width = GAP + row1.length * (CELL + GAP);
  const row1Top = GAP;
  const row2Top = row1Top + CELL + LABEL + GAP;
  const height = row2Top + 476 + LABEL + GAP;
  const layers = [];
  const place = async (items, top, rowHeight) => {
    let left = GAP;
    for (const [text, buffer] of items) {
      const meta = await sharp(buffer).metadata();
      layers.push({ input: buffer, left: left + Math.round((CELL - meta.width) / 2), top: top + Math.round((rowHeight - meta.height) / 2) });
      layers.push({ input: label(text, CELL + GAP), left: left - GAP / 2, top: top + rowHeight });
      left += CELL + GAP;
    }
  };
  await place(row1, row1Top, CELL);
  await place(row2, row2Top, 476);

  const outDir = join(root, 'screenshots', 'icons');
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, 'preview.png');
  await sharp({ create: { width, height, channels: 4, background: CANVAS_BG } }).composite(layers).png().toFile(out);
  console.log(`preview -> ${out}`);
}
