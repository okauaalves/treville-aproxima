/** Schemes que executam código ou leem arquivos locais: nunca são abertos, nem com confirmação. */
export const NEVER_OPEN_SCHEMES = ['javascript', 'data', 'file', 'vbscript'] as const;
/** Abrem apps/telas arbitrárias no Android: só com confirmação extra. */
const RISKY_SCHEMES = ['intent'] as const;
const EXECUTABLE_EXTENSIONS = ['apk', 'xapk', 'apks', 'exe', 'msi', 'bat', 'cmd', 'scr'];

export interface UrlSafety {
  /** Mostrar aviso e exigir confirmação antes de abrir. */
  suspicious: boolean;
  /** Nunca abrir (javascript:, data:, file:, vbscript:). */
  blocked: boolean;
  reasons: string[];
}

export const SAFE_URL: UrlSafety = { suspicious: false, blocked: false, reasons: [] };

function schemeOf(value: string): string {
  // Controles e espaços no meio do scheme ("java\tscript:") são ignorados pelos navegadores.
  const compact = value.replace(/[\u0000-\u0020\u007F]/g, '');
  const match = compact.match(/^([a-z][a-z0-9+.-]*):/i);
  return match?.[1]?.toLowerCase() ?? '';
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Avalia uma URL lida de uma tag (conteúdo não confiável). Não usa heurística de palavras. */
export function assessUrl(raw: string | null | undefined): UrlSafety {
  const value = (raw ?? '').trim();
  if (!value) {
    return SAFE_URL;
  }
  const reasons: string[] = [];
  const scheme = schemeOf(value);
  const blocked = (NEVER_OPEN_SCHEMES as readonly string[]).includes(scheme);
  if (blocked) {
    reasons.push(`Link do tipo "${scheme}:" pode executar código ou ler arquivos do aparelho. Ele não será aberto.`);
  } else if ((RISKY_SCHEMES as readonly string[]).includes(scheme)) {
    reasons.push('Link "intent:" abre outro aplicativo ou tela do sistema diretamente.');
  }
  const url = scheme === 'http' || scheme === 'https' ? parseUrl(value) : null;
  if (url) {
    let path = url.pathname.toLowerCase();
    try {
      path = decodeURIComponent(path);
    } catch {
      // Mantém o path codificado.
    }
    const extension = path.split('.').pop() ?? '';
    if (path.includes('.') && EXECUTABLE_EXTENSIONS.includes(extension)) {
      reasons.push(`O link baixa um arquivo executável (.${extension}).`);
    }
    if (url.hostname.split('.').some((label) => label.startsWith('xn--'))) {
      reasons.push(`O endereço usa caracteres internacionais (${url.hostname}) e pode imitar outro site.`);
    }
  }
  return { suspicious: blocked || reasons.length > 0, blocked, reasons };
}
