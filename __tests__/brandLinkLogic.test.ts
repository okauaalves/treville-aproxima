import {
  normalizeHttpsUrl,
  normalizeInstagramInput,
  normalizeWhatsAppInput,
  validateLinkDrafts,
  emptyLinkDrafts,
  draftsForPersist,
} from '@/lib/brandLinkLogic';

describe('normalizeInstagramInput', () => {
  it('monta URL a partir de @usuario', () => {
    expect(normalizeInstagramInput('@treville.br')).toEqual({ ok: true, url: 'https://instagram.com/treville.br' });
    expect(normalizeInstagramInput('treville')).toEqual({ ok: true, url: 'https://instagram.com/treville' });
  });

  it('aceita URL colada', () => {
    expect(normalizeInstagramInput('https://www.instagram.com/treville/')).toEqual({
      ok: true,
      url: 'https://instagram.com/treville',
    });
  });

  it('trata vazio sem erro', () => {
    expect(normalizeInstagramInput('  ')).toEqual({ ok: true, url: '', empty: true });
  });
});

describe('normalizeWhatsAppInput', () => {
  it('monta wa.me a partir do número com DDD', () => {
    expect(normalizeWhatsAppInput('11999998888')).toEqual({ ok: true, url: 'https://wa.me/5511999998888' });
  });

  it('não inventa dígitos — rejeita número curto', () => {
    expect(normalizeWhatsAppInput('11999').ok).toBe(false);
  });

  it('aceita link wa.me existente', () => {
    expect(normalizeWhatsAppInput('https://wa.me/5511999998888')).toEqual({
      ok: true,
      url: 'https://wa.me/5511999998888',
    });
  });

  it('rejeita URL que não é WhatsApp', () => {
    expect(normalizeWhatsAppInput('https://example.com').ok).toBe(false);
  });
});

describe('normalizeHttpsUrl', () => {
  it('exige https antes de salvar', () => {
    expect(normalizeHttpsUrl('https://treville.com.br').ok).toBe(true);
    expect(normalizeHttpsUrl('http://treville.com.br').ok).toBe(false);
    expect(normalizeHttpsUrl('treville.com.br')).toEqual({ ok: true, url: 'https://treville.com.br' });
  });

  it('rejeita destino inválido', () => {
    expect(normalizeHttpsUrl('notaurl').ok).toBe(false);
  });
});

describe('validateLinkDrafts / draftsForPersist', () => {
  it('permite cartões vazios e inativos', () => {
    const drafts = emptyLinkDrafts();
    expect(validateLinkDrafts(drafts).ok).toBe(true);
    drafts[1]!.raw = '@ok';
    drafts[1]!.is_active = false;
    expect(validateLinkDrafts(drafts).ok).toBe(true);
  });

  it('normaliza Instagram no persist', () => {
    const drafts = emptyLinkDrafts();
    drafts[1]!.raw = '@marca';
    const rows = draftsForPersist(drafts);
    expect(rows[1]!.destination_url).toBe('https://instagram.com/marca');
  });
});
