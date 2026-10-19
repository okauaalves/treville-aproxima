// Autoriza só o admin. A service_role existe apenas neste runtime — nunca no app.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import {
  adminToCsv,
  aggregateAdmin,
  FREE_PLAN_EDGE_INVOCATIONS,
  invocationUsage,
  monthStartIso,
  type AdminOperationRow,
  type AdminTemplateRow,
  type InvocationUsage,
} from '../_shared/aggregate.ts';
import {
  buildBatchRows,
  checkBatchInput,
  checkEmail,
  isAccessStatus,
  isUuid,
  makeLinkId,
} from '../_shared/adminAccess.ts';
import {
  bearerToken,
  buildOverview,
  decideAdmin,
  DEFAULT_ADMIN_EMAIL,
  errorPayload,
  isMissingSchema,
  mergeUsers,
  normalizeEmail,
  sectionFrom,
  type AdminRow,
  type AuthListUser,
  type DbError,
  type LinkRow,
  type ProfileRow,
  type Section,
} from '../_shared/adminOverview.ts';
import { resolveProfilePageBaseFromEnv } from '../_shared/hostingUrl.ts';

// deno-lint-ignore no-explicit-any
type Client = SupabaseClient<any, 'public', any>;

/** Ponte HTTPS: no PC mostra HTML; no celular abre o app. Também aceite treville://auth/callback nas Redirect URLs. */
const DEFAULT_INVITE_REDIRECT = 'https://nfc-manager.expo.app/auth/open';
const ACTIONS = new Set(['overview', 'stats', 'export', 'cleanup', 'access_list', 'access_set_status', 'invite', 'batch_create', 'pending_count']);
const DAY = 24 * 60 * 60 * 1000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function fail(error: unknown): Response {
  const payload = errorPayload(error);
  if (payload.status >= 500 && payload.status !== 503) {
    console.error('admin function error:', error);
  }
  return json(payload.status, payload.body);
}

Deno.serve(async (request) => {
  try {
    return await handle(request);
  } catch (error) {
    return fail(error);
  }
});

