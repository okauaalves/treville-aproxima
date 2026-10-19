const rpc = jest.fn();
const insert = jest.fn();
const mockDb = { rpc, insert };

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: (name: string, args?: unknown) => mockDb.rpc(name, args),
    from: () => ({ insert: (row: unknown) => mockDb.insert(row) }),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('@/lib/adminAccess') as typeof import('@/lib/adminAccess');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuthStore } = require('@/stores/authStore') as typeof import('@/stores/authStore');

describe('lib/adminAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: { id: 'u1', email: 'cliente@exemplo.com' } as never });
  });

  it('lookup manda só o código normalizado e devolve id + nome', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: 'K7M2QX', name: 'Mesa 1' }], error: null });
    await expect(api.lookupPlaquinha('https://x.supabase.co/functions/v1/redirect/k7m2qx?s=nfc')).resolves.toEqual({ id: 'K7M2QX', name: 'Mesa 1' });
    expect(rpc).toHaveBeenCalledWith('lookup_plaquinha', { p_code: 'K7M2QX' });
  });

  it('lookup aceita o link curto /t/<ID> colado', async () => {
    rpc.mockResolvedValueOnce({ data: [{ id: 'K7M2QX', name: 'Mesa 1' }], error: null });
    await expect(api.lookupPlaquinha('https://nfc-manager.expo.app/t/k7m2qx?s=nfc')).resolves.toEqual({ id: 'K7M2QX', name: 'Mesa 1' });
    expect(rpc).toHaveBeenCalledWith('lookup_plaquinha', { p_code: 'K7M2QX' });
  });

  it('lookup recusa código inválido sem chamar o servidor', async () => {
    await expect(api.lookupPlaquinha('../../etc')).rejects.toThrow('Código inválido');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('pedido usa o usuário da sessão, status pending e motivo aparado', async () => {
    insert.mockResolvedValueOnce({ error: null });
    await api.requestEditAccess('K7M2QX', 'Mesa 1', '  meu restaurante  ');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1', link_id: 'K7M2QX', status: 'pending', reason: 'meu restaurante' }));
  });

  it('pedido duplicado (índice único) vira mensagem amigável', async () => {
    insert.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } });
    await expect(api.requestEditAccess('K7M2QX', 'Mesa 1')).rejects.toThrow('Você já tem uma solicitação ativa para esta plaquinha.');
  });

  it('mensagens do trigger chegam ao usuário; RLS vira "Sem permissão"', async () => {
    insert.mockResolvedValueOnce({ error: { code: '22023', message: 'Esta plaquinha já é sua.' } });
    await expect(api.requestEditAccess('K7M2QX', 'Mesa 1')).rejects.toThrow('Esta plaquinha já é sua.');
    insert.mockResolvedValueOnce({ error: { code: '42501', message: 'new row violates row-level security policy' } });
    await expect(api.requestEditAccess('K7M2QX', 'Mesa 1')).rejects.toThrow('Sem permissão para esta ação.');
  });

  it('motivo acima de 300 caracteres nem sai do app', async () => {
    await expect(api.requestEditAccess('K7M2QX', 'Mesa 1', 'x'.repeat(301))).rejects.toThrow('Motivo muito longo');
    expect(insert).not.toHaveBeenCalled();
  });

  it('remover admin repassa a recusa do servidor', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Você não pode remover a si mesmo.' } });
    await expect(api.removeAdmin(' Admin2@Exemplo.com ')).rejects.toThrow('Você não pode remover a si mesmo.');
    expect(rpc).toHaveBeenCalledWith('remove_admin', { p_email: 'admin2@exemplo.com' });
  });

  it('adicionar admin valida e normaliza o e-mail', async () => {
    await expect(api.addAdmin('sem-arroba', 'X')).rejects.toThrow('E-mail inválido.');
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(api.addAdmin(' Nova.Admin@Exemplo.com ', ' Nova ')).resolves.toBe('nova.admin@exemplo.com');
    expect(rpc).toHaveBeenCalledWith('add_admin', { p_email: 'nova.admin@exemplo.com', p_name: 'Nova' });
  });

  it('RPC ausente (migration não aplicada) pede db push', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    await expect(api.listAdmins()).rejects.toThrow('npx supabase db push');
  });
});
