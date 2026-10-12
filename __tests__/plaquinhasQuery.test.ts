import { getPlaquinhas } from '@/lib/plaquinhas';

const calls: [string, ...unknown[]][] = [];
const rows = [
  { id: 'BBBBBB', is_active: false, created_at: '2026-10-12T10:00:00Z' },
  { id: 'AAAAAA', is_active: true, created_at: '2026-10-11T10:00:00Z' },
];

jest.mock('expo-crypto', () => ({ getRandomBytes: (count: number) => new Uint8Array(count) }));
jest.mock('@/stores/authStore', () => ({ useAuthStore: { getState: () => ({ user: { id: 'user-1' } }) } }));
jest.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'select', 'eq', 'order']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return method === 'order' ? Promise.resolve({ data: rows, error: null, status: 200 }) : builder;
    };
  }
  return { supabase: builder, isSupabaseConfigured: true };
});

describe('getPlaquinhas', () => {
  it('traz ativas e inativas do usuário da sessão, mais novas primeiro, sem paginação', async () => {
    const result = await getPlaquinhas();
    expect(result.map((item) => item.id)).toEqual(['BBBBBB', 'AAAAAA']);
    expect(calls).toContainEqual(['from', 'redirect_links']);
    expect(calls).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(calls.some(([method, column]) => method === 'eq' && column === 'is_active')).toBe(false);
    expect(calls).toContainEqual(['order', 'created_at', { ascending: false }]);
    const select = calls.find(([method]) => method === 'select')?.[1] as string;
    expect(select).not.toMatch(/qr_synced|deleted_at/);
  });
});
