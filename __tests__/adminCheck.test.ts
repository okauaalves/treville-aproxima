import { decideGate } from '@/lib/access';
import { classifyRpc, decideAdmin, isFallbackAdminEmail, normalizeAdminEmail } from '@/lib/adminCheck';

const admin = { email: 'previaemailofc@gmail.com', app_metadata: {} };
const comum = { email: 'comum@exemplo.com', app_metadata: {} };

describe('normalização do e-mail', () => {
  it('lower + trim; não-string vira vazio', () => {
    expect(normalizeAdminEmail('  PreviaEmailOfc@GMAIL.com\n')).toBe('previaemailofc@gmail.com');
    expect(normalizeAdminEmail(undefined)).toBe('');
    expect(normalizeAdminEmail(42)).toBe('');
  });

  it('e-mail principal ou EXPO_PUBLIC_ADMIN_EMAIL (normalizados)', () => {
    expect(isFallbackAdminEmail(' PREVIAEMAILOFC@gmail.com ', undefined)).toBe(true);
    expect(isFallbackAdminEmail('Outro@Exemplo.com', ' outro@exemplo.com ')).toBe(true);
    expect(isFallbackAdminEmail('comum@exemplo.com', 'outro@exemplo.com')).toBe(false);
    expect(isFallbackAdminEmail('', '')).toBe(false);
    expect(isFallbackAdminEmail(null, undefined)).toBe(false);
  });
});

describe('classifyRpc', () => {
  it('ok usa só data === true', () => {
    expect(classifyRpc({ data: true, error: null })).toEqual({ kind: 'ok', value: true });
    expect(classifyRpc({ data: 'true', error: null })).toEqual({ kind: 'ok', value: false });
  });

  it('inexistente: PGRST202, 42883 ou 404 sem código', () => {
    expect(classifyRpc({ data: null, error: { code: 'PGRST202' } })).toEqual({ kind: 'missing' });
    expect(classifyRpc({ data: null, error: { code: '42883' } })).toEqual({ kind: 'missing' });
    expect(classifyRpc({ data: null, error: { message: 'Not Found' }, status: 404 })).toEqual({ kind: 'missing' });
  });

  it('rede: exceção ou mensagem de fetch sem código', () => {
    expect(classifyRpc(new TypeError('Network request failed'))).toEqual({ kind: 'network' });
    expect(classifyRpc({ data: null, error: { code: '', message: 'TypeError: Failed to fetch' } })).toEqual({ kind: 'network' });
  });

  it('demais erros', () => {
    expect(classifyRpc({ data: null, error: { code: '42501', message: 'permission denied' } })).toEqual({ kind: 'error' });
  });
});

describe('decideAdmin', () => {
  const extraEmail = null;

  it('RPC ok manda, inclusive negando o e-mail principal', () => {
    expect(decideAdmin({ user: comum, rpc: { kind: 'ok', value: true }, extraEmail })).toEqual({ isAdmin: true, source: 'server', serverMissing: false });
    expect(decideAdmin({ user: admin, rpc: { kind: 'ok', value: false }, extraEmail }).isAdmin).toBe(false);
  });

  it('RPC inexistente: fallback por e-mail ou tabela, com serverMissing', () => {
    expect(decideAdmin({ user: admin, rpc: { kind: 'missing' }, extraEmail })).toEqual({ isAdmin: true, source: 'fallback', serverMissing: true });
    expect(decideAdmin({ user: comum, rpc: { kind: 'missing' }, extraEmail })).toEqual({ isAdmin: false, source: 'none', serverMissing: true });
    expect(decideAdmin({ user: comum, rpc: { kind: 'missing' }, tableHit: true, extraEmail }).isAdmin).toBe(true);
  });

  it('erro de rede ou outro erro: e-mail conhecido ou tabela admins', () => {
    expect(decideAdmin({ user: admin, rpc: { kind: 'network' }, extraEmail })).toEqual({ isAdmin: true, source: 'fallback', serverMissing: false });
    expect(decideAdmin({ user: comum, rpc: { kind: 'network' }, tableHit: true, extraEmail }).isAdmin).toBe(true);
    expect(decideAdmin({ user: comum, rpc: { kind: 'network' }, extraEmail: 'Comum@Exemplo.com' }).isAdmin).toBe(true);
    expect(decideAdmin({ user: admin, rpc: { kind: 'error' }, extraEmail }).isAdmin).toBe(true);
    expect(decideAdmin({ user: comum, rpc: { kind: 'error' }, extraEmail }).isAdmin).toBe(false);
  });

  it('sem usuário nega; role admin no JWT libera', () => {
    expect(decideAdmin({ user: null, rpc: { kind: 'ok', value: true }, extraEmail }).isAdmin).toBe(false);
    expect(decideAdmin({ user: { email: 'x@y.co', app_metadata: { role: 'admin' } }, rpc: { kind: 'missing' }, extraEmail })).toEqual({ isAdmin: true, source: 'jwt', serverMissing: true });
  });
});

describe('gate com admin conhecido', () => {
  const base = { configured: true, hasUser: true };

  it('não espera o servidor nem cai em "aguardando" sem rede', () => {
    expect(decideGate({ ...base, status: null, knownAdmin: true })).toBe('app');
    expect(decideGate({ ...base, status: 'unknown', knownAdmin: true })).toBe('app');
    expect(decideGate({ ...base, status: 'unknown', knownAdmin: false })).toBe('waiting');
    expect(decideGate({ ...base, status: null })).toBe('checking');
  });

  it('decisão explícita do servidor continua valendo', () => {
    expect(decideGate({ ...base, status: 'admin', knownAdmin: true })).toBe('app');
    expect(decideGate({ ...base, status: 'blocked', knownAdmin: true })).toBe('denied');
  });
});