async function handle(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: cors });
  }
  if (request.method !== 'POST') {
    return json(405, { error: 'Use POST.', code: 'metodo_invalido' });
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !serviceKey) {
    return json(500, { error: 'Função sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.', code: 'config' });
  }
  const jwt = bearerToken(request.headers.get('Authorization'));
  if (!jwt) {
    return json(401, { error: 'Não autenticado.', code: 'nao_autenticado' });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (userError || !user) {
    return json(401, { error: 'Não autenticado.', code: 'nao_autenticado' });
  }
  const primary = normalizeEmail(Deno.env.get('ADMIN_EMAIL')) || DEFAULT_ADMIN_EMAIL;
  const adminRows = await listAdminRows(admin);
  const listed = adminRows.rows.map((row) => normalizeEmail(row.email));
  if (!decideAdmin(user, primary, listed)) {
    return json(403, { error: 'Sem permissão.', code: 'sem_permissao' });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown> & { action?: unknown };
  const action = body.action === undefined || body.action === null || body.action === '' ? 'overview' : String(body.action);
  if (!ACTIONS.has(action)) {
    return json(400, { error: 'Ação desconhecida.', code: 'acao_desconhecida' });
  }

  switch (action) {
    case 'pending_count': {
      const { count, error } = await admin.from('user_access').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      return error ? fail(error) : json(200, { pending: count ?? 0 });
    }
    case 'access_list':
      return json(200, { items: await listAccess(admin) });
    case 'access_set_status':
      return await setAccessStatus(admin, body, user.id, primary, listed);
    case 'invite':
      return await inviteUser(admin, body, user.id);
    case 'batch_create':
      return await batchCreate(admin, body, user.id);
    case 'cleanup': {
      const cutoff = new Date(Date.now() - 90 * DAY).toISOString();
      const { data, error } = await admin.from('operations').delete().lt('created_at', cutoff).select('id');
      return error ? fail(error) : json(200, { deleted: data?.length ?? 0 });
    }
    default: {
      const overview = await buildFullOverview(admin, primary, adminRows);
      return action === 'export' ? json(200, { csv: adminToCsv(overview) }) : json(200, overview);
    }
  }
}

/** Tabela public.admins criada à mão ou pela migration. Sem a tabela: lista vazia + aviso. */
async function listAdminRows(admin: Client): Promise<Section<AdminRow>> {
  const { data, error } = await admin.from('admins').select('email,name').limit(500);
  if (error && !isMissingSchema(error)) {
    console.warn('admins lookup failed:', error.message);
    return { rows: [], missing: false };
  }
  return sectionFrom((data ?? []) as AdminRow[], error);
}

/** Coluna ausente (42703/PGRST204) refaz com '*' — o mapeamento só expõe os campos seguros. */
async function selectRows<T>(admin: Client, table: string, columns: string, limit: number): Promise<Section<T>> {
  const first = await admin.from(table).select(columns).order('created_at', { ascending: false }).limit(limit);
  if (first.error && (first.error.code === '42703' || first.error.code === 'PGRST204')) {
    const retry = await admin.from(table).select('*').limit(limit);
    return sectionFrom((retry.data ?? []) as T[], retry.error as DbError);
  }
  return sectionFrom((first.data ?? []) as unknown as T[], first.error as DbError);
}

async function countRows(admin: Client, table: string, since?: { column: string; iso: string }): Promise<{ count: number; missing: boolean }> {
  let query = admin.from(table).select('id', { count: 'exact', head: true });
  if (since) {
    query = query.gte(since.column, since.iso);
  }
  const { count, error } = await query;
  if (error) {
    if (isMissingSchema(error)) {
      return { count: 0, missing: true };
    }
    throw error;
  }
  return { count: count ?? 0, missing: false };
}

async function buildFullOverview(admin: Client, primary: string, adminRows: Section<AdminRow>) {
  const now = Date.now();
  const authUsers = await listAllUsers(admin);
  const [profiles, links, scansTotal, scans30, scansMonth, operations, templates, totalOperations] = await Promise.all([
    selectRows<ProfileRow>(admin, 'profiles', 'id,full_name,display_name,avatar_url,created_at', 1000),
    selectRows<LinkRow>(admin, 'redirect_links', 'id,name,destination_type,is_active,scan_count,user_id,created_at', 200),
    countRows(admin, 'scan_logs'),
    countRows(admin, 'scan_logs', { column: 'scanned_at', iso: new Date(now - 30 * DAY).toISOString() }),
    countRows(admin, 'scan_logs', { column: 'scanned_at', iso: monthStartIso(now) }),
    listOperations(admin),
    listTemplates(admin),
    countRows(admin, 'operations'),
  ]);
  const extraMissing: string[] = [];
  if (operations.missing) {
    extraMissing.push('A tabela operations');
  }
  if (templates.missing) {
    extraMissing.push('A tabela templates');
  }
  const overview = buildOverview({
    authUsers,
    profiles,
    links,
    admins: adminRows,
    scans: { total: scansTotal.count, last30d: scans30.count, missing: scansTotal.missing },
    extraMissing,
    primaryEmail: primary,
  });
  const allUsers = mergeUsers(authUsers, profiles.rows, Number.MAX_SAFE_INTEGER);
  const emails = new Map(allUsers.map((item) => [item.id, item.email]));
  const operationRows = operations.rows.map((row) => ({ ...row, email: emails.get(row.userId) ?? '' }));
  const aggregate = aggregateAdmin({ users: allUsers, operations: operationRows, templates: templates.rows, totalOperations: totalOperations.count, now });
  return {
    ...aggregate,
    ...overview,
    usage: scansMonth.missing ? null : monthUsage(scansMonth.count, now),
  };
}

async function listAllUsers(admin: Client): Promise<AuthListUser[]> {
  const rows: AuthListUser[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw error;
    }
    for (const item of data.users) {
      rows.push({
        id: item.id,
        email: item.email ?? '',
        created_at: item.created_at ?? null,
        last_sign_in_at: item.last_sign_in_at ?? null,
        user_metadata: (item.user_metadata ?? null) as Record<string, unknown> | null,
      });
    }
    if (data.users.length < 200) {
      break;
    }
  }
  return rows;
}

