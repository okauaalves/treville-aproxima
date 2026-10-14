// QA visual: linha "Painel Admin" em Configurações (admin x comum) e aviso de migração ausente no painel.
// Supabase fictício (QA_MOCK_REF) respondido por um fetch simulado injetado na página; nada toca o projeto real.
// Pré-requisito: `npx expo start --web --port 8099` com EXPO_PUBLIC_SUPABASE_URL=https://qamockproj0123.supabase.co.
// Modos do servidor (localStorage qa-mode): ok = migrações aplicadas; missing = RPCs/tabelas de admin ausentes (PGRST202/PGRST205).
import { Buffer } from 'node:buffer';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.QA_BASE ?? 'http://localhost:8099';
const MOCK_REF = process.env.QA_MOCK_REF ?? 'qamockproj0123';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9343;
const OUT = join('screenshots', 'admin-fix');
const PROFILE = join(tmpdir(), `treville-admin-fix-${Date.now()}`);
mkdirSync(OUT, { recursive: true });

const MOCK = `(() => {
  const REF = ${JSON.stringify(MOCK_REF)};
  const HOST = REF + '.supabase.co';
  const PRIMARY = 'previaemailofc@gmail.com';
  const b64 = (value) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  const USERS = {
    admin: { id: '11111111-1111-4111-8111-111111111111', email: 'PreviaEmailOfc@gmail.com ', user_metadata: { full_name: 'Admin Tréville' } },
    member: { id: '22222222-2222-4222-8222-222222222222', email: 'cliente@restaurante.com.br', user_metadata: { full_name: 'Carla Souza' } },
  };
  const who = localStorage.getItem('qa-user') || 'admin';
  const mode = localStorage.getItem('qa-mode') || 'ok';
  const user = { ...USERS[who], aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, email_confirmed_at: '2026-10-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z' };
  const token = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: now + 86400, iat: now, email: user.email }) + '.c2ln';
  const key = 'sb-' + REF + '-auth-token';
  const stored = JSON.parse(localStorage.getItem(key) || 'null');
  if (!stored || stored.user?.id !== user.id) {
    localStorage.setItem(key, JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 86400, expires_at: now + 86400, refresh_token: 'qa-refresh', user }));
  }
  const isAdmin = user.email.trim().toLowerCase() === PRIMARY;
  window.__qaRequests = [];
  const original = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, location.href);
    if (url.host !== HOST) return original(input, init);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    window.__qaRequests.push({ method, path: url.pathname });
    const json = (value, status = 200, extra = {}) => new Response(method === 'HEAD' ? null : JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...extra } });
    const noFn = (name) => json({ code: 'PGRST202', details: 'Searched for the function public.' + name, hint: null, message: 'Could not find the function public.' + name + ' without parameters in the schema cache' }, 404);
    const noTable = (name) => json({ code: 'PGRST205', details: null, hint: null, message: "Could not find the table 'public." + name + "' in the schema cache" }, 404);
    if (url.pathname === '/auth/v1/user') return json(user);
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
    if (url.pathname.startsWith('/auth/v1/')) return json({});
    if (mode === 'missing') {
      if (url.pathname.startsWith('/rest/v1/rpc/')) return noFn(url.pathname.split('/').pop());
      for (const table of ['user_access', 'edit_requests', 'operations', 'templates']) if (url.pathname === '/rest/v1/' + table) return noTable(table);
      if (url.pathname === '/rest/v1/admins') return json(null, 200);
      if (url.pathname === '/functions/v1/admin') return json({ code: 'NOT_FOUND', message: 'Requested function was not found' }, 404);
    } else {
      if (url.pathname === '/rest/v1/rpc/my_access_status') return json(isAdmin ? 'admin' : 'approved');
      if (url.pathname === '/rest/v1/rpc/is_admin') return json(isAdmin);
      if (url.pathname === '/rest/v1/user_access') return json([], 200, { 'content-range': '*/' + (isAdmin ? 2 : 0) });
      if (url.pathname === '/rest/v1/edit_requests') return json([], 200, { 'content-range': '*/' + (isAdmin ? 1 : 0) });
      if (url.pathname === '/functions/v1/admin') {
        if (!isAdmin) return json({ error: 'Sem permissão.' }, 403);
        return json({ totalUsers: 9, activeUsers7d: 4, totalOperations: 128, totalTemplates: 6, users: [], operationsByType: [{ contentType: 'URL', count: 80 }], recentOperations: [], topTemplates: [], usage: null });
      }
    }
    if (url.pathname === '/rest/v1/profiles') return json({ id: user.id, full_name: user.user_metadata.full_name, display_name: null, avatar_url: null, theme_color: null }, 200);
    return json([], 200, { 'content-range': '*/0' });
  };
})();`;

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=420,900', 'about:blank'], { stdio: 'ignore' });

