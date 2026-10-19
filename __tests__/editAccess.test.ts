import {
  canRemoveAdmin,
  editBadge,
  expiresAtFor,
  latestByLink,
  parsePlaquinhaCode,
  plaquinhaCodeFromLink,
  PRIMARY_ADMIN_EMAIL,
} from '@/lib/editAccessLogic';

describe('parsePlaquinhaCode', () => {
  it('aceita o código puro, com espaços e minúsculas', () => {
    expect(parsePlaquinhaCode('K7M2QX')).toBe('K7M2QX');
    expect(parsePlaquinhaCode('  k7m2qx ')).toBe('K7M2QX');
    expect(parsePlaquinhaCode('ABCD')).toBe('ABCD');
    expect(parsePlaquinhaCode('ABCD1234')).toBe('ABCD1234');
  });

  it('extrai da URL curta do redirect (QR e NFC)', () => {
    expect(parsePlaquinhaCode('https://abcdefghijkl.supabase.co/functions/v1/redirect/K7M2QX')).toBe('K7M2QX');
    expect(parsePlaquinhaCode('https://abcdefghijkl.supabase.co/functions/v1/redirect/K7M2QX?s=nfc')).toBe('K7M2QX');
    expect(parsePlaquinhaCode('abcdefghijkl.supabase.co/functions/v1/redirect/k7m2qx/')).toBe('K7M2QX');
  });

  it('extrai do link curto /t/<ID> (QR e NFC)', () => {
    expect(parsePlaquinhaCode('https://nfc-manager.expo.app/t/K7M2QX')).toBe('K7M2QX');
    expect(parsePlaquinhaCode('https://nfc-manager.expo.app/t/k7m2qx?s=nfc')).toBe('K7M2QX');
    expect(parsePlaquinhaCode('nfc-manager.expo.app/t/K7M2QX/')).toBe('K7M2QX');
    expect(parsePlaquinhaCode('https://nfc-manager.expo.app/t/AB_CD')).toBeNull();
  });

  it('extrai da página pública /p/<ID>', () => {
    expect(parsePlaquinhaCode('https://nfc-manager.expo.app/p/K7M2QX')).toBe('K7M2QX');
  });

  it('recusa formatos fora de /^[A-Z0-9]{4,8}$/ e URLs sem código', () => {
    expect(parsePlaquinhaCode('')).toBeNull();
    expect(parsePlaquinhaCode(null)).toBeNull();
    expect(parsePlaquinhaCode('ABC')).toBeNull();
    expect(parsePlaquinhaCode('ABCDEFGHI')).toBeNull();
    expect(parsePlaquinhaCode('AB-CD')).toBeNull();
    expect(parsePlaquinhaCode("K7M2QX' or 1=1")).toBeNull();
    expect(parsePlaquinhaCode('https://exemplo.com/outra/K7M2QX')).toBeNull();
    expect(parsePlaquinhaCode('https://x.supabase.co/functions/v1/redirect/AB_CD')).toBeNull();
    expect(parsePlaquinhaCode('javascript:alert(1)')).toBeNull();
    expect(parsePlaquinhaCode('https://x.supabase.co/functions/v1/redirect/%E0%A4%A')).toBeNull();
  });
});

describe('plaquinhaCodeFromLink (URL lida na tag/QR)', () => {
  const SHORT = 'https://nfc-manager.expo.app';

  it('reconhece o link curto novo e a URL longa das tags antigas', () => {
    expect(plaquinhaCodeFromLink('https://nfc-manager.expo.app/t/K7M2QX?s=nfc', SHORT)).toBe('K7M2QX');
    expect(plaquinhaCodeFromLink('https://nfc-manager.expo.app/t/k7m2qx', SHORT)).toBe('K7M2QX');
    expect(plaquinhaCodeFromLink('https://nfc-manager--tt3beilbk6.expo.app/t/K7M2QX', SHORT)).toBe('K7M2QX');
    expect(plaquinhaCodeFromLink('https://fyavoukktjysxtmtkspd.supabase.co/functions/v1/redirect/K7M2QX?s=nfc', SHORT)).toBe('K7M2QX');
    expect(plaquinhaCodeFromLink('https://meu.dominio.com/t/K7M2QX', 'https://meu.dominio.com')).toBe('K7M2QX');
    expect(plaquinhaCodeFromLink('https://treville-aproxima.expo.app/t/K7M2QX?s=nfc', SHORT)).toBe('K7M2QX');
  });

  it('ignora /t/ em outros domínios, outros caminhos e links que não são web', () => {
    expect(plaquinhaCodeFromLink('https://exemplo.com/t/K7M2QX', SHORT)).toBeNull();
    expect(plaquinhaCodeFromLink('https://nfc-manager.expo.app/p/K7M2QX', SHORT)).toBeNull();
    expect(plaquinhaCodeFromLink('https://exemplo.com/functions/v1/redirect/K7M2QX', SHORT)).toBeNull();
    expect(plaquinhaCodeFromLink('nfc-manager.expo.app/t/K7M2QX', SHORT)).toBeNull();
    expect(plaquinhaCodeFromLink('K7M2QX', SHORT)).toBeNull();
    expect(plaquinhaCodeFromLink(null, SHORT)).toBeNull();
    expect(plaquinhaCodeFromLink('https://nfc-manager.expo.app/t/AB_CD', SHORT)).toBeNull();
  });
});

