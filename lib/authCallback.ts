export type AuthCallbackParams = {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  type?: string;
  error?: string;
  errorCode?: string;
};

export type AuthCallbackKind = 'code' | 'tokens' | 'error' | 'empty';

export function parseAuthCallback(urlValue: string): AuthCallbackParams {
  const out: Record<string, string> = {};
  const query = urlValue.split('?')[1]?.split('#')[0] ?? '';
  const hash = urlValue.split('#')[1] ?? '';
  for (const part of [...query.split('&'), ...hash.split('&')]) {
    if (!part) {
      continue;
    }
    const [rawKey, rawValue = ''] = part.split('=');
    if (!rawKey) {
      continue;
    }
    try {
      out[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch {
      out[rawKey] = rawValue;
    }
  }
  return {
    code: out.code,
    accessToken: out.access_token,
    refreshToken: out.refresh_token,
    type: out.type,
    error: out.error_description || out.error,
    errorCode: out.error_code,
  };
}

/** Erro tem prioridade: o Supabase pode devolver `error` junto com outros campos. */
export function classifyAuthCallback(params: AuthCallbackParams): AuthCallbackKind {
  if (params.error || params.errorCode) {
    return 'error';
  }
  if (params.code) {
    return 'code';
  }
  if (params.accessToken && params.refreshToken) {
    return 'tokens';
  }
  return 'empty';
}

export function isProviderDisabledMessage(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes('provider is not enabled') || text.includes('unsupported provider') || text.includes('provider_disabled');
}

export function isExpiredLinkMessage(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes('otp_expired') || text.includes('expired') || text.includes('invalid flow state') || text.includes('code verifier');
}
