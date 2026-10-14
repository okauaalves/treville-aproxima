// Autoriza só o admin. A service_role existe apenas neste runtime — nunca no app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import {
  adminToCsv,
  aggregateAdmin,
  FREE_PLAN_EDGE_INVOCATIONS,
  invocationUsage,
  monthStartIso,
  type AdminOperationRow,
  type AdminTemplateRow,
  type AdminUserRow,
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

const PRIMARY_ADMIN_EMAIL = 'previaemailofc@gmail.com';
const DEFAULT_PROFILE_PAGE_BASE = 'https://treville-aproxima.expo.app/p';
const DEFAULT_INVITE_REDIRECT = 'treville://auth/callback';
const ACCESS_ACTIONS = new Set(['access_list', 'access_set_status', 'invite', 'batch_create', 'pending_count']);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (request.method !== 'POST') {
    return json(405, { error: 'Use POST.' });
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authorization = request.headers.get('Authorization') ?? '';
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    return json(401, { error: 'Não autenticado.' });
  }

  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  const user = userData.user;
  if (userError || !user) {
    return json(401, { error: 'Não autenticado.' });
  }
  const email = (user.email ?? '').trim().toLowerCase();
  const confirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
  const role = (user.app_metadata as { role?: string } | undefined)?.role;
  const admin = createClient(url, serviceKey);
  const primary = (Deno.env.get('ADMIN_EMAIL') ?? PRIMARY_ADMIN_EMAIL).trim().toLowerCase();
  const allowed = role === 'admin' || (confirmed && email !== '' && (email === primary || (await isListedAdmin(admin, email))));
  if (!allowed) {
    return json(403, { error: 'Sem permissão.' });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown> & { action?: string };
  const action = body.action === 'overview' ? 'stats' : body.action ?? 'stats';
  if (action !== 'stats' && action !== 'export' && action !== 'cleanup' && !ACCESS_ACTIONS.has(action)) {
    return json(400, { error: 'Ação desconhecida.' });
  }

  try {
    if (action === 'pending_count') {
      const { count, error } = await admin.from('user_access').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      return error ? json(500, { error: error.message }) : json(200, { pending: count ?? 0 });
    }
    if (action === 'access_list') {
      return json(200, { items: await listAccess(admin) });
    }
    if (action === 'access_set_status') {
      return await setAccessStatus(admin, body, user.id, primary);
    }
    if (action === 'invite') {
      return await inviteUser(admin, body, user.id);
    }
    if (action === 'batch_create') {
      return await batchCreate(admin, body, user.id);
    }
    if (action === 'cleanup') {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await admin.from('operations').delete().lt('created_at', cutoff).select('id');
      if (error) {
        return json(500, { error: error.message });
      }
      return json(200, { deleted: data?.length ?? 0 });
    }

    const users = await listAllUsers(admin);
    const operations = await listOperations(admin, users);
    const templates = await listTemplates(admin);
    const totalOperations = await countOperations(admin);
    const overview = { ...aggregateAdmin({ users, operations, templates, totalOperations }), usage: await monthUsage(admin) };

    if (action === 'export') {
      return json(200, { csv: adminToCsv(overview) });
    }
    return json(200, overview);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao consultar os dados.';
    return json(500, { error: message });
  }
});

/** Tabela public.admins (migration 20261012030000). Sem a tabela ou com erro, nega. */
async function isListedAdmin(admin: ReturnType<typeof createClient>, email: string): Promise<boolean> {
  const { data, error } = await admin.from('admins').select('email').eq('email', email).maybeSingle();
  if (error) {
    console.warn('admins lookup failed:', error.message);
    return false;
  }
  return !!data;
}

async function listAllUsers(admin: ReturnType<typeof createClient>): Promise<AdminUserRow[]> {
  const rows: AdminUserRow[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw error;
    }
    for (const item of data.users) {
      const meta = item.user_metadata as { full_name?: string } | undefined;
      rows.push({
        id: item.id,
        name: meta?.full_name?.trim() || item.email || 'Sem nome',
        email: item.email ?? '',
        createdAt: item.created_at ?? null,
        lastSignInAt: item.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < 200) {
      break;
    }
  }
  return rows;
}

async function listOperations(admin: ReturnType<typeof createClient>, users: AdminUserRow[]): Promise<AdminOperationRow[]> {
  const emails = new Map(users.map((user) => [user.id, user.email]));
  const { data, error } = await admin
    .from('operations')
    .select('id,user_id,content_type,operation,status,created_at')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => ({
    id: String(row.id),
    userId: String(row.user_id ?? ''),
    email: emails.get(String(row.user_id ?? '')) ?? '',
    contentType: String(row.content_type ?? 'OUTRO'),
    operation: String(row.operation ?? ''),
    status: String(row.status ?? ''),
    createdAt: String(row.created_at ?? ''),
  }));
}