async function listOperations(admin: Client): Promise<Section<AdminOperationRow>> {
  const { data, error } = await admin
    .from('operations')
    .select('id,user_id,content_type,operation,status,created_at')
    .order('created_at', { ascending: false })
    .limit(1000);
  const section = sectionFrom((data ?? []) as Record<string, unknown>[], error);
  return {
    missing: section.missing,
    rows: section.rows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id ?? ''),
      email: '',
      contentType: String(row.content_type ?? 'OUTRO'),
      operation: String(row.operation ?? ''),
      status: String(row.status ?? ''),
      createdAt: String(row.created_at ?? ''),
    })),
  };
}

async function listTemplates(admin: Client): Promise<Section<AdminTemplateRow>> {
  const { data, error } = await admin.from('templates').select('id,name,type,use_count').is('deleted_at', null);
  const section = sectionFrom((data ?? []) as Record<string, unknown>[], error);
  return {
    missing: section.missing,
    rows: section.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      type: String(row.type ?? ''),
      useCount: Number(row.use_count ?? 0),
    })),
  };
}

/** Scans do mês contra a cota de invocações. */
function monthUsage(count: number, now: number): InvocationUsage {
  const limit = Number(Deno.env.get('EDGE_INVOCATIONS_LIMIT') ?? FREE_PLAN_EDGE_INVOCATIONS);
  return invocationUsage(count, Number.isFinite(limit) && limit > 0 ? limit : FREE_PLAN_EDGE_INVOCATIONS, now);
}

type AccessRow = { id: string; user_id: string | null; email: string | null; status: string; invited_by: string | null; approved_at: string | null; created_at: string };

async function listAccess(admin: Client) {
  const { data, error } = await admin
    .from('user_access')
    .select('id,user_id,email,status,invited_by,approved_at,created_at')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) {
    throw error;
  }
  const rows = (data ?? []) as AccessRow[];
  const ids = rows.map((row) => row.user_id).filter((id): id is string => !!id);
  const profiles = new Map<string, { name: string; avatarUrl: string | null }>();
  for (let index = 0; index < ids.length; index += 100) {
    const { data: chunk } = await admin.from('profiles').select('id,display_name,full_name,avatar_url').in('id', ids.slice(index, index + 100));
    for (const item of chunk ?? []) {
      const name = String(item.display_name ?? '').trim() || String(item.full_name ?? '').trim();
      profiles.set(String(item.id), { name, avatarUrl: typeof item.avatar_url === 'string' ? item.avatar_url : null });
    }
  }
  return rows.map((row) => {
    const profile = row.user_id ? profiles.get(row.user_id) : undefined;
    return {
      id: row.id,
      userId: row.user_id,
      email: row.email ?? '',
      status: row.status,
      name: profile?.name || row.email || 'Sem nome',
      avatarUrl: profile?.avatarUrl ?? null,
      invited: !!row.invited_by,
      createdAt: row.created_at,
      approvedAt: row.approved_at,
    };
  });
}

