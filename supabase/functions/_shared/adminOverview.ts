// Lógica pura da Edge Function `admin`: decisão de admin, erros do PostgREST e montagem do overview.
// Sem APIs de Deno ou React Native para rodar nos dois lados (testada com jest).

export const DEFAULT_ADMIN_EMAIL = 'previaemailofc@gmail.com';
export const OVERVIEW_LIMIT = 200;

/** Tabela, RPC ou coluna que ainda não existe no banco (migração não aplicada). */
const MISSING_CODES = new Set(['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42883', '42703']);

export type DbError = { code?: string | null; message?: string | null } | null | undefined;

export function isMissingSchema(error: DbError): boolean {
  if (!error) {
    return false;
  }
  if (error.code && MISSING_CODES.has(error.code)) {
    return true;
  }
  return /schema cache|does not exist|could not find the (table|function)/i.test(error.message ?? '');
}

export class MissingSchemaError extends Error {
  constructor(public readonly resource: string) {
    super(`${resource} não existe no banco`);
    this.name = 'MissingSchemaError';
  }
}

export type ErrorPayload = { status: number; body: { error: string; code: string } };

export const MIGRATION_PENDING_MESSAGE = 'O servidor ainda não tem as tabelas desta função. Rode supabase db push.';

/** Qualquer exceção vira resposta JSON; falta de migração é 503, nunca 500. */
export function errorPayload(error: unknown): ErrorPayload {
  if (error instanceof MissingSchemaError || isMissingSchema(error as DbError)) {
    const resource = error instanceof MissingSchemaError ? ` (${error.resource})` : '';
    return { status: 503, body: { error: `${MIGRATION_PENDING_MESSAGE}${resource}`, code: 'migracao_pendente' } };
  }
  const message = error instanceof Error ? error.message : typeof (error as DbError)?.message === 'string' ? String((error as { message: string }).message) : '';
  return { status: 500, body: { error: message || 'Falha ao consultar os dados.', code: 'erro_interno' } };
}

export type AuthUserLike = {
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** app_metadata.role (só o service role escreve) ou e-mail confirmado igual ao principal ou listado em public.admins. */
export function decideAdmin(user: AuthUserLike | null | undefined, primaryEmail: string, listedEmails: readonly string[]): boolean {
  if (!user) {
    return false;
  }
  if (user.app_metadata?.role === 'admin') {
    return true;
  }
  const email = normalizeEmail(user.email);
  const confirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
  if (!email || !confirmed) {
    return false;
  }
  const primary = normalizeEmail(primaryEmail) || DEFAULT_ADMIN_EMAIL;
  return email === primary || listedEmails.some((item) => normalizeEmail(item) === email);
}

export function bearerToken(header: string | null | undefined): string {
  const match = /^Bearer\s+(.+)$/i.exec((header ?? '').trim());
  return match ? match[1].trim() : '';
}

/** Resultado de uma consulta isolada: tabela ausente vira [] + aviso. */
export type Section<T> = { rows: T[]; missing: boolean };

export function sectionFrom<T>(data: T[] | null | undefined, error: DbError): Section<T> {
  if (error) {
    if (isMissingSchema(error)) {
      return { rows: [], missing: true };
    }
    throw error;
  }
  return { rows: data ?? [], missing: false };
}

export type OverviewUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
};

export type OverviewLink = {
  id: string;
  name: string;
  destinationType: string;
  isActive: boolean;
  scanCount: number;
  userId: string | null;
  createdAt: string | null;
};

export type OverviewAdmin = { email: string; name: string };

