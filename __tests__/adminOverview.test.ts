/// <reference types="jest" />
import {
  bearerToken,
  buildOverview,
  decideAdmin,
  errorPayload,
  isMissingSchema,
  mapAdmins,
  mergeUsers,
  MissingSchemaError,
  sectionFrom,
} from '@/supabase/functions/_shared/adminOverview';

const confirmed = '2026-10-01T00:00:00Z';

describe('decideAdmin', () => {
  it('aceita app_metadata.role admin mesmo sem e-mail confirmado', () => {
    expect(decideAdmin({ email: 'x@y.com', app_metadata: { role: 'admin' } }, 'p@x.com', [])).toBe(true);
  });

  it('aceita o e-mail principal confirmado, ignorando caixa e espaços', () => {
    expect(decideAdmin({ email: '  PreviaEmailOfc@Gmail.com ', email_confirmed_at: confirmed }, '', [])).toBe(true);
  });

  it('aceita e-mail listado em public.admins', () => {
    expect(decideAdmin({ email: 'b@x.com', confirmed_at: confirmed }, 'p@x.com', [' B@X.com'])).toBe(true);
  });

  it('nega e-mail não confirmado, não listado ou usuário ausente', () => {
    expect(decideAdmin({ email: 'p@x.com' }, 'p@x.com', [])).toBe(false);
    expect(decideAdmin({ email: 'c@x.com', email_confirmed_at: confirmed }, 'p@x.com', ['b@x.com'])).toBe(false);
    expect(decideAdmin({ email: 'c@x.com', email_confirmed_at: confirmed, app_metadata: { role: 'user' } }, 'p@x.com', [])).toBe(false);
    expect(decideAdmin(null, 'p@x.com', [])).toBe(false);
  });
});

describe('bearerToken', () => {
  it('extrai o JWT do header Authorization', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def');
    expect(bearerToken('bearer   xyz ')).toBe('xyz');
    expect(bearerToken('')).toBe('');
    expect(bearerToken(null)).toBe('');
    expect(bearerToken('Basic abc')).toBe('');
  });
});

describe('erros do PostgREST', () => {
  it('reconhece tabela, RPC e coluna ausentes', () => {
    expect(isMissingSchema({ code: 'PGRST205', message: "Could not find the table 'public.operations' in the schema cache" })).toBe(true);
    expect(isMissingSchema({ code: 'PGRST202', message: 'Could not find the function' })).toBe(true);
    expect(isMissingSchema({ code: '42P01', message: 'relation does not exist' })).toBe(true);
    expect(isMissingSchema({ code: '42703', message: 'column x does not exist' })).toBe(true);
    expect(isMissingSchema({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isMissingSchema(null)).toBe(false);
  });

  it('migração pendente vira 503 migracao_pendente, nunca 500', () => {
    const fromDb = errorPayload({ code: 'PGRST205', message: 'Could not find the table' });
    expect(fromDb.status).toBe(503);
    expect(fromDb.body.code).toBe('migracao_pendente');
    const fromClass = errorPayload(new MissingSchemaError('user_access'));
    expect(fromClass.status).toBe(503);
    expect(fromClass.body.error).toContain('user_access');
  });

  it('outros erros viram 500 JSON com mensagem', () => {
    expect(errorPayload(new Error('boom'))).toEqual({ status: 500, body: { error: 'boom', code: 'erro_interno' } });
    expect(errorPayload({ code: '23505', message: 'duplicate key' }).body.error).toBe('duplicate key');
    expect(errorPayload(undefined).body.error).toBe('Falha ao consultar os dados.');
  });

  it('sectionFrom devolve [] para tabela ausente e relança outros erros', () => {
    expect(sectionFrom([{ id: 1 }], null)).toEqual({ rows: [{ id: 1 }], missing: false });
    expect(sectionFrom(null, { code: 'PGRST205' })).toEqual({ rows: [], missing: true });
    expect(() => sectionFrom(null, { code: '57014', message: 'timeout' })).toThrow();
  });
});

describe('montagem do overview', () => {
  it('une auth.users com profiles e inclui perfis sem conta listada', () => {
    const users = mergeUsers(
      [{ id: 'u1', email: 'a@x.com', created_at: '2026-10-02', last_sign_in_at: '2026-10-10', user_metadata: { full_name: 'Meta' } }],
      [
        { id: 'u1', display_name: 'Ana', avatar_url: 'https://img/a.png' },
        { id: 'u2', full_name: 'Bruno', created_at: '2026-10-01' },
      ],
    );
    expect(users).toEqual([
      { id: 'u1', name: 'Ana', email: 'a@x.com', avatarUrl: 'https://img/a.png', createdAt: '2026-10-02', lastSignInAt: '2026-10-10' },
      { id: 'u2', name: 'Bruno', email: '', avatarUrl: null, createdAt: '2026-10-01', lastSignInAt: null },
    ]);
  });

  it('respeita o limite de usuários', () => {
    const many = Array.from({ length: 5 }, (_, index) => ({ id: `u${index}`, email: `${index}@x.com` }));
    expect(mergeUsers(many, [], 3)).toHaveLength(3);
  });

  it('lista de admins inclui o principal e remove duplicados', () => {
    expect(mapAdmins([{ email: 'P@X.com', name: 'Dup' }, { email: 'b@x.com', name: 'Bia' }, { email: '' }], 'p@x.com')).toEqual([
      { email: 'p@x.com', name: 'Admin principal' },
      { email: 'b@x.com', name: 'Bia' },
    ]);
  });

  it('tabelas ausentes viram listas vazias e avisos em warnings', () => {
    const overview = buildOverview({
      authUsers: [],
      profiles: { rows: [], missing: true },
      links: { rows: [{ id: 'ABC123', name: 'Mesa 1', destination_type: 'url', is_active: true, scan_count: 4, user_id: 'u1', created_at: '2026-10-01' }], missing: false },
      admins: { rows: [], missing: true },
      scans: { total: 0, last30d: 0, missing: true },
      extraMissing: ['A tabela operations'],
      primaryEmail: 'p@x.com',
    });
    expect(overview.links).toEqual([{ id: 'ABC123', name: 'Mesa 1', destinationType: 'url', isActive: true, scanCount: 4, userId: 'u1', createdAt: '2026-10-01' }]);
    expect(overview.admins).toEqual([{ email: 'p@x.com', name: 'Admin principal' }]);
    expect(overview.scans).toEqual({ total: 0, last30d: 0 });
    expect(overview.warnings).toHaveLength(4);
    expect(overview.warnings.join(' ')).toMatch(/profiles.*admins.*scan_logs.*operations/);
  });

  it('não expõe campos sensíveis das plaquinhas', () => {
    const overview = buildOverview({
      authUsers: [],
      profiles: { rows: [], missing: false },
      links: { rows: [{ id: 'X', webhook_url: 'https://hook', ip_hash: 'h' } as never], missing: false },
      admins: { rows: [], missing: false },
      scans: { total: 1, last30d: 1, missing: false },
      primaryEmail: 'p@x.com',
    });
    expect(JSON.stringify(overview)).not.toMatch(/webhook|ip_hash/);
    expect(overview.warnings).toEqual([]);
  });
});
