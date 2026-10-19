import QRCode from 'qrcode';
import { mkdirSync, writeFileSync } from 'node:fs';

const FG = '#000000';
const BG = '#FFFFFF';

function qrSvg(text, size = 150, margin = 2) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const count = modules.size;
  const total = count + margin * 2;
  let path = '';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (modules.get(row, col)) {
        path += `M${col + margin} ${row + margin}h1v1h-1z`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${BG}"/><path d="${path}" fill="${FG}"/></svg>`;
}

const items = ['A2B3C4', 'D5E6F7', 'G8H9J2', 'K3L4M5', 'N6P7Q8'].map((id, index) => ({
  id,
  name: `Lote ${index + 1}`,
  destination_type: 'empty',
}));

const cells = items
  .map(
    (item) =>
      `<div class="cell">${qrSvg(`https://r.co/${item.id}`)}<div class="id">${item.id}</div><div class="name">${item.name}</div></div>`,
  )
  .join('');

const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Lote — QR Codes</title><style>
@page { size: A4; margin: 16mm 12mm; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px 12px; }
.cell { display: flex; flex-direction: column; align-items: center; padding: 10px 4px; border: 1px dashed #C7D2FE; break-inside: avoid; }
</style></head><body><div class="grid">${cells}</div></body></html>`;

mkdirSync('tmp', { recursive: true });
writeFileSync('tmp/batch-smoke-5.html', html);

console.log(
  JSON.stringify({
    cells: items.length,
    hasBlack: html.includes('fill="#000000"'),
    hasWhite: html.includes('fill="#FFFFFF"'),
    grid3: html.includes('repeat(3, 1fr)'),
    ids: items.map((item) => item.id),
    bytes: html.length,
    file: 'tmp/batch-smoke-5.html',
  }),
);
