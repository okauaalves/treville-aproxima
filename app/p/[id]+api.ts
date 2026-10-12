import { createProfileHandler } from '@/lib/profileHost';

const handle = createProfileHandler({ fetch: (input, init) => fetch(input, init), supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL });

export function GET(_request: Request, { id }: { id: string }) {
  return handle(id);
}
