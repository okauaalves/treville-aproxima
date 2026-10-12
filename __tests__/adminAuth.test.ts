const maybeSingle = jest.fn();
const eq = jest.fn((_column: string, _value: string) => ({ maybeSingle }));
const select = jest.fn((_columns: string) => ({ eq }));
const from = jest.fn((_table: string) => ({ select }));
const mockState: { from: typeof from; listener: ((event: string) => void) | null } = { from, listener: null };

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (table: string) => mockState.from(table),
    auth: {
      onAuthStateChange: (callback: (event: string) => void) => {
        mockState.listener = callback;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { clearAdminCache, getCachedAdmin, isAdminUser } = require('@/lib/auth') as typeof import('@/lib/auth');

const user = (email?: string, id = 'u1') => ({ id, email, app_metadata: {} });

describe('isAdminUser (tabela admins)', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    clearAdminCache();
    jest.clearAllMocks();
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  it('consulta com e-mail normalizado e usa maybeSingle', async () => {
    maybeSingle.mockResolvedValue({ data: { email: 'previaemailofc@gmail.com' }, error: null, status: 200 });
    await expect(isAdminUser(user('  PreviaEmailOfc@Gmail.com '))).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith('admins');
    expect(select).toHaveBeenCalledWith('email');
    expect(eq).toHaveBeenCalledWith('email', 'previaemailofc@gmail.com');
  });

  it('sem linha não é admin', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null, status: 200 });
    await expect(isAdminUser(user('outro@exemplo.com'))).resolves.toBe(false);
  });

  it('sem usuário ou sem e-mail retorna false sem consultar', async () => {
    await expect(isAdminUser(null)).resolves.toBe(false);
    await expect(isAdminUser(user(undefined))).resolves.toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('app_metadata.role admin libera sem consulta', async () => {
    await expect(isAdminUser({ id: 'u2', email: 'x@y.co', app_metadata: { role: 'admin' } })).resolves.toBe(true);
    expect(from).not.toHaveBeenCalled();
  });

  it('tabela ausente no remoto (PGRST205 / 404) retorna false em silêncio', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST205', message: 'not found' }, status: 404 });
    await expect(isAdminUser(user('a@b.co'))).resolves.toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('outros erros avisam e retornam false', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: { code: '500', message: 'boom' }, status: 500 });
    await expect(isAdminUser(user('a@b.co'))).resolves.toBe(false);
    maybeSingle.mockRejectedValueOnce(new Error('offline'));
    await expect(isAdminUser(user('c@d.co', 'u9'))).resolves.toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('cacheia por usuário e invalida no logout', async () => {
    maybeSingle.mockResolvedValue({ data: { email: 'a@b.co' }, error: null, status: 200 });
    expect(getCachedAdmin(user('a@b.co'))).toBeUndefined();
    await Promise.all([isAdminUser(user('a@b.co')), isAdminUser(user('a@b.co'))]);
    await isAdminUser(user('a@b.co'));
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(getCachedAdmin(user('a@b.co'))).toBe(true);

    mockState.listener?.('SIGNED_OUT');
    expect(getCachedAdmin(user('a@b.co'))).toBeUndefined();
    await isAdminUser(user('a@b.co'));
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });
});
