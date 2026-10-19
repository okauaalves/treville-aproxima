export type BrandPalette = {
  primary: string;
  secondary: string;
  tertiary: string;
};

export const FALLBACK_PALETTE: BrandPalette = {
  primary: '#3B82F6',
  secondary: '#2563EB',
  tertiary: '#0F172A',
};

/** Azul usado em bordas/glow quando a logo não rende um accent útil. */
export const ACCENT_FALLBACK = '#2F5FE0';

type Rgb = { r: number; g: number; b: number };

const NEAR_WHITE = 245;
const NEAR_BLACK = 18;
const GRAY_SATURATION = 0.12;
const LUM_TOO_LIGHT = 0.72;
const LUM_TOO_DARK = 0.18;

export function normalizeHex(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }
  const raw = input.trim();
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const expanded = hex
      .split('')
      .map((c) => `${c}${c}`)
      .join('');
    return `#${expanded.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{8}$/.test(hex)) {
    return `#${hex.slice(0, 6).toUpperCase()}`;
  }
  return null;
}

export function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    return null;
  }
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  return { r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b) };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const to = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

/**
 * Ajusta luminância de cores muito claras/escuras para bordas legíveis.
 * Branco/preto/cinza → fallback azul.
 */
export function accentForBorders(hex: string | null | undefined): string {
  const normalized = normalizeHex(hex);
  if (!normalized || isNearWhite(normalized) || isNearBlack(normalized)) {
    return ACCENT_FALLBACK;
  }
  const rgb = hexToRgb(normalized);
  if (!rgb) {
    return ACCENT_FALLBACK;
  }
  if (saturation(rgb) < GRAY_SATURATION) {
    return ACCENT_FALLBACK;
  }
  const lum = relativeLuminance(rgb);
  if (lum > LUM_TOO_LIGHT) {
    return rgbToHex(mixRgb(rgb, { r: 15, g: 23, b: 42 }, 0.45));
  }
  if (lum < LUM_TOO_DARK) {
    return rgbToHex(mixRgb(rgb, { r: 96, g: 165, b: 250 }, 0.55));
  }
  return normalized;
}

/** Accent de borda a partir da paleta extraída da logo. */
export function borderAccentFromPalette(palette: BrandPalette): string {
  return accentForBorders(palette.primary);
}

/** Saturação HSL 0–1. */
export function saturation({ r, g, b }: Rgb): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const delta = max - min;
  if (delta === 0) {
    return 0;
  }
  const light = (max + min) / 2;
  return delta / (1 - Math.abs(2 * light - 1));
}

export function isNearWhite(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return false;
  }
  return rgb.r >= NEAR_WHITE && rgb.g >= NEAR_WHITE && rgb.b >= NEAR_WHITE;
}

export function isNearBlack(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return false;
  }
  return rgb.r <= NEAR_BLACK && rgb.g <= NEAR_BLACK && rgb.b <= NEAR_BLACK;
}

function scoreForAccent(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return -1;
  }
  const sat = saturation(rgb);
  const lum = relativeLuminance(rgb);
  const midTone = 1 - Math.abs(lum - 0.45) * 1.4;
  const grayPenalty = sat < GRAY_SATURATION ? -2 : 0;
  return sat * 3 + midTone + grayPenalty;
}

function darknessScore(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return Number.POSITIVE_INFINITY;
  }
  return relativeLuminance(rgb);
}

function uniqueColors(candidates: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of candidates) {
    const hex = normalizeHex(item);
    if (!hex || seen.has(hex)) {
      continue;
    }
    seen.add(hex);
    out.push(hex);
  }
  return out;
}

/**
 * Escolhe primary/secondary priorizando saturação (ignora branco/preto puros)
 * e tertiary como a cor mais escura/próxima de preto entre as candidatas.
 */
export function pickPaletteFromColors(candidates: Array<string | null | undefined>): BrandPalette {
  const colors = uniqueColors(candidates);
  if (colors.length === 0) {
    return { ...FALLBACK_PALETTE };
  }

  const accents = colors.filter((hex) => !isNearWhite(hex) && !isNearBlack(hex));
  const ranked = [...accents].sort((a, b) => scoreForAccent(b) - scoreForAccent(a));

  const primary = ranked[0] ?? FALLBACK_PALETTE.primary;
  const secondary = ranked.find((hex) => hex !== primary) ?? (ranked.length > 0 ? primary : FALLBACK_PALETTE.secondary);

  const darkPool = colors.length > 0 ? colors : [FALLBACK_PALETTE.tertiary];
  const tertiary = [...darkPool].sort((a, b) => darknessScore(a) - darknessScore(b))[0] ?? FALLBACK_PALETTE.tertiary;

  return { primary, secondary, tertiary };
}

function collectFromResult(result: Record<string, unknown>): string[] {
  const keys = ['dominant', 'vibrant', 'darkVibrant', 'lightVibrant', 'muted', 'darkMuted', 'lightMuted', 'average', 'background', 'primary', 'secondary', 'detail'];
  return uniqueColors(keys.map((key) => (typeof result[key] === 'string' ? (result[key] as string) : null)));
}

/** Extrai paleta de uma imagem local/remota. Em falha, devolve o fallback azul Tréville. */
export async function extractPaletteFromImage(uri: string): Promise<BrandPalette> {
  try {
    const { getColors } = await import('react-native-image-colors');
    const result = await getColors(uri, {
      fallback: FALLBACK_PALETTE.primary,
      cache: true,
      key: uri,
      quality: 'high',
    });
    const candidates = collectFromResult(result as unknown as Record<string, unknown>);
    if (candidates.length === 0) {
      return { ...FALLBACK_PALETTE };
    }
    return pickPaletteFromColors(candidates);
  } catch {
    return { ...FALLBACK_PALETTE };
  }
}
