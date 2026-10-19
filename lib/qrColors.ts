/** Preferência de cor dos módulos do QR (foreground). Fundo sempre branco. */

export const QR_BACKGROUND_COLOR = '#FFFFFF';
export const QR_FOREGROUND_DEFAULT = '#000000';

/** Contraste mínimo WCAG AA texto normal (cor vs fundo branco). */
export const QR_MIN_CONTRAST = 4.5;

export const QR_CONTRAST_BLOCK_MESSAGE =
  'Essa cor pode dificultar a leitura do QR Code, escolha uma mais escura';

export type QrPaletteId = 'black' | 'navy' | 'darkGreen' | 'wine' | 'darkPurple';

export interface QrPaletteColor {
  id: QrPaletteId;
  label: string;
  hex: string;
}

/** Paleta pré-aprovada (todas ≥ 4.5:1 vs #FFFFFF). */
export const QR_PALETTE: readonly QrPaletteColor[] = [
  { id: 'black', label: 'Preto', hex: '#000000' },
  { id: 'navy', label: 'Azul marinho', hex: '#001F3F' },
  { id: 'darkGreen', label: 'Verde escuro', hex: '#14532D' },
  { id: 'wine', label: 'Vinho', hex: '#5C0A1A' },
  { id: 'darkPurple', label: 'Roxo escuro', hex: '#2E1065' },
] as const;

const HEX_RE = /^#([0-9A-Fa-f]{6})$/;

export function normalizeQrHex(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!HEX_RE.test(withHash)) {
    return null;
  }
  return withHash.toUpperCase();
}

function channelLinear(byte: number): number {
  const c = byte / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa WCAG (0–1). */
export function relativeLuminance(hex: string): number | null {
  const normalized = normalizeQrHex(hex);
  if (!normalized) {
    return null;
  }
  const value = Number.parseInt(normalized.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return 0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b);
}

/** Razão de contraste entre duas cores (maior/menor). */
export function contrastRatio(foreground: string, background: string): number | null {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  if (l1 === null || l2 === null) {
    return null;
  }
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function contrastAgainstWhite(hex: string): number | null {
  return contrastRatio(hex, QR_BACKGROUND_COLOR);
}

export function isQrForegroundAllowed(hex: string): boolean {
  const ratio = contrastAgainstWhite(hex);
  return ratio !== null && ratio >= QR_MIN_CONTRAST;
}

export type QrColorCheck =
  | { ok: true; hex: string; contrast: number }
  | { ok: false; error: string };

/** Valida hex livre: formato + contraste ≥ 4.5:1 vs branco. */
export function checkQrForeground(input: string): QrColorCheck {
  const hex = normalizeQrHex(input);
  if (!hex) {
    return { ok: false, error: 'Use uma cor no formato #RRGGBB.' };
  }
  const contrast = contrastAgainstWhite(hex);
  if (contrast === null || contrast < QR_MIN_CONTRAST) {
    return { ok: false, error: QR_CONTRAST_BLOCK_MESSAGE };
  }
  return { ok: true, hex, contrast };
}

/** Cor efetiva: preferência salva se válida, senão preto. */
export function getEffectiveQrForeground(stored: string | null | undefined): string {
  const check = stored ? checkQrForeground(stored) : null;
  return check?.ok ? check.hex : QR_FOREGROUND_DEFAULT;
}

export function qrColorStorageKey(userId: string): string {
  return `qr_foreground_color:${userId}`;
}

export function labelForQrHex(hex: string): string {
  const normalized = normalizeQrHex(hex) ?? QR_FOREGROUND_DEFAULT;
  const preset = QR_PALETTE.find((item) => item.hex.toUpperCase() === normalized);
  return preset?.label ?? normalized;
}