async function listTemplates(admin: ReturnType<typeof createClient>): Promise<AdminTemplateRow[]> {
  const { data, error } = await admin.from('templates').select('id,name,type,use_count').is('deleted_at', null);
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    type: String(row.type ?? ''),
    useCount: Number(row.use_count ?? 0),
  }));
}

/** Scans do mês contados no banco (count exato, sem trazer linhas). null = tabela ainda não existe. */
async function monthUsage(admin: ReturnType<typeof createClient>): Promise<InvocationUsage | null> {
  const now = Date.now();
  const { count, error } = await admin.from('scan_logs').select('id', { count: 'exact', head: true }).gte('scanned_at', monthStartIso(now));
  if (error) {
    return null;
  }
  const limit = Number(Deno.env.get('EDGE_INVOCATIONS_LIMIT') ?? FREE_PLAN_EDGE_INVOCATIONS);
  return invocationUsage(count ?? 0, Number.isFinite(limit) && limit > 0 ? limit : FREE_PLAN_EDGE_INVOCATIONS, now);
}

type AccessRow = { id: string; user_id: string | null; email: string | null; status: string; invited_by: string | null; approved_at: string | null; created_at: string };

async function listAccess(admin: ReturnType<typeof createClient>) {
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

async function setAccessStatus(admin: ReturnType<typeof createClient>, body: Record<string, unknown>, callerId: string, primary: string): Promise<Response> {
  if (!isUuid(body.id) || !isAccessStatus(body.status)) {
    return json(400, { error: 'Pedido inválido.' });
  }
  const { data: row, error } = await admin.from('user_access').select('id,user_id,email,status,approved_at').eq('id', body.id).maybeSingle();
  if (error) {
    return json(500, { error: error.message });
  }
  if (!row) {
    return json(404, { error: 'Registro não encontrado.' });
  }
  if (body.status !== 'approved') {
    if (row.user_id === callerId) {
      return json(400, { error: 'Você não pode bloquear a própria conta.' });
    }
    const target = String(row.email ?? '');
    if (target && (target === primary || (await isListedAdmin(admin, target)))) {
      return json(400, { error: 'Administradores não podem ser bloqueados.' });
    }
  }
  const approvedAt = body.status === 'approved' ? new Date().toISOString() : row.approved_at;
  const { error: updateError } = await admin.from('user_access').update({ status: body.status, approved_at: approvedAt }).eq('id', body.id);
  if (updateError) {
    return json(500, { error: updateError.message });
  }
  return json(200, { id: body.id, status: body.status, approvedAt });
}

/** Cria (ou aprova) a linha pelo e-mail e manda o convite; o trigger de auth.users vincula o user_id. */
async function inviteUser(admin: ReturnType<typeof createClient>, body: Record<string, unknown>, callerId: string): Promise<Response> {
  const checked = checkEmail(body.email);
  if (!checked.ok) {
    return json(400, { error: checked.error });
  }
  const email = checked.value;
  const now = new Date().toISOString();
  const { data: existing, error } = await admin.from('user_access').select('id,user_id,status').eq('email', email).maybeSingle();
  if (error) {
    return json(500, { error: error.message });
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
      return json(500, { error: insertError.message });
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
    return json(502, { error: `Não foi possível enviar o convite: ${inviteError.message}` });
  }
  return json(200, { invited: true, email });
}

function profilePageBase(): string {
  const value = (Deno.env.get('PROFILE_PAGE_URL') ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^/\s]+/.test(value) ? value : DEFAULT_PROFILE_PAGE_BASE;
}

/** Um insert multi-linha por bloco; colisão de ID (23505) refaz o bloco inteiro com IDs novos. */
async function batchCreate(admin: ReturnType<typeof createClient>, body: Record<string, unknown>, userId: string): Promise<Response> {
  const checked = checkBatchInput(body);
  if (!checked.ok) {
    return json(400, { error: checked.error });
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
      .insert(rows)
      .select('id,name,destination_url,destination_type,is_active,profile_enabled,created_at');
    if (!error) {
      return json(200, { items: data ?? [] });
    }
    if (error.code !== '23505') {
      return json(500, { error: error.message });
    }
  }
  return json(409, { error: 'Não foi possível gerar códigos livres. Tente de novo.' });
}

async function countOperations(admin: ReturnType<typeof createClient>): Promise<number> {
  const { count, error } = await admin.from('operations').select('id', { count: 'exact', head: true });
  if (error) {
    throw error;
  }
  return count ?? 0;
}
