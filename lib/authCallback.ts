export type AuthCallbackParams = {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  type?: string;
  error?: string;
};

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
    out[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/\+/g, ' '));
  }
  return {
    code: out.code,
    accessToken: out.access_token,
    refreshToken: out.refresh_token,
    type: out.type,
    error: out.error_description || out.error,
  };
}
