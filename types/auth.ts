import type { User } from '@supabase/supabase-js';

/**
 * Usuário da sessão. Subconjunto do User do Supabase para o modo local
 * não precisar fabricar aud/created_at. signIn do Supabase é reduzido a estes campos.
 */
export type AppUser = Pick<User, 'id' | 'email' | 'user_metadata'> & { app_metadata?: User['app_metadata'] };

/**
 * Conta local neste aparelho. A senha NÃO é armazenada: a sessão guarda só o id.
 * Com Supabase configurado, a senha fica só no provedor.
 */
export interface LocalAccount {
  id: string;
  email: string;
  fullName: string;
}
