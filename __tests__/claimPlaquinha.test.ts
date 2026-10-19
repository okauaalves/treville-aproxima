const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: (name: string, args?: unknown) => mockRpc(name, args),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { claimPlaquinha } = require('@/lib/claimPlaquinha') as typeof import('@/lib/claimPlaquinha');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuthStore } = require('@/stores/authStore') as typeof import('@/stores/authStore');

describe('claimPlaquinha', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: { id: 'u1', email: 'cliente@exemplo.com' } as never });
  });

  it('chama RPC claim_plaquinha com código normalizado', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ id: 'EMPTY1', name: 'Lote 1', destination_type: 'empty', claimed: true }],
      error: null,
    });
    await expect(claimPlaquinha('https://nfc-manager.expo.app/t/empty1')).resolves.toEqual({
      id: 'EMPTY1',
      name: 'Lote 1',
      destination_type: 'empty',
      claimed: true,
    });
    expect(mockRpc).toHaveBeenCalledWith('claim_plaquinha', { p_code: 'EMPTY1' });
  });

  it('não-empty devolve claimed false sem erro', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ id: 'K7M2QX', name: 'Mesa', destination_type: 'whatsapp', claimed: false }],
      error: null,
    });
    await expect(claimPlaquinha('K7M2QX')).resolves.toEqual({
      id: 'K7M2QX',
      name: 'Mesa',
      destination_type: 'whatsapp',
      claimed: false,
    });
  });

  it('inexistente → null', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(claimPlaquinha('ZZZZZZ')).resolves.toBeNull();
  });

  it('código inválido nem chama o servidor', async () => {
    await expect(claimPlaquinha('??')).rejects.toThrow('Código inválido');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
