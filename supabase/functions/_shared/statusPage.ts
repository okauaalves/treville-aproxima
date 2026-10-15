// Páginas de status (erro) do redirect, servidas pelo host da página de perfil.
// Sem script, sem dados do usuário: só textos fixos.
import { escapeHtml, PROFILE_PAGE_CSP } from './profilePage.ts';

export type StatusKind = 'invalid' | 'not_found' | 'profile_off' | 'inactive' | 'invalid_destination' | 'unavailable' | 'bad_gateway';

export const STATUS_PAGES: Record<StatusKind, { status: number; title: string; message: string }> = {
  invalid: { status: 400, title: 'Link inválido', message: 'Confira o QR Code ou a tag e tente de novo.' },
  not_found: { status: 404, title: 'Plaquinha não encontrada', message: 'Este QR Code ou tag não está ligado a nenhuma plaquinha.' },
  profile_off: { status: 404, title: 'Página de perfil desligada', message: 'Escaneie o QR Code ou a tag de novo para abrir o destino.' },
  inactive: { status: 410, title: 'Esta plaquinha está desativada', message: 'O dono desativou este link. Fale com quem te passou a plaquinha.' },
  invalid_destination: { status: 422, title: 'Destino inválido', message: 'O destino desta plaquinha não pode ser aberto com segurança.' },
  unavailable: { status: 503, title: 'Indisponível no momento', message: 'Não foi possível abrir esta plaquinha agora. Tente de novo em instantes.' },
  bad_gateway: { status: 502, title: 'Tente novamente', message: 'Não conseguimos abrir esta plaquinha agora. Escaneie de novo em alguns segundos.' },
};

const BY_CODE: Record<string, StatusKind> = { '400': 'invalid', '404': 'not_found', '410': 'inactive', '422': 'invalid_destination', '502': 'bad_gateway', '503': 'unavailable' };

/** Código numérico da URL `/erro/<code>` para o tipo de página; desconhecido vira 404. */
export function statusKindFromCode(code: string | null | undefined): StatusKind {
  return BY_CODE[String(code ?? '')] ?? 'not_found';
}

export const STATUS_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': `${PROFILE_PAGE_CSP}; frame-ancestors 'none'`,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};

export function renderStatusPage(kind: StatusKind): string {
  const page = STATUS_PAGES[kind] ?? STATUS_PAGES.not_found;
  const title = escapeHtml(page.title);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${PROFILE_PAGE_CSP}">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>${title} — Tréville Aproxima</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:linear-gradient(135deg,#0F172A 0%,#1E3A8A 50%,#0F172A 100%);color:#F8FAFC}
main{width:100%;max-width:420px;padding:32px 24px 24px;border-radius:28px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);box-shadow:0 20px 60px rgba(2,6,23,.45);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);text-align:center}
.code{display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(147,197,253,.16);color:#93C5FD;font-size:13px;font-weight:700;letter-spacing:.04em}
h1{margin:16px 0 0;font-size:22px;font-weight:700;line-height:1.3}
p{margin:10px 0 0;font-size:15px;line-height:1.5;color:#CBD5E1}
footer{margin-top:28px;font-size:12px;color:#94A3B8}
footer span{color:#93C5FD;font-weight:700}
</style>
</head>
<body>
<main>
<span class="code">${page.status}</span>
<h1>${title}</h1>
<p>${escapeHtml(page.message)}</p>
<footer>Feito com <span>Tréville Aproxima</span></footer>
</main>
</body>
</html>`;
}

/** Versão texto, para quando a função responde direto no domínio do Supabase (que reescreve HTML). */
export function statusText(kind: StatusKind): string {
  const page = STATUS_PAGES[kind] ?? STATUS_PAGES.not_found;
  return `${page.title}\n\n${page.message}\n\nTréville Aproxima\n`;
}
