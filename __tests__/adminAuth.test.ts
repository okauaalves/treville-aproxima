const maybeSingle = jest.fn();
const eq = jest.fn((_column: string, _value: string) => ({ maybeSingle }));
const select = jest.fn((_columns: string) => ({ eq }));
const from = jest.fn((_table: string) => ({ select }));
const rpc = jest.fn();
const mockState: { from: typeof from; rpc: typeof rpc; listener: ((event: string) => void) | null } = { from, rpc, listener: null };
const RPC_MISSING = { data: null, error: { code: 'PGRST202', message: 'function not found' }, status: 404 };
const RPC_NETWORK = { data: null, error: { code: '', message: 'TypeError: Failed to fetch' }, status: 0 };

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (table: string) => mockState.from(table),
    rpc: (name: string) => mockState.rpc(name),
    auth: {
      onAuthStateChange: (callback: (event: string) => void) => {
        mockState.listener = callback;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkAdmin, clearAdminCache, getCachedAdmin, isAdminUser } = require('@/lib/auth') as typeof import('@/lib/auth');

const user = (email?: string, id = 'u1') => ({ id, email, app_metadata: {} });

describe('checkAdmin', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    clearAdminCache();
    jest.clearAllMocks();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  it('RPC ok: o servidor decide (true e false), sem ler a tabela', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(checkAdmin(user('admin2@exemplo.com'))).resolves.toEqual({ isAdmin: true, source: 'server', serverMissing: false });
    rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(isAdminUser(user('outro@exemplo.com', 'u3'))).resolves.toBe(false);
    expect(rpc).toHaveBeenCalledWith('is_admin');
    expect(from).not.toHaveBeenCalled();
  });

  it('RPC false para o e-mail principal vale (servidor manda, ex.: e-mail não confirmado)', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(isAdminUser(user('previaemailofc@gmail.com'))).resolves.toBe(false);
  });

  it('RPC inexistente: e-mail principal (normalizado) vê o painel e sinaliza migração ausente', async () => {
    rpc.mockResolvedValueOnce(RPC_MISSING);
    await expect(checkAdmin(user('  PreviaEmailOfc@Gmail.com '))).resolves.toEqual({ isAdmin: true, source: 'fallback', serverMissing: true });
    expect(from).not.toHaveBeenCalled();
  });

  it('RPC inexistente: outro e-mail só é admin se estiver na tabela admins', async () => {
    rpc.mockResolvedValue(RPC_MISSING);
    maybeSingle.mockResolvedValueOnce({ data: { email: 'admin2@exemplo.com' }, error: null, status: 200 });
    await expect(checkAdmin(user(' Admin2@Exemplo.com'))).resolves.toEqual({ isAdmin: true, source: 'fallback', serverMissing: true });
    expect(eq).toHaveBeenCalledWith('email', 'admin2@exemplo.com');
    maybeSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST205' }, status: 404 });
    await expect(checkAdmin(user('comum@exemplo.com', 'u4'))).resolves.toEqual({ isAdmin: false, source: 'none', serverMissing: true });
  });

  it('erro de rede (resposta ou exceção): só o e-mail de admin conhecido vê a entrada', async () => {
    rpc.mockResolvedValueOnce(RPC_NETWORK);
    await expect(checkAdmin(user('previaemailofc@gmail.com'))).resolves.toEqual({ isAdmin: true, source: 'fallback', serverMissing: false });
    rpc.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(isAdminUser(user('previaemailofc@gmail.com', 'u5'))).resolves.toBe(true);
    rpc.mockResolvedValueOnce(RPC_NETWORK);
    await expect(isAdminUser(user('comum@exemplo.com', 'u6'))).resolves.toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('outros erros da RPC negam, mesmo para o e-mail principal', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied' }, status: 403 });
    await expect(isAdminUser(user('previaemailofc@gmail.com'))).resolves.toBe(false);
  });

  it('sem usuário não consulta; app_metadata.role admin libera', async () => {
    await expect(isAdminUser(null)).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(isAdminUser({ id: 'u2', email: 'x@y.co', app_metadata: { role: 'admin' } })).resolves.toBe(true);
  });

  it('não cacheia para sempre: nova chamada reconsulta (foco), simultâneas são unidas, logout limpa', async () => {
    rpc.mockResolvedValueOnce(RPC_NETWORK).mockResolvedValue({ data: true, error: null });
    expect(getCachedAdmin(user('a@b.co'))).toBeUndefined();
    await expect(isAdminUser(user('a@b.co'))).resolves.toBe(false);
    expect(getCachedAdmin(user('a@b.co'))?.isAdmin).toBe(false);
    await Promise.all([isAdminUser(user('a@b.co')), isAdminUser(user('a@b.co'))]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(getCachedAdmin(user('a@b.co'))?.isAdmin).toBe(true);

    mockState.listener?.('SIGNED_OUT');
    expect(getCachedAdmin(user('a@b.co'))).toBeUndefined();
  });
});
