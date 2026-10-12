// Regra única de destino permitido: usada pela Edge Function `redirect` e pelo app (lib/plaquinhas).
// Sem APIs de Deno ou React Native para rodar nos dois lados.

export const ALLOWED_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:', 'sms:'] as const;

export type DestinationCheck = { ok: true; url: string } | { ok: false; error: string };

const MAX_LENGTH = 2048;

export function checkDestinationUrl(raw: string | null | undefined): DestinationCheck {
  const value = (raw ?? '').trim();
  if (!value) {
    return { ok: false, error: 'Informe o destino.' };
  }
  if (value.length > MAX_LENGTH) {
    return { ok: false, error: 'O destino é longo demais.' };
  }
  if (/[\u0000-\u001F\u007F\s]/.test(value)) {
    return { ok: false, error: 'O destino não pode ter espaços ou caracteres de controle.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: 'Destino inválido.' };
  }
  const scheme = parsed.protocol.toLowerCase();
  if (!(ALLOWED_SCHEMES as readonly string[]).includes(scheme)) {
    return { ok: false, error: 'Use um link http(s), e-mail, telefone ou SMS.' };
  }
  if (scheme === 'http:' || scheme === 'https:') {
    const host = parsed.hostname;
    if (!host || !host.includes('.') || parsed.username || parsed.password) {
      return { ok: false, error: 'Link inválido.' };
    }
  } else if (value.length <= scheme.length) {
    return { ok: false, error: 'Destino incompleto.' };
  }
  return { ok: true, url: value };
}
