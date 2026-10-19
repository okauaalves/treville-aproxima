import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderBrandPage, sanitizeBrandPage } from '@/supabase/functions/_shared/brandPageRenderer';

const OUT = join(__dirname, '..', 'tmp', 'brand-previews');
const PAGE_URL = 'https://treville.growthn.cc/bb';

describe('brand page HTML previews', () => {
  it('grava dark/light/balanced para inspeção visual', () => {
    mkdirSync(OUT, { recursive: true });
    for (const mode of ['dark', 'light', 'balanced'] as const) {
      const data = sanitizeBrandPage(
        {
          brand_name: 'TREVILLE',
          tagline: 'Conectando pessoas e oportunidades',
          theme_mode: mode,
          primary_color: '#007AFF',
          secondary_color: '#0A84FF',
          links: [
            {
              link_type: 'social',
              label: 'Redes Sociais',
              description: 'Conecte-se comigo',
              destination_url: 'https://wa.me/5511999990000',
              is_active: true,
            },
            {
              link_type: 'instagram',
              label: 'Instagram',
              description: 'Acompanhe meu dia',
              destination_url: 'https://instagram.com/treville',
              is_active: true,
            },
            {
              link_type: 'google_reviews',
              label: 'Google Avaliações',
              description: 'Veja o que dizem',
              destination_url: 'https://g.page/r/demo',
              is_active: true,
            },
            {
              link_type: 'portfolio',
              label: 'Meu Portfólio',
              description: 'Projetos e trabalhos',
              destination_url: 'https://exemplo.com',
              is_active: true,
            },
            {
              link_type: 'about',
              label: 'Sobre Mim',
              description: 'Conheça minha história',
              destination_url: 'https://exemplo.com/sobre',
              is_active: true,
            },
            {
              link_type: 'contact',
              label: 'Contato Direto',
              description: 'Fale comigo',
              destination_url: 'mailto:ola@exemplo.com',
              is_active: true,
            },
            { link_type: 'contact', label: 'Sem destino', destination_url: null, is_active: true },
          ],
        },
        'https://abcdefghij12.supabase.co',
      );
      const html = renderBrandPage(data, { pageUrl: PAGE_URL });
      writeFileSync(join(OUT, `${mode}.html`), html);
      expect(html).toContain(`data-theme="${mode}"`);
      expect(html).not.toContain('Sem destino');
      expect(html).toContain('border:1.5px solid');
      expect(html).toContain('border-radius:24px');
      expect(html).toContain('>PAGINA<');
      expect(html).toContain('PÁGINA');
      expect(html).toContain('class="button-wrap"');
      expect(html).toContain('dottedGrid');
      expect(html).toContain('icon-about');
      expect(html).toContain('#4A90E2');
      expect(html).toContain('liquid-glass');
      expect(html).toContain('id="glass-distortion"');
      expect(html).toContain('class="brand-card liquid-glass"');
      expect(html).toContain('class="chrome lg"');
      expect(html).toContain('M6.62 10.79');
      expect(html).not.toContain('chrome-row-actions');
    }
  });
});
