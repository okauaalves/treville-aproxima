import { AUTH_REDIRECT } from '@/constants/config';

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i;

/** Detecta app/navegador mobile para decidir deep link vs. página de instrução. */
export function isMobileUserAgent(userAgent: string | null | undefined): boolean {
  return MOBILE_UA.test(userAgent ?? '');
}

/** Monta o deep link do app preservando query (PKCE) e hash (tokens implícitos). */
export function buildAppAuthDeepLink(requestUrl: string, schemeBase = AUTH_REDIRECT): string {
  try {
    const parsed = new URL(requestUrl);
    return `${schemeBase}${parsed.search}${parsed.hash}`;
  } catch {
    return schemeBase;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Página intermediária para links de e-mail (recuperação/convite) abertos no PC.
 * No celular redireciona para treville://; no desktop mostra instrução + botão.
 */
export function renderAuthOpenPage(deepLink: string): string {
  const href = escapeHtml(deepLink);
  const deepJson = JSON.stringify(deepLink);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Abrir no app — Tréville Aproxima</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; font-family: Georgia, "Times New Roman", serif; background: linear-gradient(160deg, #e8eef9 0%, #f7f4ef 45%, #dde7f5 100%); color: #0f172a; }
  main { max-width: 420px; text-align: center; }
  h1 { font-size: 1.65rem; margin: 0 0 12px; letter-spacing: -0.02em; }
  p { font-size: 1.05rem; line-height: 1.5; margin: 0 0 28px; color: #334155; font-family: system-ui, sans-serif; }
  a.btn { display: inline-block; padding: 14px 22px; border-radius: 10px; background: #0f172a; color: #fff; text-decoration: none; font-family: system-ui, sans-serif; font-weight: 600; font-size: 1rem; }
  a.btn:hover { background: #1e293b; }
</style>
</head>
<body>
<main>
  <h1>Tréville Aproxima</h1>
  <p>Abra este link no celular onde o app Tréville Aproxima está instalado.</p>
  <a class="btn" id="open" href="${href}">Tentar abrir no app</a>
</main>
<script>
(function () {
  var deep = ${deepJson};
  var search = location.search || "";
  var hash = location.hash || "";
  if (search || hash) {
    deep = ${JSON.stringify(AUTH_REDIRECT)} + search + hash;
    var link = document.getElementById("open");
    if (link) link.setAttribute("href", deep);
  }
  var ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(ua)) {
    location.replace(deep);
  }
})();
</script>
</body>
</html>`;
}

export const AUTH_OPEN_HEADERS: Record<string, string> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};
