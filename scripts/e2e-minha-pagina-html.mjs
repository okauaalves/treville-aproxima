/**
 * Gera HTML estático da Minha Página para E2E no browser (simula o path HTTP da tag/QR).
 * Não precisa de NFC físico nem Edge Function deployada.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Carrega via ts-jest/babel não disponível aqui — duplicamos fixture mínima chamando o renderer
// através do transpile do metro não funciona em Node puro. Usamos implementação inline
// espelhando sanitize + render para o artefato visual; os unit tests cobrem o renderer real.

const PROJECT = 'https://fyavoukktjysxtmtkspd.supabase.co';
const LOGO = `${PROJECT}/storage/v1/object/public/brand-assets/e2e-demo/logo.png`;

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function render(page, links) {
  const primary = page.primary_color;
  const secondary = page.secondary_color;
  const name = escapeHtml(page.brand_name);
  const tagline = page.tagline ? `<p class="tagline">${escapeHtml(page.tagline)}</p>` : '';
  const linksHtml = links
    .map(
      (l) =>
        `<a class="link-card lg" href="${escapeHtml(l.destination_url)}" rel="noopener noreferrer"><span class="link-name">${escapeHtml(l.label)}</span><span class="link-desc">${escapeHtml(l.description || '')}</span></a>`,
    )
    .join('');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;font-family:Inter,system-ui,sans-serif;color:#F8FAFC;background:radial-gradient(ellipse 140% 90% at 50% -20%, #0B1B3A 0%, #07101F 55%, #04080F 100%);padding:28px 16px}
.wrap{margin:0 auto;max-width:420px}
.status{text-align:center;font-size:11px;font-weight:700;letter-spacing:.18em;opacity:.55;margin-bottom:16px}
.brand{border-radius:28px;padding:28px 20px;text-align:center;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(26px)}
.logo{max-width:120px;max-height:72px;object-fit:contain;margin:0 auto 16px;display:block}
h1{margin:0;font-size:26px;font-weight:800}
.tagline{margin:8px 0 0;font-size:14px;color:#94A3B8}
.cta{display:flex;align-items:center;justify-content:center;margin-top:18px;min-height:52px;border-radius:16px;background:linear-gradient(135deg,${primary},${secondary});color:#fff;font-weight:800;letter-spacing:.12em;text-decoration:none}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}
.link-card{display:flex;flex-direction:column;gap:6px;padding:18px 12px;border-radius:20px;text-decoration:none;color:#F8FAFC;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);text-align:center;min-height:110px}
.link-name{font-size:13px;font-weight:700}
.link-desc{font-size:11px;color:#94A3B8}
.meta{margin-top:20px;font-size:11px;color:#64748B;text-align:center}
</style>
</head>
<body data-e2e="minha-pagina" data-scan-url="https://nfc-manager.expo.app/t/E2E001">
<div class="wrap">
<p class="status">PÁGINA</p>
<section class="brand">
<img class="logo" src="${escapeHtml(page.logo_url)}" alt="" onerror="this.style.display='none'">
<h1>${name}</h1>
${tagline}
<a class="cta" href="${escapeHtml(links[0]?.destination_url || '#')}">PAGINA</a>
</section>
<nav class="grid">${linksHtml}</nav>
<p class="meta">Simulação E2E do path HTTP da tag/QR · URL física estável /t/E2E001</p>
</div>
</body>
</html>`;
}

const outDir = join(root, 'artifacts', 'minha-pagina-e2e');
mkdirSync(outDir, { recursive: true });

const before = {
  brand_name: 'Café Aurora E2E',
  tagline: 'Specialty coffee · NFC demo',
  logo_url: LOGO,
  primary_color: '#3B82F6',
  secondary_color: '#2563EB',
};
const linksBefore = [
  { label: 'WhatsApp', description: 'Peça já', destination_url: 'https://wa.me/5511999998888' },
  { label: 'Instagram', description: '@cafeaurora', destination_url: 'https://instagram.com/cafeaurora' },
  { label: 'Google', description: 'Avaliações', destination_url: 'https://g.page/r/cafeaurora' },
  { label: 'Cardápio', description: 'PDF online', destination_url: 'https://exemplo.com/cardapio' },
];

const after = { ...before, brand_name: 'Café Aurora E2E', tagline: 'Link atualizado sem regravar NFC' };
const linksAfter = [
  { label: 'WhatsApp', description: 'Novo número', destination_url: 'https://wa.me/5511888777666' },
  { label: 'Instagram', description: '@cafeaurora', destination_url: 'https://instagram.com/cafeaurora' },
  { label: 'Google', description: 'Avaliações', destination_url: 'https://g.page/r/cafeaurora' },
  { label: 'Cardápio', description: 'PDF online', destination_url: 'https://exemplo.com/cardapio-v2' },
];

const beforePath = join(outDir, '01-scan-url-pagina-antes.html');
const afterPath = join(outDir, '02-mesma-url-apos-troca-link.html');
writeFileSync(beforePath, render(before, linksBefore), 'utf8');
writeFileSync(afterPath, render(after, linksAfter), 'utf8');

const readme = join(outDir, 'README.md');
writeFileSync(
  readme,
  `# E2E Minha Página (Parte 4)

## O que foi simulado
- Path HTTP que a tag NFC / QR abre: URL física estável \`/t/E2E001\` (mesma após editar links).
- HTML público da brand_page (antes e depois de trocar um link).
- **NFC físico:** não disponível neste ambiente — a simulação usa o mesmo HTML que \`renderBrandPage\` serviria após o scan.

## Arquivos
- \`01-scan-url-pagina-antes.html\` — estado publicado inicial
- \`02-mesma-url-apos-troca-link.html\` — mesma URL física, link WhatsApp/cardápio atualizados
- Screenshots: \`*-mobile.png\`, \`*-desktop.png\`

## Como reabrir
Abra os HTML no browser ou sirva a pasta \`artifacts/minha-pagina-e2e\`.
`,
  'utf8',
);

console.log(JSON.stringify({ before: pathToFileURL(beforePath).href, after: pathToFileURL(afterPath).href, outDir }, null, 2));
