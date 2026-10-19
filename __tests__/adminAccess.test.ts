/// <reference types="jest" />
import { decideGate, gateRoute, normalizeAccessStatus } from '@/lib/access';
import {
  batchChunks,
  batchDestinationLabel,
  batchNames,
  batchPdfHtml,
  batchToCsv,
  csvCell,
  escapeHtml,
  qrSvg,
  resolveBatchUrl,
  sortByBatchNumber,
  validateBatchForm,
} from '@/lib/qrBatch';
import {
  buildBatchRows,
  checkBatchDestination,
  checkBatchInput,
  checkEmail,
  isAccessStatus,
  isUuid,
  makeLinkId,
} from '@/supabase/functions/_shared/adminAccess';

jest.mock('@/lib/supabase', () => ({ isSupabaseConfigured: true, supabase: null }));

describe('gate de acesso por status', () => {
  const base = { configured: true, hasUser: true };

  it('sem usuário vai para o login, mesmo com status em cache', () => {
    expect(decideGate({ ...base, hasUser: false, status: 'approved' })).toBe('signed_out');
  });

  it('modo local (sem Supabase) não tem aprovação', () => {
    expect(decideGate({ configured: false, hasUser: true, status: null })).toBe('app');
    expect(decideGate({ configured: false, hasUser: true, status: 'blocked' })).toBe('app');
  });

  it('admin e aprovado entram; pendente aguarda; bloqueado é negado', () => {
    expect(decideGate({ ...base, status: 'admin' })).toBe('app');
    expect(decideGate({ ...base, status: 'approved' })).toBe('app');
    expect(decideGate({ ...base, status: 'pending' })).toBe('waiting');
    expect(decideGate({ ...base, status: 'blocked' })).toBe('denied');
  });

  it('sem resposta ainda = checando; erro sem cache = tela de aguardo (nunca libera)', () => {
    expect(decideGate({ ...base, status: null })).toBe('checking');
    expect(decideGate({ ...base, status: 'unknown' })).toBe('waiting');
  });

  it('rotas das telas de status', () => {
    expect(gateRoute('waiting')).toBe('/waiting-approval');
    expect(gateRoute('denied')).toBe('/access-denied');
    expect(gateRoute('app')).toBeNull();
    expect(gateRoute('checking')).toBeNull();
  });

  it('só aceita status conhecidos vindos do servidor', () => {
    expect(normalizeAccessStatus('approved')).toBe('approved');
    expect(normalizeAccessStatus('admin')).toBe('admin');
    expect(normalizeAccessStatus('APPROVED')).toBeNull();
    expect(normalizeAccessStatus('unknown')).toBeNull();
    expect(normalizeAccessStatus(null)).toBeNull();
  });
});

describe('validação das ações de acesso', () => {
  it('e-mail normalizado e rejeita formatos inválidos', () => {
    expect(checkEmail('  Ana@Exemplo.COM ')).toEqual({ ok: true, value: 'ana@exemplo.com' });
    expect(checkEmail('')).toEqual({ ok: false, error: 'Informe o e-mail.' });
    for (const bad of ['ana', 'ana@', '@x.com', 'a b@x.com', 'ana@x', 'a<b>@x.com', 42, null]) {
      expect(checkEmail(bad).ok).toBe(false);
    }
    expect(checkEmail(`${'a'.repeat(320)}@x.com`).ok).toBe(false);
  });

  it('status só no enum e id só uuid', () => {
    expect(isAccessStatus('pending')).toBe(true);
    expect(isAccessStatus('blocked')).toBe(true);
    expect(isAccessStatus('admin')).toBe(false);
    expect(isAccessStatus("approved'; drop table x")).toBe(false);
    expect(isUuid('2f1c7a3e-1d2b-4c5d-8e9f-0a1b2c3d4e5f')).toBe(true);
    expect(isUuid('1 or 1=1')).toBe(false);
  });
});

