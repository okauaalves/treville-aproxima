/** Único ponto do app que fala com o console (o ESLint proíbe console.* em app/, core/, lib/...). */

const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER = /\b(Bearer|apikey|token|access_token|refresh_token)([=:\s]+)[^\s&"',]+/gi;
const EMAIL = /\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g;
const URL_QUERY = /\b((?:https?|[a-z][a-z0-9+.-]*):\/\/[^\s?#"']+)[?#][^\s"']*/gi;
/** UID NFC: 4 a 10 bytes em hex separados por ":"/espaço, ou 4, 7 ou 10 bytes contíguos. */
const UID = /\b(?:[0-9A-F]{2}[: ]){3,9}[0-9A-F]{2}\b|\b(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})\b/gi;

/** Mascara UID, tokens, e-mails e query de URLs. Vale em dev e em produção. */
export function redact(value: string): string {
  return value
    .replace(JWT, '[token]')
    .replace(BEARER, '$1$2[oculto]')
    .replace(URL_QUERY, '$1?[…]')
    .replace(EMAIL, '$1***@$2')
    .replace(UID, (match) => {
      const hex = match.replace(/[^0-9A-F]/gi, '');
      return `${hex.slice(0, 2)}…${hex.slice(-2)}`;
    });
}

function clean(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (typeof arg === 'string') {
      return redact(arg);
    }
    if (arg instanceof Error) {
      return `${arg.name}: ${redact(arg.message)}`;
    }
    if (arg && typeof arg === 'object') {
      try {
        return redact(JSON.stringify(arg));
      } catch {
        return '[objeto]';
      }
    }
    return arg;
  });
}

/** Código curto do erro, sem mensagem (a mensagem pode carregar dados do usuário). */
export function errorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' || typeof code === 'number') {
      return String(code);
    }
    if (error instanceof Error) {
      return error.name;
    }
  }
  return 'UNKNOWN';
}

const isDev = () => typeof __DEV__ !== 'undefined' && __DEV__;

export const logger = {
  /** Só em desenvolvimento. */
  info(...args: unknown[]): void {
    if (isDev()) {
      console.info(...clean(args));
    }
  },
  /** Eventos de NFC: só em desenvolvimento. */
  nfc(...args: unknown[]): void {
    if (isDev()) {
      console.info('[nfc]', ...clean(args));
    }
  },
  /** Falha recuperável: só em desenvolvimento. */
  warn(...args: unknown[]): void {
    if (isDev()) {
      console.warn(...clean(args));
    }
  },
  /** Em produção registra só `contexto: código`, sem mensagem nem dados. */
  error(context: string, error?: unknown): void {
    if (isDev()) {
      console.error(redact(context), ...clean(error === undefined ? [] : [error]));
      return;
    }
    console.error(`${context}: ${errorCode(error)}`);
  },
};
