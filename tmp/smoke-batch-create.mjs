/**
 * Smoke: cria 5 plaquinhas empty via service role (só local/.env).
 * Não imprime chaves. Limpa o lote ao final se --cleanup.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

const url = env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = (env.EXPO_PUBLIC_ADMIN_EMAIL || '').toLowerCase();
if (!url || !serviceKey) {
  console.error('MISSING_CREDS');
  process.exit(2);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeId() {
  const bytes = randomBytes(6);
  let id = '';
  for (let i = 0; i < 6; i += 1) id += ALPHABET[bytes[i] % 32];
  return id;
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: users, error: userErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
if (userErr) {
  console.error('LIST_USERS', userErr.message);
  process.exit(1);
}
const admin =
  users.users.find((u) => (u.email || '').toLowerCase() === adminEmail) ||
  users.users[0];
if (!admin?.id) {
  console.error('NO_USER');
  process.exit(1);
}

const prefix = `QABatch${Date.now().toString(36).slice(-4)}`;
const ids = new Set();
while (ids.size < 5) ids.add(makeId());
const idList = [...ids];

// Descobre base de página pública a partir de uma plaquinha empty existente, ou usa redirect base.
let profileBase = (env.EXPO_PUBLIC_SHORT_LINK_BASE || '').replace(/\/+$/, '');
if (!profileBase) {
  const host = new URL(url).hostname.split('.')[0];
  profileBase = `https://${host}.supabase.co/functions/v1/redirect`;
}
// App usa /p/{id} para empty reservado — alinhar com edge function profilePageBase se possível.
const { data: sample } = await supabase
  .from('redirect_links')
  .select('destination_url')
  .eq('destination_type', 'empty')
  .limit(1)
  .maybeSingle();
if (sample?.destination_url) {
  try {
    const u = new URL(sample.destination_url);
    const parts = u.pathname.split('/').filter(Boolean);
    // .../p/AAAAAA → base .../p/
    if (parts.length >= 2) {
      profileBase = `${u.origin}/${parts.slice(0, -1).join('/')}`;
    }
  } catch {
    // keep default
  }
}

const rows = idList.map((id, index) => ({
  id,
  user_id: admin.id,
  name: `${prefix} ${index + 1}`,
  destination_url: `${profileBase.replace(/\/+$/, '')}/${encodeURIComponent(id)}`,
  destination_type: 'empty',
  is_active: false,
  profile_enabled: false,
}));

const { data: inserted, error: insertErr } = await supabase
  .from('redirect_links')
  .insert(rows)
  .select('id,name,destination_type,is_active,profile_enabled,destination_url,user_id');

if (insertErr) {
  console.error('INSERT', insertErr.code || '', insertErr.message);
  process.exit(1);
}

const verify = await supabase
  .from('redirect_links')
  .select('id,name,destination_type,is_active,profile_enabled')
  .in('id', idList)
  .order('name');

const ok =
  (verify.data || []).length === 5 &&
  (verify.data || []).every((r) => r.destination_type === 'empty' && r.is_active === false);

mkdirSync('tmp', { recursive: true });
writeFileSync(
  'tmp/batch-smoke-5-db.json',
  JSON.stringify({ prefix, adminEmail: admin.email, rows: verify.data, ok }, null, 2),
);

console.log(
  JSON.stringify({
    ok,
    count: verify.data?.length ?? 0,
    prefix,
    ids: idList,
    types: (verify.data || []).map((r) => r.destination_type),
    inactive: (verify.data || []).every((r) => r.is_active === false),
    owner: admin.email,
  }),
);

if (process.argv.includes('--cleanup')) {
  const { error: delErr } = await supabase.from('redirect_links').delete().in('id', idList);
  console.log(JSON.stringify({ cleaned: !delErr, delErr: delErr?.message || null }));
}
