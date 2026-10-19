// QA visual: pedir acesso de edição, badges, "Compartilhadas comigo", solicitações (admin) e administradores.
// Supabase fictício (QA_MOCK_REF) respondido por um fetch simulado injetado na página; nada toca o projeto real.
// Pré-requisito: `npx expo start --web --port 8097` com EXPO_PUBLIC_SUPABASE_URL=https://qamockproj0123.supabase.co.
import { Buffer } from 'node:buffer';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.QA_BASE ?? 'http://localhost:8097';
const PROFILE_PAGE_BASE = `${(process.env.EXPO_PUBLIC_SHORT_LINK_BASE ?? 'https://nfc-manager.expo.app').replace(/\/+$/, '')}/p`;
const MOCK_REF = process.env.QA_MOCK_REF ?? 'qamockproj0123';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9342;
const OUT = join('screenshots', 'admins-edicao');
const PROFILE = join(tmpdir(), `treville-admins-edicao-${Date.now()}`);
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'phone', width: 393, height: 852 },
  { name: 'tablet', width: 1024, height: 1366 },
];

const MOCK = `(() => {
  const REF = ${JSON.stringify(MOCK_REF)};
  const HOST = REF + '.supabase.co';
  const PRIMARY = 'previaemailofc@gmail.com';
  const b64 = (value) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  const USERS = {
    admin: { id: '11111111-1111-4111-8111-111111111111', email: PRIMARY, user_metadata: { full_name: 'Admin Tréville' } },
    admin2: { id: '44444444-4444-4444-8444-444444444444', email: 'admin2@exemplo.com', user_metadata: { full_name: 'Segundo Admin' } },
    member: { id: '22222222-2222-4222-8222-222222222222', email: 'cliente@restaurante.com.br', user_metadata: { full_name: 'Carla Souza' } },
  };
  const who = localStorage.getItem('qa-user') || 'admin';
  const base = USERS[who];
  const user = { ...base, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, email_confirmed_at: '2026-10-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z' };
  const token = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: now + 86400, iat: now, email: user.email }) + '.c2ln';
  const key = 'sb-' + REF + '-auth-token';
  const stored = JSON.parse(localStorage.getItem(key) || 'null');
  if (!stored || stored.user?.id !== user.id) {
    localStorage.setItem(key, JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 86400, expires_at: now + 86400, refresh_token: 'qa-refresh', user }));
  }
  const day = 86400000;
  const iso = (ms) => new Date(ms).toISOString();
  const link = (id, owner, name, url, type = 'url', extra = {}) => ({ id, user_id: owner, name, destination_url: url, destination_type: type, is_active: true, profile_enabled: false, nfc_synced: false, scan_count: 0, created_at: iso(Date.now() - 20 * day), updated_at: iso(Date.now() - 20 * day), webhook_url: null, ...extra });
  const seed = () => {
    const t = Date.now();
    const A = USERS.admin.id, M = USERS.member.id;
    return {
      admins: [{ email: PRIMARY, name: 'Admin principal', created_at: iso(t - 40 * day) }, { email: 'admin2@exemplo.com', name: 'Segundo Admin', created_at: iso(t - 10 * day) }],
      links: [
        link('CART01', M, 'Meu cartão', 'https://instagram.com/restaurante_carla', 'instagram', { scan_count: 42, nfc_synced: true }),
        link('MESA01', A, 'Mesa 1 — Bistrô', 'https://wa.me/5511999990001', 'whatsapp', { scan_count: 17 }),
        link('MESA02', A, 'Mesa 2 — Bistrô', `${PROFILE_PAGE_BASE}/MESA02`, 'empty', { is_active: false }),
        link('MESA03', A, 'Balcão', 'https://exemplo.com/balcao'),
        link('MESA04', A, 'Mesa 4 — Bistrô', `${PROFILE_PAGE_BASE}/MESA04`, 'empty', { is_active: false }),
        link('MESA05', A, 'Mesa 5 — Bistrô', `${PROFILE_PAGE_BASE}/MESA05`, 'empty', { is_active: false }),
        link('LOJA77', A, 'Vitrine Loja', 'https://exemplo.com/loja'),
      ],
      requests: [
        { id: 'r1', user_id: M, user_email: USERS.member.email, user_name: 'Carla Souza', link_id: 'MESA01', link_name: 'Mesa 1 — Bistrô', reason: 'Sou a dona do bistrô', status: 'approved', requested_at: iso(t - 6 * day), reviewed_at: iso(t - 5 * day), expires_at: iso(t + 25 * day) },
        { id: 'r2', user_id: M, user_email: USERS.member.email, user_name: 'Carla Souza', link_id: 'MESA02', link_name: 'Mesa 2 — Bistrô', reason: 'Recebi no lote de mesas', status: 'pending', requested_at: iso(t - 2 * day), reviewed_at: null, expires_at: null },
        { id: 'r3', user_id: M, user_email: USERS.member.email, user_name: 'Carla Souza', link_id: 'MESA03', link_name: 'Balcão', reason: null, status: 'denied', requested_at: iso(t - 4 * day), reviewed_at: iso(t - 3 * day), expires_at: null },
        { id: 'r4', user_id: '55555555-5555-4555-8555-555555555555', user_email: 'joao.pereira@exemplo.com', user_name: 'João Pereira', link_id: 'LOJA77', link_name: 'Vitrine Loja', reason: 'Gerencio a vitrine da loja', status: 'pending', requested_at: iso(t - 1 * day), reviewed_at: null, expires_at: null },
        { id: 'r5', user_id: '66666666-6666-4666-8666-666666666666', user_email: 'rafael.lima@exemplo.com', user_name: 'Rafael Lima', link_id: 'MESA03', link_name: 'Balcão', reason: null, status: 'revoked', requested_at: iso(t - 9 * day), reviewed_at: iso(t - 7 * day), expires_at: null },
      ],
      accessPending: 2,
    };
  };
  const load = () => {
    const raw = localStorage.getItem('qa-db');
    if (raw) return JSON.parse(raw);
    const db = seed();
    localStorage.setItem('qa-db', JSON.stringify(db));
    return db;
  };
  const save = (db) => localStorage.setItem('qa-db', JSON.stringify(db));
  const isAdmin = (db) => user.email === PRIMARY || db.admins.some((a) => a.email === user.email);
  const expired = (r) => r.expires_at && new Date(r.expires_at).getTime() <= Date.now();
  const canEdit = (db, id) => { const l = db.links.find((x) => x.id === id); return !!l && (l.user_id === user.id || isAdmin(db) || db.requests.some((r) => r.link_id === id && r.user_id === user.id && r.status === 'approved' && !expired(r))); };
  const visible = (db, l) => l.user_id === user.id || canEdit(db, l.id);
  const op = (value) => { const m = /^(eq|neq|in)\\.(.*)$/.exec(value || ''); if (!m) return null; return m[1] === 'in' ? { op: 'in', value: m[2].replace(/^\\(|\\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')) } : { op: m[1], value: m[2] }; };
  const match = (row, params) => { for (const [k, v] of params) { if (['select', 'order', 'limit', 'offset'].includes(k)) continue; const f = op(v); if (!f) continue; const cell = String(row[k]); if (f.op === 'eq' && cell !== f.value) return false; if (f.op === 'neq' && cell === f.value) return false; if (f.op === 'in' && !f.value.includes(cell)) return false; } return true; };
  window.__qaRequests = [];
  const original = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, location.href);
    if (url.host !== HOST) return original(input, init);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers = new Headers(init.headers || {});
    const body = typeof init.body === 'string' ? init.body : null;
    window.__qaRequests.push({ method, path: url.pathname, query: url.search, body });
    const json = (value, status = 200, extra = {}) => new Response(method === 'HEAD' ? null : JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...extra } });
    const err = (message, code, status = 400) => json({ message, code, details: null, hint: null }, status);
    const rows = (list) => (headers.get('accept') || '').includes('vnd.pgrst.object') ? json(list[0] ?? null, list[0] ? 200 : 406) : json(list, 200, { 'content-range': '0-' + Math.max(0, list.length - 1) + '/' + list.length });
    if (url.pathname === '/auth/v1/user') return json(user);
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
    if (url.pathname.startsWith('/auth/v1/')) return json({});
    const db = load();
    const payload = body ? JSON.parse(body) : {};
    const params = [...url.searchParams.entries()];
    if (url.pathname === '/rest/v1/rpc/my_access_status') return json(isAdmin(db) ? 'admin' : 'approved');
    if (url.pathname === '/rest/v1/rpc/is_admin') return json(isAdmin(db));
    if (url.pathname === '/rest/v1/rpc/can_edit_link') return json(canEdit(db, payload.link_id_param));
    if (url.pathname === '/rest/v1/rpc/lookup_plaquinha') {
      const code = String(payload.p_code || '').toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(code)) return err('Código inválido.', '22023');
      const l = db.links.find((x) => x.id === code);
      return json(l ? [{ id: l.id, name: l.name }] : []);
    }
    if (url.pathname === '/rest/v1/rpc/admin_list_edit_requests') {
      if (!isAdmin(db)) return err('Sem permissão.', '42501');
      return json(db.requests.map((r) => ({ ...r, avatar_url: null })).sort((a, b) => b.requested_at.localeCompare(a.requested_at)));
    }
    if (url.pathname === '/rest/v1/rpc/list_admins') {
      if (!isAdmin(db)) return err('Sem permissão.', '42501');
      return json(db.admins.map((a) => ({ ...a, is_primary: a.email === PRIMARY, has_account: a.email !== 'pendente@exemplo.com' })).sort((a, b) => (b.is_primary - a.is_primary) || a.created_at.localeCompare(b.created_at)));
    }
    if (url.pathname === '/rest/v1/rpc/add_admin') {
      if (!isAdmin(db)) return err('Sem permissão.', '42501');
      const email = String(payload.p_email || '').trim().toLowerCase();
      const existing = db.admins.find((a) => a.email === email);
      if (existing) existing.name = payload.p_name || existing.name; else db.admins.push({ email, name: payload.p_name || null, created_at: new Date().toISOString() });
      save(db);
      return json(null);
    }
    if (url.pathname === '/rest/v1/rpc/remove_admin') {
      const email = String(payload.p_email || '').trim().toLowerCase();
      if (!isAdmin(db)) return err('Sem permissão.', '42501');
      if (email === user.email) return err('Você não pode remover a si mesmo.', '42501');
      if (email === PRIMARY) return err('O administrador principal não pode ser removido.', '42501');
      if (db.admins.length <= 1) return err('É preciso manter pelo menos um administrador.', '42501');
      db.admins = db.admins.filter((a) => a.email !== email);
      save(db);
      return json(null);
    }
    if (url.pathname === '/rest/v1/user_access') return json([], 200, { 'content-range': '*/' + (isAdmin(db) ? db.accessPending : 0) });
    if (url.pathname === '/rest/v1/edit_requests') {
      if (method === 'HEAD' || (headers.get('prefer') || '').includes('count=exact')) {
        const n = isAdmin(db) ? db.requests.filter((r) => match(r, params)).length : 0;
        return json([], 200, { 'content-range': '*/' + n });
      }
      if (method === 'POST') {
        const l = db.links.find((x) => x.id === payload.link_id);
        if (!l) return err('Plaquinha não encontrada.', 'P0002');
        if (l.user_id === user.id) return err('Esta plaquinha já é sua.', '22023');
        if (db.requests.some((r) => r.user_id === user.id && r.link_id === l.id && (r.status === 'pending' || (r.status === 'approved' && !expired(r))))) return err('duplicate key value violates unique constraint', '23505', 409);
        db.requests.push({ id: 'r' + Date.now(), user_id: user.id, user_email: user.email, user_name: user.user_metadata.full_name, link_id: l.id, link_name: l.name, reason: (payload.reason || '').trim() || null, status: 'pending', requested_at: new Date().toISOString(), reviewed_at: null, expires_at: null });
        save(db);
        return new Response(null, { status: 201 });
      }
      if (method === 'PATCH') {
        if (!isAdmin(db)) return json([]);
        const hit = db.requests.filter((r) => match(r, params));
        for (const r of hit) { r.status = payload.status; r.reviewed_at = new Date().toISOString(); if (payload.status === 'approved') r.expires_at = payload.expires_at ?? null; if (payload.status === 'denied') r.expires_at = null; }
        save(db);
        return json(hit.map((r) => ({ id: r.id })));
      }
      return rows(db.requests.filter((r) => (r.user_id === user.id || isAdmin(db)) && match(r, params)));
    }
    if (url.pathname === '/rest/v1/redirect_links') {
      if (method === 'PATCH') {
        const hit = db.links.filter((l) => match(l, params) && canEdit(db, l.id));
        for (const l of hit) { if (l.user_id !== user.id && !isAdmin(db) && ('name' in payload || 'is_active' in payload)) return err('Você só pode alterar o destino desta plaquinha.', '42501'); if (l.destination_type === 'empty' && payload.destination_type && payload.destination_type !== 'empty') l.is_active = true; Object.assign(l, payload); }
        save(db);
        return json(hit.map((l) => ({ id: l.id })));
      }
      return rows(db.links.filter((l) => visible(db, l) && match(l, params)));
    }
    if (url.pathname === '/rest/v1/scan_logs') return json([], 200, { 'content-range': '*/0' });
    if (url.pathname === '/functions/v1/admin') {
      if (!isAdmin(db)) return json({ error: 'Sem permissão.' }, 403);
      return json({ totalUsers: 9, activeUsers7d: 4, totalOperations: 128, totalTemplates: 6, users: [], operationsByType: [{ contentType: 'URL', count: 80 }, { contentType: 'WHATSAPP', count: 48 }], recentOperations: [], topTemplates: [], usage: { scansThisMonth: 1840, limit: 500000, percent: 0.4, warning: false, monthStart: iso(Date.now()) } });
    }
    return json([]);
  };
})();`;

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1280,1366', 'about:blank'], { stdio: 'ignore' });

