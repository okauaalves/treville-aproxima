// QA contra o Supabase REAL (EXPO_PUBLIC_* do .env, nunca impressos): sessão web simulada no navegador, leituras
// repassadas ao servidor real com a anon key (um JWT falso seria recusado) e escritas bloqueadas no navegador.
// Reproduz o estado real do remoto sem migrações: RPC is_admin 404 PGRST202 e admins [] sem erro.
// Modo `jwt401`: repassa o token simulado, e o servidor real responde 401 (sessão web inválida/expirada).
// Pré-requisito: `npx expo start --web --port 8099` com o .env real.
import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.QA_BASE ?? 'http://localhost:8099';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9344;
const OUT = join('screenshots', 'admin-fix2');
const PROFILE = join(tmpdir(), `treville-admin-real-${Date.now()}`);
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^EXPO_PUBLIC_SUPABASE_(URL|ANON_KEY)=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);
const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON) throw new Error('.env sem EXPO_PUBLIC_SUPABASE_URL/ANON_KEY');

const MOCK = `(() => {
  const HOST = new URL(${JSON.stringify(SUPABASE_URL)}).host;
  const REF = HOST.split('.')[0];
  const ANON = ${JSON.stringify(ANON)};
  const b64 = (value) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  const USERS = {
    admin: { id: '11111111-1111-4111-8111-111111111111', email: 'previaemailofc@gmail.com', user_metadata: { full_name: 'Admin Tréville' } },
    member: { id: '22222222-2222-4222-8222-222222222222', email: 'cliente@restaurante.com.br', user_metadata: { full_name: 'Carla Souza' } },
  };
  const who = localStorage.getItem('qa-user') || 'admin';
  const mode = localStorage.getItem('qa-mode') || 'anon';
  const user = { ...USERS[who], aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'google', providers: ['google'] }, email_confirmed_at: '2026-10-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z' };
  const token = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: now + 86400, iat: now, email: user.email }) + '.c2ln';
  const key = 'sb-' + REF + '-auth-token';
  const stored = JSON.parse(localStorage.getItem(key) || 'null');
  if (!stored || stored.user?.id !== user.id) {
    localStorage.setItem(key, JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 86400, expires_at: now + 86400, refresh_token: 'qa-refresh', user }));
  }
  window.__qaLog = [];
  const original = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, location.href);
    if (url.host !== HOST) return original(input, init);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/v1/user') return json(user);
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
    if (url.pathname.startsWith('/auth/v1/')) return json({});
    const readOnly = method === 'GET' || method === 'HEAD' || url.pathname.startsWith('/rest/v1/rpc/') || url.pathname === '/functions/v1/admin';
    if (!readOnly) return json({ message: 'QA: escrita bloqueada', code: '42501' }, 403);
    const headers = new Headers(init.headers || {});
    headers.set('apikey', ANON);
    if (mode !== 'jwt401') headers.set('Authorization', 'Bearer ' + ANON);
    const response = await original(url.href, { ...init, headers });
    const clone = response.clone();
    const body = await clone.text().catch(() => '');
    let code = null;
    try { code = JSON.parse(body)?.code ?? null; } catch {}
    window.__qaLog.push({ method, path: url.pathname, status: response.status, code, empty: body === '[]' || body === '' || body === 'null' });
    return response;
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
const log = () => evaluate('window.__qaLog || []');

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

async function scrollToAdmin() {
  await evaluate(`(() => { const n = document.querySelector('[data-testid="settings-painel-admin"]'); n && n.scrollIntoView({ block: 'center' }); return !!n; })()`);
  await delay(400);
}

const summarize = (entries, path) => {
  const hit = entries.filter((item) => item.path === path).at(-1);
  return hit ? `${hit.status}${hit.code ? ' ' + hit.code : ''}${hit.empty ? ' (vazio)' : ''}` : 'não chamado';
};

try {
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: MOCK });
  await cdp('Page.navigate', { url: `${BASE}/` });
  await delay(1000);

  // 1) Admin com respostas reais do remoto (RPC 404, admins vazio).
  await boot({ who: 'admin', mode: 'anon', path: '/settings' });
  await settle('Configurações');
  await settle('Administração', 30000).catch(() => undefined);
  const real = await log();
  console.log(`   remoto real: rpc/is_admin ${summarize(real, '/rest/v1/rpc/is_admin')}; rpc/my_access_status ${summarize(real, '/rest/v1/rpc/my_access_status')}`);
  check('admin (servidor real, sem migração) vê seção Administração + Painel Admin', (await countVisible('settings-painel-admin')) === 1 && (await visibleText()).includes('Administração'));
  check('seção Administração vem depois de Sobre', await evaluate(`(() => { const t = document.body.innerText; return t.indexOf('Sobre') > -1 && t.indexOf('Administração') > t.indexOf('Sobre'); })()`));
  await scrollToAdmin();
  await shot('01-configuracoes-admin-servidor-real');
  await evaluate(`(() => { const b = [...document.querySelectorAll('[role=button]')].find((n) => n.getAttribute('aria-label') === 'Painel Admin'); b && b.click(); return !!b; })()`);
  const panel = await settle('O servidor ainda não tem as tabelas de admin', 60000).catch((error) => String(error));
  check('painel abre em /admin com aviso de migração', panel.includes('Rode supabase db push.') && (await evaluate('location.pathname')) === '/admin');
  console.log(`   remoto real: functions/v1/admin ${summarize(await log(), '/functions/v1/admin')}`);
  await shot('02-painel-admin-servidor-real');

  // 2) Mesmo admin, mas o servidor recusa o JWT (401): antes do fix escondia a linha.
  await boot({ who: 'admin', mode: 'jwt401', path: '/settings' });
  await settle('Configurações');
  await settle('Administração', 30000).catch(() => undefined);
  console.log(`   remoto real com JWT recusado: rpc/is_admin ${summarize(await log(), '/rest/v1/rpc/is_admin')}`);
  check('admin com JWT recusado (401) ainda vê Painel Admin', (await countVisible('settings-painel-admin')) === 1);
  await scrollToAdmin();
  await shot('03-configuracoes-admin-jwt-401');

  // 3) Usuário comum contra o servidor real: sem a seção.
  await boot({ who: 'member', mode: 'anon', path: '/settings' });
  await settle('Configurações');
  await delay(3000);
  check('usuário comum não vê Administração', (await countVisible('settings-painel-admin')) === 0 && !(await visibleText()).includes('Administração'));
  await shot('04-configuracoes-comum-servidor-real');

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
