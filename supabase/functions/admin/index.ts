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
  const adminEmail = (Deno.env.get('ADMIN_EMAIL') ?? 'previaemailofc@gmail.com').trim().toLowerCase();
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
  const allowed = (confirmed && email === adminEmail) || role === 'admin';
  if (!allowed) {
    return json(403, { error: 'Sem permissão.' });
  }

  const admin = createClient(url, serviceKey);
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = body.action === 'overview' ? 'stats' : body.action ?? 'stats';
  if (action !== 'stats' && action !== 'export' && action !== 'cleanup') {
    return json(400, { error: 'Ação desconhecida.' });
  }

  try {
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

async function countOperations(admin: ReturnType<typeof createClient>): Promise<number> {
  const { count, error } = await admin.from('operations').select('id', { count: 'exact', head: true });
  if (error) {
    throw error;
  }
  return count ?? 0;
}