async function setAccessStatus(admin: Client, body: Record<string, unknown>, callerId: string, primary: string, listed: string[]): Promise<Response> {
  if (!isUuid(body.id) || !isAccessStatus(body.status)) {
    return json(400, { error: 'Pedido inválido.', code: 'entrada_invalida' });
  }
  const { data: row, error } = await admin.from('user_access').select('id,user_id,email,status,approved_at').eq('id', body.id).maybeSingle();
  if (error) {
    return fail(error);
  }
  if (!row) {
    return json(404, { error: 'Registro não encontrado.', code: 'nao_encontrado' });
  }
  if (body.status !== 'approved') {
    if (row.user_id === callerId) {
      return json(400, { error: 'Você não pode bloquear a própria conta.', code: 'entrada_invalida' });
    }
    const target = normalizeEmail(row.email);
    if (target && (target === primary || listed.includes(target))) {
      return json(400, { error: 'Administradores não podem ser bloqueados.', code: 'entrada_invalida' });
    }
  }
  const approvedAt = body.status === 'approved' ? new Date().toISOString() : row.approved_at;
  const { error: updateError } = await admin.from('user_access').update({ status: body.status, approved_at: approvedAt }).eq('id', body.id);
  if (updateError) {
    return fail(updateError);
  }
  return json(200, { id: body.id, status: body.status, approvedAt });
}

/** Cria (ou aprova) a linha pelo e-mail e manda o convite; o trigger de auth.users vincula o user_id. */
async function inviteUser(admin: Client, body: Record<string, unknown>, callerId: string): Promise<Response> {
  const checked = checkEmail(body.email);
  if (!checked.ok) {
    return json(400, { error: checked.error, code: 'entrada_invalida' });
  }
  const email = checked.value;
  const now = new Date().toISOString();
  const { data: existing, error } = await admin.from('user_access').select('id,user_id,status').eq('email', email).maybeSingle();
  if (error) {
    return fail(error);
  }
  if (existing?.user_id) {
    if (existing.status !== 'approved') {
      await admin.from('user_access').update({ status: 'approved', approved_at: now }).eq('id', existing.id);
    }
    return json(200, { invited: false, alreadyRegistered: true, email });
  }
  let createdId: string | null = null;
  if (existing) {
    await admin.from('user_access').update({ status: 'approved', approved_at: now, invited_by: callerId }).eq('id', existing.id);
  } else {
    const { data: inserted, error: insertError } = await admin
      .from('user_access')
      .insert({ email, status: 'approved', approved_at: now, invited_by: callerId })
      .select('id')
      .single();
    if (insertError) {
      return fail(insertError);
    }
    createdId = String(inserted.id);
  }
  const redirectTo = (Deno.env.get('INVITE_REDIRECT_TO') ?? '').trim() || DEFAULT_INVITE_REDIRECT;
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (inviteError) {
    if (/already (been )?registered|already exists/i.test(inviteError.message)) {
      // Conta já existe: a linha aprovada por e-mail é vinculada no próximo login (my_access_status).
      return json(200, { invited: false, alreadyRegistered: true, email });
    }
    if (createdId) {
      await admin.from('user_access').delete().eq('id', createdId).is('user_id', null);
    }
    return json(502, { error: `Não foi possível enviar o convite: ${inviteError.message}`, code: 'convite_falhou' });
  }
  return json(200, { invited: true, email });
}

function profilePageBase(): string {
  return resolveProfilePageBaseFromEnv();
}

/** Um insert multi-linha por bloco; colisão de ID (23505) refaz o bloco inteiro com IDs novos. */
async function batchCreate(admin: Client, body: Record<string, unknown>, userId: string): Promise<Response> {
  const checked = checkBatchInput(body);
  if (!checked.ok) {
    return json(400, { error: checked.error, code: 'entrada_invalida' });
  }
  const input = checked.value;
  const randomBytes = (count: number) => crypto.getRandomValues(new Uint8Array(count));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const ids = new Set<string>();
    while (ids.size < input.quantity) {
      ids.add(makeLinkId(randomBytes));
    }
    const rows = buildBatchRows(input, userId, [...ids], profilePageBase());
    const { data, error } = await admin
      .from('redirect_links')
      .insert(rows as unknown as Record<string, unknown>[])
      .select('id,name,destination_url,destination_type,is_active,profile_enabled,created_at');
    if (!error) {
      return json(200, { items: data ?? [] });
    }
    if (error.code !== '23505') {
      return fail(error);
    }
  }
  return json(409, { error: 'Não foi possível gerar códigos livres. Tente de novo.', code: 'conflito' });
}