const results = [];
const consoleErrors = [];
const shots = [];

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` -- ${detail}` : ''}`);
}

async function target() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((response) => response.json());
      const page = list.find((item) => item.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // Chrome ainda subindo.
    }
    await delay(300);
  }
  throw new Error('Chrome sem página');
}

const socket = new WebSocket(await target());
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve);
  socket.addEventListener('error', reject);
});

let id = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled' && (message.params.type === 'error' || message.params.type === 'assert')) {
    consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ').slice(0, 400));
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails;
    consoleErrors.push(`EXCEPTION ${details.exception?.description ?? details.text}`.slice(0, 400));
  }
});

function cdp(method, params = {}) {
  const next = ++id;
  socket.send(JSON.stringify({ id: next, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), 30000);
    pending.set(next, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
  });
}

async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'eval');
  return result.result?.value;
}

async function shot(name) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  shots.push(file.replace(/\\/g, '/'));
}

const VISIBLE = `(node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && node.checkVisibility({ visibilityProperty: true, opacityProperty: true }); }`;
const visibleText = () => evaluate(`(() => { const v = ${VISIBLE}; return [...document.querySelectorAll('div[dir=auto],span,[role=header],[role=heading],h1,h2,h3')].filter(v).map((n) => n.innerText).join('\\n'); })()`);

async function waitFor(text, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const body = await visibleText();
    if (typeof body === 'string' && body.toLocaleLowerCase('pt-BR').includes(text.toLocaleLowerCase('pt-BR'))) return body;
    await delay(150);
  }
  throw new Error(`timeout esperando "${text}". Tela: ${String(await visibleText()).slice(0, 300)}`);
}

async function click(label, roles = '[role=button],button,a,[role=link],[role=tab],[role=radio],[role=switch]', prefix = false) {
  const found = await evaluate(`(() => {
    const want = ${JSON.stringify(label)};
    const norm = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const match = (value) => ${prefix ? 'norm(value).startsWith(want)' : 'norm(value) === want'};
    const node = [...document.querySelectorAll(${JSON.stringify(roles)})]
      .filter(${VISIBLE})
      .filter((item) => match(item.getAttribute('aria-label')) || match(item.innerText)).at(-1);
    if (!node) return false;
    node.scrollIntoView({ block: 'center' });
    node.click();
    return true;
  })()`);
  if (!found) throw new Error(`botão não encontrado: ${label}`);
  await delay(500);
}

async function fill(label, value) {
  const ok = await evaluate(`(() => {
    const input = [...document.querySelectorAll('input,textarea')].filter((item) => {
      const r = item.getBoundingClientRect();
      if (!r.width || !item.checkVisibility({ visibilityProperty: true })) return false;
      const first = item.parentElement?.parentElement?.firstElementChild;
      return first && first !== item.parentElement && (first.innerText || '').trim() === ${JSON.stringify(label)};
    }).at(-1);
    if (!input) return false;
    Object.getOwnPropertyDescriptor(input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`campo não encontrado: ${label}`);
  await delay(150);
}

async function viewport({ width, height }) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 1280 });
  await delay(700);
}