describe('editBadge', () => {
  const now = new Date('2026-10-14T12:00:00Z');

  it('pendente = Aguardando (âmbar), sem edição', () => {
    expect(editBadge({ status: 'pending' }, now)).toMatchObject({ kind: 'waiting', label: 'Aguardando', tone: 'warning', canEdit: false, canRequestAgain: false });
  });

  it('aprovado sem prazo ou no prazo = Autorizado (verde), libera edição e NFC', () => {
    expect(editBadge({ status: 'approved', expires_at: null }, now)).toMatchObject({ kind: 'authorized', label: 'Autorizado', tone: 'success', canEdit: true });
    const future = editBadge({ status: 'approved', expires_at: '2026-10-21T12:00:00Z' }, now);
    expect(future).toMatchObject({ kind: 'authorized', canEdit: true });
    expect(future.detail).toContain('21/10/2026');
  });

  it('aprovado vencido = Expirado, sem edição e pode pedir de novo', () => {
    expect(editBadge({ status: 'approved', expires_at: '2026-10-14T11:59:59Z' }, now)).toMatchObject({ kind: 'expired', canEdit: false, canRequestAgain: true });
  });

  it('negado = Negado (vermelho) com o texto do administrador', () => {
    expect(editBadge({ status: 'denied' }, now)).toMatchObject({ kind: 'denied', label: 'Negado', tone: 'error', detail: 'Acesso negado pelo administrador', canEdit: false, canRequestAgain: true });
  });

  it('revogado = Revogado (vermelho), pode pedir de novo', () => {
    expect(editBadge({ status: 'revoked' }, now)).toMatchObject({ kind: 'revoked', tone: 'error', canEdit: false, canRequestAgain: true });
  });
});

describe('latestByLink', () => {
  it('fica com o pedido mais recente de cada plaquinha, mais novos primeiro', () => {
    const rows = [
      { id: '1', link_id: 'AAAA', requested_at: '2026-10-01T00:00:00Z', status: 'denied' },
      { id: '2', link_id: 'AAAA', requested_at: '2026-10-05T00:00:00Z', status: 'pending' },
      { id: '3', link_id: 'BBBB', requested_at: '2026-10-03T00:00:00Z', status: 'approved' },
    ];
    expect(latestByLink(rows).map((row) => row.id)).toEqual(['2', '3']);
  });
});

describe('canRemoveAdmin', () => {
  it('não remove a si mesmo (e-mail normalizado)', () => {
    expect(canRemoveAdmin({ target: 'Admin2@Exemplo.com', self: ' admin2@exemplo.com', total: 3 })).toEqual({ ok: false, reason: 'Você não pode remover a si mesmo.' });
  });

  it('o admin principal nunca sai', () => {
    expect(canRemoveAdmin({ target: PRIMARY_ADMIN_EMAIL, self: 'admin2@exemplo.com', total: 3 })).toMatchObject({ ok: false, reason: 'O administrador principal não pode ser removido.' });
  });

  it('mantém pelo menos um admin', () => {
    expect(canRemoveAdmin({ target: 'outro@exemplo.com', self: 'admin2@exemplo.com', total: 1 })).toMatchObject({ ok: false });
  });

  it('remove outro admin quando sobra alguém', () => {
    expect(canRemoveAdmin({ target: 'outro@exemplo.com', self: PRIMARY_ADMIN_EMAIL, total: 2 })).toEqual({ ok: true });
  });
});

describe('expiresAtFor', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  it('sem prazo = null; 7 e 30 dias a partir de agora', () => {
    expect(expiresAtFor('none', now)).toBeNull();
    expect(expiresAtFor('7', now)).toBe('2026-10-21T12:00:00.000Z');
    expect(expiresAtFor('30', now)).toBe('2026-11-13T12:00:00.000Z');
  });
});