const results = [];
const consoleErrors = [];

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
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
}

const VISIBLE = `(node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && node.checkVisibility({ visibilityProperty: true, opacityProperty: true }); }`;
const visibleText = () => evaluate(`(() => { const v = ${VISIBLE}; return [...document.querySelectorAll('div[dir=auto],span,[role=header],[role=heading],h1,h2,h3')].filter(v).map((n) => n.innerText).join('\\n'); })()`);
const countVisible = (testId) => evaluate(`[...document.querySelectorAll('[data-testid="${testId}"]')].filter(${VISIBLE}).length`);

async function settle(text, timeout = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const body = await visibleText();
    if (body.includes('Antes de começar')) {
      await evaluate(`(() => { const b = [...document.querySelectorAll('[role=button]')].find((n) => (n.innerText || '').includes('Entendi, continuar')); b && b.click(); return true; })()`);
    }
    if (body.includes(text)) return body;
    await delay(400);
  }
  throw new Error(`tela não chegou em "${text}". Tela: ${String(await visibleText()).slice(0, 300)}`);
}

async function boot({ who, mode, path }) {
  await evaluate(`(() => {
    localStorage.setItem('onboarding_done', 'true');
    localStorage.setItem('qa-user', ${JSON.stringify(who)});
    localStorage.setItem('qa-mode', ${JSON.stringify(mode)});
    for (const key of Object.keys(localStorage)) if (key.startsWith('sb-') || key.startsWith('treville.access.')) localStorage.removeItem(key);
    return true;
  })()`);
  await cdp('Page.navigate', { url: `${BASE}${path}` });
  await delay(1500);
}

async function scrollTop() {
  await evaluate(`(() => { document.querySelectorAll('*').forEach((n) => { if (n.scrollTop) n.scrollTop = 0; }); return true; })()`);
  await delay(300);
}

try {
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: MOCK });
  await cdp('Page.navigate', { url: `${BASE}/` });
  await delay(1000);

  // 1) Admin, servidor com migrações: linha com badge (2 acessos + 1 edição).
  await boot({ who: 'admin', mode: 'ok', path: '/settings' });
  await settle('Configurações');
  await settle('Painel Admin', 30000).catch(() => undefined);
  check('admin vê "Painel Admin" em Configurações', (await countVisible('settings-painel-admin')) === 1);
  check('linha com badge de 3 pendentes', await evaluate(`!!document.querySelector('[aria-label="Painel Admin: 3 pendentes"]')`));
  await shot('01-configuracoes-admin');

  // 2) Usuário comum: sem a linha.
  await boot({ who: 'member', mode: 'ok', path: '/settings' });
  await settle('Configurações');
  await delay(2500);
  check('usuário comum não vê "Painel Admin"', (await countVisible('settings-painel-admin')) === 0 && !(await visibleText()).includes('Painel Admin'));
  await shot('02-configuracoes-comum');

  // 3) Admin sem migrações: linha aparece pelo fallback de e-mail e o painel abre com aviso.
  await boot({ who: 'admin', mode: 'missing', path: '/settings' });
  await settle('Configurações');
  await settle('Painel Admin', 30000).catch(() => undefined);
  check('sem migração: admin ainda vê "Painel Admin"', (await countVisible('settings-painel-admin')) === 1);
  await shot('03-configuracoes-admin-sem-migracao');
  await evaluate(`(() => { const b = [...document.querySelectorAll('[role=button]')].find((n) => n.getAttribute('aria-label') === 'Painel Admin'); b && b.click(); return !!b; })()`);
  const panel = await settle('O servidor ainda não tem as tabelas de admin', 60000).catch((error) => String(error));
  check('painel abre com o aviso de migração ausente', panel.includes('Rode supabase db push.') && (await countVisible('admin-aviso-migracao')) === 1);
  check('URL do painel é /admin', (await evaluate('location.pathname')) === '/admin');
  await scrollTop();
  await shot('04-painel-aviso-migracao');

  // 4) Comum sem migrações: /admin redireciona para a Home.
  await boot({ who: 'member', mode: 'missing', path: '/admin' });
  await delay(5000);
  const path = await evaluate('location.pathname');
  check('comum em /admin é redirecionado', path !== '/admin' && !(await visibleText()).includes('Painel Admin'), path);
  await shot('05-comum-redirecionado');

  check('sem exceções no console', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (error) {
  check('execução do QA', false, error instanceof Error ? error.message : String(error));
} finally {
  socket.close();
  chrome.kill();
  await delay(500);
  rmSync(PROFILE, { recursive: true, force: true });
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} OK`);
process.exit(failed.length ? 1 : 0);