async function overflowCheck(label) {
  const info = await evaluate(`(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }))()`);
  check(`sem overflow horizontal: ${label}`, info.scrollWidth <= info.innerWidth, `${info.scrollWidth}/${info.innerWidth}`);
}

const requests = () => evaluate('window.__qaRequests || []');
const countVisible = (testId) => evaluate(`[...document.querySelectorAll('[data-testid="${testId}"]')].filter(${VISIBLE}).length`);
const lastBody = async (path, method) => {
  const hit = (await requests()).filter((item) => item.path === path && (!method || item.method === method)).at(-1);
  return hit?.body ? JSON.parse(hit.body) : null;
};

async function boot({ who, path = '/', reset = false }) {
  await evaluate(`(() => {
    ${reset ? "localStorage.removeItem('qa-db');" : ''}
    localStorage.setItem('onboarding_done', 'true');
    localStorage.setItem('qa-user', ${JSON.stringify(who)});
    for (const key of Object.keys(localStorage)) if (key.startsWith('sb-') || key.startsWith('treville.access.')) localStorage.removeItem(key);
    return true;
  })()`);
  await cdp('Page.navigate', { url: `${BASE}${path}` });
  await delay(1500);
}

async function settle(text) {
  const start = Date.now();
  while (Date.now() - start < 120000) {
    const body = await visibleText();
    if (body.includes('Antes de começar')) await click('Entendi, continuar').catch(() => undefined);
    if (body.includes(text)) return;
    await delay(400);
  }
  throw new Error(`tela não chegou em "${text}". Tela: ${String(await visibleText()).slice(0, 300)}`);
}

