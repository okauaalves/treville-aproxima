import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderProfilePage, sanitizeProfile } from '@/supabase/functions/_shared/profilePage';

const PROJECT = 'https://abcdefghij12.supabase.co';
const OUT = join(process.cwd(), 'tmp', 'profile-previews');

describe('profile page HTML preview artifacts', () => {
  it('grava preview local do redesign', () => {
    mkdirSync(OUT, { recursive: true });
    const data = sanitizeProfile(
      {
        displayName: 'TREVILLE',
        bio: 'Conectando pessoas e oportunidades',
        themeColor: '#3B82F6',
        links: [
          { title: 'Redes Sociais', subtitle: 'Conecte-se comigo', url: 'https://wa.me/5511999998888', icon: 'whatsapp' },
          { title: 'Instagram', subtitle: 'Acompanhe meu dia', url: 'https://instagram.com/treville', icon: 'instagram' },
          { title: 'Meu site', subtitle: 'Projetos e trabalhos', url: 'https://exemplo.com', icon: 'site' },
          { title: 'Sobre Mim', subtitle: 'Conheça minha história', url: 'https://exemplo.com/sobre', icon: 'menu' },
          { title: 'Contato', subtitle: 'Fale comigo', url: 'mailto:oi@exemplo.com', icon: 'email' },
          { title: 'Local', subtitle: 'Como chegar', url: 'https://maps.google.com/?q=SP', icon: 'location' },
        ],
      },
      PROJECT,
    );
    const html = renderProfilePage(data);
    writeFileSync(join(OUT, 'profile-redesign.html'), html, 'utf8');
    expect(html).toContain('class="grid"');
    expect(html).toContain('class="button-wrap"');
    expect(html).toContain('>PAGINA</span>');
    expect(html).toContain('icon-whatsapp');
  });
});
