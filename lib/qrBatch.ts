import QRCode from 'qrcode';

import { QR_BACKGROUND_COLOR, QR_FOREGROUND_COLOR } from '@/utils/qrcode';

import { buildDestination, EMPTY_DESTINATION } from '@/lib/plaquinhaLogic';
import { checkBatchInput, type BatchType, type Checked } from '@/supabase/functions/_shared/adminAccess';

export { BATCH_MAX, BATCH_PREFIX_MAX, BATCH_TYPES, batchNames, type BatchType } from '@/supabase/functions/_shared/adminAccess';

export const BATCH_TYPE_LABELS: Record<BatchType, string> = {
  url: 'URL',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  profile: 'Perfil',
  empty: 'Vazio',
};

/** Blocos enviados à função admin: o progresso avança a cada bloco. */
export const BATCH_CHUNK = 5;

export interface BatchForm {
  quantity: string;
  prefix: string;
  type: BatchType;
  url: string;
}

export interface BatchRequest {
  quantity: number;
  prefix: string;
  type: BatchType;
  url: string | null;
}

/** Aceita número/@ além de link: WhatsApp vira wa.me, Instagram vira instagram.com, URL ganha https://. */
export function resolveBatchUrl(type: BatchType, raw: string): Checked<string | null> {
  const value = raw.trim();
  if (!value || type === 'profile' || type === 'empty') {
    return { ok: true, value: null };
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  if (type === 'whatsapp' && !hasScheme && !/^(wa\.me|api\.whatsapp\.com)\//i.test(value)) {
    const built = buildDestination({ ...EMPTY_DESTINATION, type: 'whatsapp', phone: value });
    return built.ok ? { ok: true, value: built.url } : { ok: false, error: built.error };
  }
  if (type === 'instagram' && !hasScheme && !/instagram\.com\//i.test(value)) {
    const built = buildDestination({ ...EMPTY_DESTINATION, type: 'instagram', instagram: value });
    return built.ok ? { ok: true, value: built.url } : { ok: false, error: built.error };
  }
  return { ok: true, value: hasScheme ? value : `https://${value}` };
}

/** Mesma regra que a Edge Function aplica (checkBatchInput), para errar antes de chamar o servidor. */
export function validateBatchForm(form: BatchForm): Checked<BatchRequest> {
  const quantity = Number(form.quantity.trim());
  const url = resolveBatchUrl(form.type, form.url);
  if (!url.ok) {
    return url;
  }
  const checked = checkBatchInput({ quantity, start: 1, prefix: form.prefix, type: form.type, url: url.value });
  if (!checked.ok) {
    return checked;
  }
  const { prefix, type } = checked.value;
  return { ok: true, value: { quantity, prefix, type, url: checked.value.url } };
}

export function batchChunks(quantity: number, size = BATCH_CHUNK): { start: number; quantity: number }[] {
  const chunks: { start: number; quantity: number }[] = [];
  for (let start = 1; start <= quantity; start += size) {
    chunks.push({ start, quantity: Math.min(size, quantity - start + 1) });
  }
  return chunks;
}

/** Ordena 'Mesa 2' antes de 'Mesa 10'. */
export function sortByBatchNumber<T extends { name: string }>(items: T[]): T[] {
  const number = (name: string) => Number(/(\d+)\s*$/.exec(name)?.[1] ?? 0);
  return [...items].sort((a, b) => number(a.name) - number(b.name));
}

export interface BatchResultItem {
  id: string;
  name: string;
  destination_url: string;
  destination_type: string;
}

export function batchDestinationLabel(item: Pick<BatchResultItem, 'destination_type' | 'destination_url'>): string {
  if (item.destination_type === 'empty') {
    return 'Sem destino';
  }
  if (item.destination_type === 'profile') {
    return 'Perfil';
  }
  return item.destination_url;
}

/** Célula CSV: neutraliza fórmula (= + - @ tab CR viram texto com ') e aplica aspas quando preciso. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function batchToCsv(items: BatchResultItem[], linkUrl: (id: string) => string): string {
  const lines = [['id', 'nome', 'url_curta', 'destino'].join(',')];
  for (const item of items) {
    lines.push([item.id, item.name, linkUrl(item.id), batchDestinationLabel(item)].map(csvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** QR em SVG puro (um único path), sem depender de canvas ou view-shot. Fundo sempre branco. */
export function qrSvg(text: string, size = 150, margin = 2, foregroundColor: string = QR_FOREGROUND_COLOR): string {
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${QR_BACKGROUND_COLOR}"/><path d="${path}" fill="${foregroundColor}"/></svg>`;
}

/** A4 com grid de 3 por linha: QR 150px, ID e nome abaixo. Usa preferência do usuário logado (admin) se passada. */
export function batchPdfHtml(
  items: BatchResultItem[],
  linkUrl: (id: string) => string,
  title = 'Plaquinhas',
  foregroundColor: string = QR_FOREGROUND_COLOR,
): string {
  const cells = items
    .map(
      (item) =>
        `<div class="cell">${qrSvg(linkUrl(item.id), 150, 2, foregroundColor)}<div class="id">${escapeHtml(item.id)}</div><div class="name">${escapeHtml(item.name)}</div></div>`,
    )
    .join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>
@page { size: A4; margin: 16mm 12mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0F172A; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px 12px; }
.cell { display: flex; flex-direction: column; align-items: center; padding: 10px 4px; border: 1px dashed #C7D2FE; border-radius: 8px; break-inside: avoid; page-break-inside: avoid; }
.cell svg { width: 150px; height: 150px; }
.id { margin-top: 6px; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 15px; font-weight: 700; letter-spacing: 1px; }
.name { margin-top: 2px; font-size: 12px; color: #475569; text-align: center; word-break: break-word; }
</style></head><body><div class="grid">${cells}</div></body></html>`;
}