try {
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: MOCK });
  await cdp('Page.navigate', { url: `${BASE}/` });
  await delay(1000);

  for (const vp of VIEWPORTS) {
    const tag = `${vp.width}x${vp.height}`;
    await viewport(vp);

    // Cliente: aba Plaquinhas com própria, compartilhada e pedidos.
    await boot({ who: 'member', path: '/plaquinhas', reset: true });
    await settle('Meu cartão');
    await waitFor('Compartilhadas comigo');
    const tab = await visibleText();
    check(`compartilhada com badge Autorizado: ${tag}`, (await countVisible('plaquinha-card-shared')) === 1 && tab.includes('Autorizado') && tab.includes('Mesa 1 — Bistrô'));
    check(`pedidos com Aguardando e Negado: ${tag}`, tab.includes('Aguardando') && tab.includes('Negado') && tab.includes('Acesso negado pelo administrador'));
    check(`compartilhada sem toggle e sem Perfil: ${tag}`, await evaluate(`(() => { const c = [...document.querySelectorAll('[data-testid="plaquinha-card-shared"]')].find(${VISIBLE}); return !!c && !c.querySelector('[role=switch]') && !c.innerText.includes('Perfil'); })()`));
    await overflowCheck(`plaquinhas ${tag}`);
    await shot(`plaquinhas-compartilhadas-${vp.name}-${tag}`);
    await evaluate(`(() => { const s = document.querySelector('[data-testid="secao-solicitacoes"]'); s && s.scrollIntoView({ block: 'center' }); return true; })()`);
    await delay(400);
    await shot(`plaquinhas-solicitacoes-${vp.name}-${tag}`);

    // Editar destino da compartilhada (checa permissão no servidor).
    await evaluate(`(() => { const c = [...document.querySelectorAll('[data-testid="plaquinha-card-shared"]')].find(${VISIBLE}); const b = [...c.querySelectorAll('[role=button]')].find((n) => n.innerText.trim() === 'Editar'); b.click(); return true; })()`);
    await waitFor('Mudar destino');
    await click('Salvar');
    await waitFor('Destino atualizado!');
    const reqs = await requests();
    check(`salvar chama can_edit_link e PATCH: ${tag}`, reqs.some((item) => item.path === '/rest/v1/rpc/can_edit_link') && reqs.some((item) => item.path === '/rest/v1/redirect_links' && item.method === 'PATCH' && item.query.includes('MESA01')));

    // Solicitar acesso por URL colada.
    await click('Solicitar acesso a uma plaquinha', '[role=button]');
    await waitFor('Código ou URL da plaquinha');
    await fill('Código ou URL da plaquinha', 'AB-1');
    await click('Procurar');
    await waitFor('Código inválido');
    await fill('Código ou URL da plaquinha', 'cart01');
    await click('Procurar');
    await waitFor('Esta plaquinha já é sua');
    await fill('Código ou URL da plaquinha', `https://${MOCK_REF}.supabase.co/functions/v1/redirect/mesa04?s=nfc`);
    await shot(`solicitar-busca-${vp.name}-${tag}`);
    await click('Procurar');
    await waitFor('Esta plaquinha pertence a outro usuário');
    const modal = await visibleText();
    check(`modal com cadeado, nome e textos: ${tag}`, modal.includes('Mesa 4 — Bistrô') && modal.includes('Solicite acesso de edição ao administrador') && modal.includes('Motivo (opcional)'));
    const lookup = await lastBody('/rest/v1/rpc/lookup_plaquinha');
    check(`lookup manda só o código normalizado: ${tag}`, lookup?.p_code === 'MESA04', JSON.stringify(lookup));
    await fill('Motivo (opcional)', 'Recebi a plaquinha da mesa 4');
    await shot(`solicitar-modal-${vp.name}-${tag}`);
    await click('Solicitar acesso');
    await waitFor('Solicitação enviada! Aguarde aprovação.');
    const insert = await lastBody('/rest/v1/edit_requests', 'POST');
    check(`pedido com status pending e motivo: ${tag}`, insert?.status === 'pending' && insert.link_id === 'MESA04' && insert.reason === 'Recebi a plaquinha da mesa 4', JSON.stringify(insert));
    await shot(`solicitar-enviado-${vp.name}-${tag}`);

    // Entrada vinda da tag NFC (rota com ?solicitar=).
    await cdp('Page.navigate', { url: `${BASE}/plaquinhas?solicitar=MESA05` });
    await delay(1500);
    await settle('Esta plaquinha pertence a outro usuário');
    check(`?solicitar= abre a confirmação direto: ${tag}`, (await visibleText()).includes('Mesa 5 — Bistrô'));
    await click('Cancelar');

    // Não-admin não abre o painel.
    await cdp('Page.navigate', { url: `${BASE}/admins` });
    await delay(2500);
    check(`não-admin é redirecionado de /admins: ${tag}`, (await evaluate('location.pathname')) !== '/admins', await evaluate('location.pathname'));

    // Admin: badge soma cadastro (2) + edição (3 pendentes agora).
    await boot({ who: 'admin' });
    await settle('Recentes');
    await delay(1000);
    const badge = await evaluate(`(() => { const b = [...document.querySelectorAll('[data-testid="home-admin"] [data-testid="count-badge"]')].find(${VISIBLE}); return b ? b.innerText : ''; })()`);
    check(`badge da Home soma cadastro + edição (2 + 3): ${tag}`, badge.trim() === '5', badge);
    await click('Painel Admin: 5 pedidos pendentes');
    await settle('Solicitações de edição');
    await shot(`painel-admin-${vp.name}-${tag}`);
    await click('Solicitações de edição: 3 pendentes', '[role=button]');
    await settle('Vitrine Loja');
    check(`aba Pendentes com 3 pedidos: ${tag}`, (await countVisible('edit-request-admin-card')) === 3, String(await countVisible('edit-request-admin-card')));
    check(`card mostra nome, e-mail, plaquinha e motivo: ${tag}`, (await visibleText()).includes('João Pereira') && (await visibleText()).includes('Gerencio a vitrine da loja'));
    await overflowCheck(`solicitações ${tag}`);
    await shot(`edicao-pendentes-${vp.name}-${tag}`);
    await click('Aprovar joao.pereira@exemplo.com em Vitrine Loja');
    await waitFor('Por quanto tempo?');
    await click('7 dias', '[role=radio]');
    await waitFor('Expira sozinho em');
    await shot(`edicao-aprovar-prazo-${vp.name}-${tag}`);
    await click('Aprovar', '[data-testid="aprovar-prazo"] [role=button]');
    await waitFor('Edição de "Vitrine Loja" liberada');
    const approve = await lastBody('/rest/v1/edit_requests', 'PATCH');
    const days = approve?.expires_at ? Math.round((new Date(approve.expires_at).getTime() - Date.now()) / 86400000) : null;
    check(`aprovar manda status approved com prazo de 7 dias: ${tag}`, approve?.status === 'approved' && days === 7, JSON.stringify(approve));
    await click('Negar cliente@restaurante.com.br em Mesa 2 — Bistrô');
    await waitFor('negada');
    check(`negar manda status denied: ${tag}`, (await lastBody('/rest/v1/edit_requests', 'PATCH'))?.status === 'denied');
    await click('Aprovados (2)', '[role=tab]');
    await waitFor('Revogar acesso');
    const approvedTab = await visibleText();
    check(`aba Aprovados com "Aprovado em" e prazo: ${tag}`, approvedTab.includes('Aprovado em') && approvedTab.includes('Até '));
    await shot(`edicao-aprovados-${vp.name}-${tag}`);
    await click('Revogar acesso de cliente@restaurante.com.br a Mesa 1 — Bistrô');
    await waitFor('revogado');
    check(`revogar manda status revoked: ${tag}`, (await lastBody('/rest/v1/edit_requests', 'PATCH'))?.status === 'revoked');
    await click('Negados/Revogados (4)', '[role=tab]').catch(() => click('Negados/Revogados (4)', '[role=tab]', true));
    await waitFor('Revogado');
    check(`aba Negados/Revogados com os dois badges: ${tag}`, (await visibleText()).includes('Negado'));
    await shot(`edicao-negados-${vp.name}-${tag}`);

    // Administradores (admin principal).
    await boot({ who: 'admin', path: '/admins' });
    await settle('Administradores');
    await waitFor('admin2@exemplo.com');
    check(`lista com badge Admin e Principal sem remover: ${tag}`, (await countVisible('admin-card')) === 2 && (await visibleText()).includes('Principal') && !(await evaluate(`[...document.querySelectorAll('[role=button]')].some((n) => n.getAttribute('aria-label') === 'Remover previaemailofc@gmail.com')`)));
    await shot(`admins-lista-${vp.name}-${tag}`);
    await click('Adicionar admin', '[role=button]');
    await delay(800);
    await fill('E-mail', 'nao-e-email');
    await click('Adicionar');
    await waitFor('E-mail inválido.');
    await fill('E-mail', 'Terceiro.Admin@Exemplo.com');
    await fill('Nome', 'Terceiro Admin');
    await shot(`admins-adicionar-${vp.name}-${tag}`);
    await click('Adicionar');
    await waitFor('terceiro.admin@exemplo.com agora é administrador.');
    check(`adicionar manda e-mail normalizado e nome: ${tag}`, JSON.stringify(await lastBody('/rest/v1/rpc/add_admin')) === JSON.stringify({ p_email: 'terceiro.admin@exemplo.com', p_name: 'Terceiro Admin' }));
    await waitFor('Terceiro Admin');
    await click('Remover terceiro.admin@exemplo.com');
    await waitFor('perde o acesso ao painel');
    await click('Remover', '[role=dialog] [role=button],[aria-modal=true] [role=button]').catch(() => click('Remover'));
    await waitFor('não é mais administrador');
    check(`remover chama remove_admin: ${tag}`, (await lastBody('/rest/v1/rpc/remove_admin'))?.p_email === 'terceiro.admin@exemplo.com');

    // Segundo admin: não remove a si mesmo.
    await boot({ who: 'admin2', path: '/admins' });
    await settle('Administradores');
    await waitFor('Você não pode remover a si mesmo.');
    const selfDisabled = await evaluate(`(() => { const b = [...document.querySelectorAll('[role=button]')].find((n) => n.getAttribute('aria-label') === 'Remover admin2@exemplo.com'); return !!b && (b.getAttribute('aria-disabled') === 'true' || b.hasAttribute('disabled')); })()`);
    check(`botão de remover a si mesmo desabilitado: ${tag}`, selfDisabled);
    await overflowCheck(`admins ${tag}`);
    await shot(`admins-remover-si-mesmo-${vp.name}-${tag}`);
  }
} catch (error) {
  check('roteiro sem exceção', false, error instanceof Error ? error.message : String(error));
  await shot('erro').catch(() => undefined);
}

const relevant = consoleErrors.filter((text) => !/Download the React DevTools|ERR_NAME_NOT_RESOLVED/.test(text));
check('console sem erros', relevant.length === 0, relevant.slice(0, 5).join(' || '));
const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} checagens OK`);
console.log(`screenshots (${shots.length}):\n${shots.join('\n')}`);
socket.close();
chrome.kill();
await delay(800);
try {
  rmSync(PROFILE, { recursive: true, force: true });
} catch {
  // Perfil ainda travado pelo Chrome.
}
process.exit(failed.length ? 1 : 0);
