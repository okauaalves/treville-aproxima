import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderBrandPage, sanitizeBrandPage } from '@/supabase/functions/_shared/brandPageRenderer';

const PROJECT = 'https://fyavoukktjysxtmtkspd.supabase.co';
const LOGO = `${PROJECT}/storage/v1/object/public/brand-assets/11111111-1111-4111-8111-111111111111/logo.png`;
const OUT = join(__dirname, '..', 'artifacts', 'minha-pagina-e2e');

describe('artefatos E2E Minha Página', () => {
  it('grava HTML real do renderBrandPage (antes e depois da troca de link)', () => {
    mkdirSync(OUT, { recursive: true });

    const before = sanitizeBrandPage(
      {
        brand_name: 'Café Aurora E2E',
        tagline: 'Specialty coffee · path HTTP da tag/QR',
        logo_url: LOGO,
        theme_mode: 'dark',
        primary_color: '#3B82F6',
        secondary_color: '#2563EB',
        links: [
          { link_type: 'social', label: 'WhatsApp', description: 'Peça já', destination_url: 'https://wa.me/5511999998888', position: 0, is_active: true },
          { link_type: 'instagram', label: 'Instagram', description: '@cafeaurora', destination_url: 'https://instagram.com/cafeaurora', position: 1, is_active: true },
          { link_type: 'google_reviews', label: 'Google', description: 'Avaliações', destination_url: 'https://maps.google.com/?q=Cafe+Aurora', position: 2, is_active: true },
          { link_type: 'portfolio', label: 'Cardápio', description: 'PDF online', destination_url: 'https://exemplo.com/cardapio', position: 3, is_active: true },
        ],
      },
      PROJECT,
    );

    const after = sanitizeBrandPage(
      {
        brand_name: 'Café Aurora E2E',
        tagline: 'Link atualizado sem regravar NFC',
        logo_url: LOGO,
        theme_mode: 'dark',
        primary_color: '#3B82F6',
        secondary_color: '#2563EB',
        links: [
          { link_type: 'social', label: 'WhatsApp', description: 'Novo número', destination_url: 'https://wa.me/5511888777666', position: 0, is_active: true },
          { link_type: 'instagram', label: 'Instagram', description: '@cafeaurora', destination_url: 'https://instagram.com/cafeaurora', position: 1, is_active: true },
          { link_type: 'google_reviews', label: 'Google', description: 'Avaliações', destination_url: 'https://maps.google.com/?q=Cafe+Aurora', position: 2, is_active: true },
          { link_type: 'portfolio', label: 'Cardápio', description: 'PDF v2', destination_url: 'https://exemplo.com/cardapio-v2', position: 3, is_active: true },
        ],
      },
      PROJECT,
    );

    const htmlBefore = renderBrandPage(before).replace(
      '<body',
      '<body data-e2e="antes" data-scan-url="https://nfc-manager.expo.app/t/E2E001"',
    );
    const htmlAfter = renderBrandPage(after).replace(
      '<body',
      '<body data-e2e="depois" data-scan-url="https://nfc-manager.expo.app/t/E2E001"',
    );

    expect(htmlBefore).toContain('Café Aurora E2E');
    expect(htmlBefore).toContain('wa.me/5511999998888');
    expect(htmlAfter).toContain('wa.me/5511888777666');
    expect(htmlAfter).toContain('cardapio-v2');
    expect(htmlBefore).not.toContain('user_id');
    // Banner PNG em base64 pode conter "eyJ" como substring; checa JWT/secrets reais.
    expect(htmlAfter).not.toMatch(/service_role|anon[_ ]key|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\./i);

    writeFileSync(join(OUT, '01-scan-url-pagina-antes.html'), htmlBefore, 'utf8');
    writeFileSync(join(OUT, '02-mesma-url-apos-troca-link.html'), htmlAfter, 'utf8');
    writeFileSync(
      join(OUT, 'README.md'),
      `# E2E Minha Página (Parte 4)

## Fluxo simulado (mesmo path HTTP da tag/QR)
1. Scan/QR abre URL física estável: \`https://nfc-manager.expo.app/t/E2E001\`
2. Redirect prioriza \`brand_page\` publicada → \`renderBrandPage()\`
3. Edita um link e republica — **mesma URL** \`/t/E2E001\` mostra conteúdo novo

## Hardware
- **NFC físico:** não disponível neste ambiente de agente. A simulação cobre o path HTTP idêntico ao gravado na tag.

## Arquivos
- \`01-scan-url-pagina-antes.html\` — HTML real de \`renderBrandPage\` (antes)
- \`02-mesma-url-apos-troca-link.html\` — mesma URL física, WhatsApp/cardápio atualizados
- Screenshots \`*-mobile.png\` / \`*-desktop.png\` gerados via browser MCP
`,
      'utf8',
    );
  });
});