export type AuthListUser = {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type ProfileRow = { id: unknown; full_name?: unknown; display_name?: unknown; avatar_url?: unknown; created_at?: unknown };
export type LinkRow = {
  id: unknown;
  name?: unknown;
  destination_type?: unknown;
  is_active?: unknown;
  scan_count?: unknown;
  user_id?: unknown;
  created_at?: unknown;
};
export type AdminRow = { email?: unknown; name?: unknown };

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Une auth.users (e-mail, último acesso) com profiles (nome, avatar). Usuário só em profiles também aparece. */
export function mergeUsers(authUsers: AuthListUser[], profiles: ProfileRow[], limit = OVERVIEW_LIMIT): OverviewUser[] {
  const byId = new Map<string, ProfileRow>(profiles.map((row) => [String(row.id), row]));
  const users: OverviewUser[] = authUsers.map((item) => {
    const profile = byId.get(item.id);
    byId.delete(item.id);
    const meta = item.user_metadata ?? {};
    const name = text(profile?.display_name) || text(profile?.full_name) || text(meta.full_name) || text(item.email) || 'Sem nome';
    return {
      id: item.id,
      name,
      email: item.email ?? '',
      avatarUrl: text(profile?.avatar_url) || null,
      createdAt: item.created_at ?? (text(profile?.created_at) || null),
      lastSignInAt: item.last_sign_in_at ?? null,
    };
  });
  for (const [id, profile] of byId) {
    users.push({
      id,
      name: text(profile.display_name) || text(profile.full_name) || 'Sem nome',
      email: '',
      avatarUrl: text(profile.avatar_url) || null,
      createdAt: text(profile.created_at) || null,
      lastSignInAt: null,
    });
  }
  return users.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, limit);
}

export function mapLinks(rows: LinkRow[]): OverviewLink[] {
  return rows.map((row) => ({
    id: String(row.id),
    name: text(row.name),
    destinationType: text(row.destination_type) || 'url',
    isActive: row.is_active === true,
    scanCount: Number.isFinite(Number(row.scan_count)) ? Number(row.scan_count) : 0,
    userId: text(row.user_id) || null,
    createdAt: text(row.created_at) || null,
  }));
}

export function mapAdmins(rows: AdminRow[], primaryEmail: string): OverviewAdmin[] {
  const primary = normalizeEmail(primaryEmail) || DEFAULT_ADMIN_EMAIL;
  const seen = new Set<string>();
  const admins: OverviewAdmin[] = [];
  for (const row of [{ email: primary, name: 'Admin principal' }, ...rows]) {
    const email = normalizeEmail(row.email);
    if (email && !seen.has(email)) {
      seen.add(email);
      admins.push({ email, name: text(row.name) });
    }
  }
  return admins;
}

export function missingWarning(resource: string): string {
  return `${resource} não existe no banco (rode supabase db push).`;
}

export type OverviewInput = {
  authUsers: AuthListUser[];
  profiles: Section<ProfileRow>;
  links: Section<LinkRow>;
  admins: Section<AdminRow>;
  scans: { total: number; last30d: number; missing: boolean };
  extraMissing?: string[];
  primaryEmail: string;
};

export type Overview = {
  users: OverviewUser[];
  links: OverviewLink[];
  admins: OverviewAdmin[];
  scans: { total: number; last30d: number };
  warnings: string[];
};

export function buildOverview(input: OverviewInput): Overview {
  const warnings: string[] = [];
  if (input.profiles.missing) {
    warnings.push(missingWarning('A tabela profiles'));
  }
  if (input.links.missing) {
    warnings.push(missingWarning('A tabela redirect_links'));
  }
  if (input.admins.missing) {
    warnings.push(missingWarning('A tabela admins'));
  }
  if (input.scans.missing) {
    warnings.push(missingWarning('A tabela scan_logs'));
  }
  for (const resource of input.extraMissing ?? []) {
    warnings.push(missingWarning(resource));
  }
  return {
    users: mergeUsers(input.authUsers, input.profiles.rows),
    links: mapLinks(input.links.rows).slice(0, OVERVIEW_LIMIT),
    admins: mapAdmins(input.admins.rows, input.primaryEmail),
    scans: { total: input.scans.total, last30d: input.scans.last30d },
    warnings,
  };
}