describe('lote de plaquinhas', () => {
  it('nomes {Prefixo} 1..N, continuando a numeração entre blocos', () => {
    expect(batchNames('Mesa', 3)).toEqual(['Mesa 1', 'Mesa 2', 'Mesa 3']);
    expect(batchNames('Mesa', 2, 6)).toEqual(['Mesa 6', 'Mesa 7']);
    expect(batchChunks(12, 5)).toEqual([
      { start: 1, quantity: 5 },
      { start: 6, quantity: 5 },
      { start: 11, quantity: 2 },
    ]);
    expect(sortByBatchNumber([{ name: 'Mesa 10' }, { name: 'Mesa 2' }, { name: 'Mesa 1' }]).map((item) => item.name)).toEqual(['Mesa 1', 'Mesa 2', 'Mesa 10']);
  });

  it('quantidade 1–100, prefixo até 40 e bloco não passa de 100', () => {
    const ok = { quantity: 10, prefix: 'Mesa', type: 'url', url: null };
    expect(checkBatchInput(ok).ok).toBe(true);
    expect(checkBatchInput({ ...ok, quantity: 0 }).ok).toBe(false);
    expect(checkBatchInput({ ...ok, quantity: 101 }).ok).toBe(false);
    expect(checkBatchInput({ ...ok, quantity: 2.5 }).ok).toBe(false);
    expect(checkBatchInput({ ...ok, quantity: '10' }).ok).toBe(true);
    expect(checkBatchInput({ ...ok, quantity: 5, start: 97 }).ok).toBe(false);
    expect(checkBatchInput({ ...ok, quantity: 4, start: 97 }).ok).toBe(true);
    expect(checkBatchInput({ ...ok, prefix: '   ' }).ok).toBe(false);
    expect(checkBatchInput({ ...ok, prefix: 'x'.repeat(41) }).ok).toBe(false);
    expect(checkBatchInput({ ...ok, prefix: 'x'.repeat(40) }).ok).toBe(true);
    expect(checkBatchInput({ ...ok, type: 'menu' }).ok).toBe(false);
  });

  it('destino padrão passa pelo validador compartilhado e pelo host do tipo', () => {
    expect(checkBatchDestination('url', 'https://treville.com.br')).toEqual({ ok: true, value: 'https://treville.com.br' });
    expect(checkBatchDestination('url', 'javascript:alert(1)').ok).toBe(false);
    expect(checkBatchDestination('url', 'mailto:a@b.co').ok).toBe(false);
    expect(checkBatchDestination('whatsapp', 'https://wa.me/5511999998888').ok).toBe(true);
    expect(checkBatchDestination('whatsapp', 'https://evil.com/wa.me').ok).toBe(false);
    expect(checkBatchDestination('instagram', 'https://www.instagram.com/treville').ok).toBe(true);
    expect(checkBatchDestination('instagram', 'https://instagram.com.evil.io/x').ok).toBe(false);
    expect(checkBatchDestination('profile', 'https://ignorado.com')).toEqual({ ok: true, value: null });
    expect(checkBatchDestination('url', '')).toEqual({ ok: true, value: null });
  });

  it('formulário aceita telefone, @ e domínio sem https', () => {
    expect(resolveBatchUrl('whatsapp', '11 99999-8888')).toEqual({ ok: true, value: 'https://wa.me/5511999998888' });
    expect(resolveBatchUrl('instagram', '@treville')).toEqual({ ok: true, value: 'https://instagram.com/treville' });
    expect(resolveBatchUrl('url', 'treville.com.br')).toEqual({ ok: true, value: 'https://treville.com.br' });
    expect(validateBatchForm({ quantity: '3', prefix: ' Mesa ', type: 'url', url: 'treville.com.br' })).toEqual({
      ok: true,
      value: { quantity: 3, prefix: 'Mesa', type: 'url', url: 'https://treville.com.br' },
    });
    expect(validateBatchForm({ quantity: '', prefix: 'Mesa', type: 'url', url: '' }).ok).toBe(false);
    expect(validateBatchForm({ quantity: '5', prefix: 'Mesa', type: 'whatsapp', url: '123' }).ok).toBe(false);
  });

  it('linhas: Vazio nasce inativa com destino reservado válido; Perfil com página ativa', () => {
    const ids = ['AAAAAA', 'BBBBBB'];
    const base = 'https://nfc-manager.expo.app/p/';
    const empty = buildBatchRows({ quantity: 2, start: 1, prefix: 'Mesa', type: 'empty', url: null }, 'u1', ids, base);
    expect(empty[0]).toEqual({ id: 'AAAAAA', user_id: 'u1', name: 'Mesa 1', destination_url: 'https://nfc-manager.expo.app/p/AAAAAA', destination_type: 'empty', is_active: false, profile_enabled: false });
    expect(empty.every((row) => /^(https?|mailto|tel|sms):/i.test(row.destination_url))).toBe(true);
    const profile = buildBatchRows({ quantity: 1, start: 4, prefix: 'Cartão', type: 'profile', url: null }, 'u1', ids, base);
    expect(profile[0]).toMatchObject({ name: 'Cartão 4', destination_type: 'profile', is_active: true, profile_enabled: true });
    const url = buildBatchRows({ quantity: 1, start: 1, prefix: 'Mesa', type: 'url', url: 'https://x.com.br' }, 'u1', ids, base);
    expect(url[0]).toMatchObject({ destination_url: 'https://x.com.br', destination_type: 'url', is_active: true });
    const noUrl = buildBatchRows({ quantity: 1, start: 1, prefix: 'Mesa', type: 'whatsapp', url: null }, 'u1', ids, base);
    expect(noUrl[0]).toMatchObject({ destination_type: 'empty', is_active: false });
    expect(batchDestinationLabel(empty[0]!)).toBe('Sem destino');
    expect(batchDestinationLabel(profile[0]!)).toBe('Perfil');
  });

  it('IDs no alfabeto do redirect (sem 0/O/1/I)', () => {
    const id = makeLinkId((count) => Uint8Array.from({ length: count }, (_, index) => index * 37));
    expect(id).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});

describe('exportação CSV/PDF', () => {
  it('neutraliza injeção de fórmula e escapa aspas, vírgula e quebra de linha', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tcmd')).toBe("'\tcmd");
    expect(csvCell('Mesa, 1')).toBe('"Mesa, 1"');
    expect(csvCell('linha\nnova')).toBe('"linha\nnova"');
    expect(csvCell('Mesa 1')).toBe('Mesa 1');
    expect(csvCell(null)).toBe('');
  });

  it('CSV com cabeçalho id,nome,url_curta,destino e BOM', () => {
    const csv = batchToCsv(
      [
        { id: 'AAAAAA', name: '=Mesa 1', destination_url: 'https://x.com', destination_type: 'url' },
        { id: 'BBBBBB', name: 'Mesa 2', destination_url: 'https://p/BBBBBB', destination_type: 'empty' },
      ],
      (id) => `https://r.co/${id}`,
    );
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(lines[0]).toBe('id,nome,url_curta,destino');
    expect(lines[1]).toBe("AAAAAA,'=Mesa 1,https://r.co/AAAAAA,https://x.com");
    expect(lines[2]).toBe('BBBBBB,Mesa 2,https://r.co/BBBBBB,Sem destino');
  });

  it('HTML escapado e QR em SVG de 150px, 3 por linha', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe('&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
    const svg = qrSvg('https://r.co/AAAAAA');
    expect(svg).toMatch(/^<svg [^>]*width="150" height="150"/);
    expect(svg).toContain('<path d="M');
    expect(svg).toContain('fill="#FFFFFF"');
    expect(svg).toContain('fill="#000000"');
    expect(svg).not.toContain('fill="#1E40AF"');
    expect(svg).not.toContain('fill="#0F172A"');
    const html = batchPdfHtml([{ id: 'AAAAAA', name: '<script>x</script>', destination_url: '', destination_type: 'url' }], (id) => `https://r.co/${id}`);
    expect(html).toContain('grid-template-columns: repeat(3, 1fr)');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('fill="#000000"');
    expect(html).toContain('fill="#FFFFFF"');
  });
});
