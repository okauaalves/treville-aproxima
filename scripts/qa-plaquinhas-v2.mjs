// QA visual: criar plaquinha em 4 passos, estatísticas e paginação. Usa um projeto Supabase fictício (QA_MOCK_REF)
// respondido por um fetch simulado injetado na página; nada toca o Supabase real.
// Pré-requisito: `npx expo start --web --port 8090` com EXPO_PUBLIC_SUPABASE_URL=https://qamockproj0123.supabase.co.
import { Buffer } from 'node:buffer';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.QA_BASE ?? 'http://localhost:8090';
const SHORT_LINK_BASE = (process.env.EXPO_PUBLIC_SHORT_LINK_BASE ?? 'https://nfc-manager.expo.app').replace(/\/+$/, '');
const PROFILE_PAGE_BASE = `${SHORT_LINK_BASE}/p`;
const MOCK_REF = process.env.QA_MOCK_REF ?? 'qamockproj0123';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9337;
const OUT = join('screenshots', 'plaquinhas-v2');
const PROFILE = join(tmpdir(), `treville-plaquinhas-v2-${Date.now()}`);
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'phone', width: 393, height: 852 },
  { name: 'bigtablet', width: 1024, height: 1366 },
];

const MOCK = `(() => {
  const REF = ${JSON.stringify(MOCK_REF)};
  const HOST = REF + '.supabase.co';
  const b64 = (value) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'luiz@exemplo.com', user_metadata: { full_name: 'Luiz Teste' }, app_metadata: { provider: 'email' }, created_at: '2026-10-01T00:00:00Z' };
  const token = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: now + 86400, iat: now, email: user.email }) + '.c2ln';
  if (!localStorage.getItem('sb-' + REF + '-auth-token')) {
    localStorage.setItem('sb-' + REF + '-auth-token', JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 86400, expires_at: now + 86400, refresh_token: 'qa-refresh', user }));
  }
  const day = 86400000;
  const iso = (ms) => new Date(ms).toISOString();
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seed = () => {
    const t = Date.now();
    const links = [{ id: 'K7M2QX', name: 'Cardápio', destination_url: 'https://treville.com.br/cardapio', destination_type: 'url', scan_count: 49, created_at: iso(t - 3 * 60000) }];
    for (let n = 0; n < 25; n += 1) {
      links.push({ id: 'PG' + ALPHABET[n] + ALPHABET[(n * 7) % 32] + 'Q2', name: 'Mesa ' + (n + 1), destination_url: 'https://wa.me/551199999' + String(1000 + n), destination_type: 'whatsapp', scan_count: n, created_at: iso(t - (n + 1) * day) });
    }
    const rows = links.map((link) => ({ user_id: user.id, is_active: true, nfc_synced: false, qr_synced: true, updated_at: link.created_at, profile_enabled: false, webhook_url: null, ...link }));
    const perDay = [3, 7, 4, 9, 6, 12, 8];
    const logs = [];
    perDay.forEach((count, index) => {
      for (let n = 0; n < count; n += 1) logs.push({ id: 'log-' + index + '-' + n, link_id: 'K7M2QX', scanned_at: iso(t - (6 - index) * day - n * 600000 - 60000), scan_type: n % 3 === 0 ? 'nfc' : 'qr' });
    });
    return { links: rows, logs, profileLinks: [] };
  };
  const load = () => {
    const raw = localStorage.getItem('qa-db');
    if (raw) return JSON.parse(raw);
    const db = seed();
    localStorage.setItem('qa-db', JSON.stringify(db));
    return db;
  };
  const save = (db) => localStorage.setItem('qa-db', JSON.stringify(db));
  window.__qaRequests = [];
  const original = window.fetch.bind(window);
  const strip = (value) => (value || '').replace(/^(eq|gte)\\./, '');
  const applyFilters = (rows, params) => {
    let out = rows;
    for (const [key, raw] of params.entries()) {
      if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
      if (raw.startsWith('eq.')) out = out.filter((row) => String(row[key]) === strip(raw));
      if (raw.startsWith('gte.')) out = out.filter((row) => String(row[key]) >= strip(raw));
    }
    const order = params.get('order');
    if (order) {
      const parts = order.split(',').map((part) => part.split('.'));
      out = [...out].sort((a, b) => {
        for (const [field, dir] of parts) {
          if (a[field] === b[field]) continue;
          const sign = a[field] > b[field] ? 1 : -1;
          return dir === 'desc' ? -sign : sign;
        }
        return 0;
      });
    }
    return out;
  };
  window.fetch = async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, location.href);
    if (url.host !== HOST) return original(input, init);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const body = typeof init.body === 'string' ? init.body : null;
    window.__qaRequests.push({ method, path: url.pathname, query: url.search, body });
    const json = (value, status = 200, extra = {}) => new Response(method === 'HEAD' ? null : JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...extra } });
    if (url.pathname === '/auth/v1/user') return json(user);
    if (url.pathname.startsWith('/auth/v1/')) return json({});
    const db = load();
    const table = url.pathname.replace('/rest/v1/', '');
    const source = table === 'redirect_links' ? db.links : table === 'scan_logs' ? db.logs : table === 'profile_links' ? db.profileLinks : null;
    if (source && (method === 'GET' || method === 'HEAD')) {
      const all = applyFilters(source, url.searchParams);
      const offset = Number(url.searchParams.get('offset') || 0);
      if (table === 'redirect_links' && offset > 0) await new Promise((resolve) => setTimeout(resolve, 1200));
      const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : all.length;
      const rows = all.slice(offset, offset + limit);
      const wantsCount = (headers.get('prefer') || '').includes('count=exact');
      const extra = wantsCount ? { 'content-range': (rows.length ? offset + '-' + (offset + rows.length - 1) : '*') + '/' + all.length } : {};
      if ((headers.get('accept') || '').includes('vnd.pgrst.object')) return rows[0] ? json(rows[0]) : json({ code: 'PGRST116', message: 'no rows' }, 406);
      return json(rows, 200, extra);
    }
    if (table === 'redirect_links' && method === 'POST') {
      const row = JSON.parse(body || '{}');
      if (db.links.some((item) => item.id === row.id)) return json({ code: '23505', message: 'duplicate key' }, 409);
      const t = new Date().toISOString();
      db.links.unshift({ is_active: true, scan_count: 0, nfc_synced: false, qr_synced: true, profile_enabled: false, webhook_url: null, created_at: t, updated_at: t, ...row });
      save(db);
      return new Response(null, { status: 201 });
    }
    if (table === 'redirect_links' && method === 'PATCH') {
      const patch = JSON.parse(body || '{}');
      db.links = db.links.map((row) => (row.id === strip(url.searchParams.get('id')) ? { ...row, ...patch } : row));
      save(db);
      return new Response(null, { status: 204 });
    }
    if (table === 'profiles') return (headers.get('accept') || '').includes('vnd.pgrst.object') ? json({ code: 'PGRST116', message: 'no rows' }, 406) : json([]);
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
const lastRequest = async (predicate) => (await requests()).filter(predicate).at(-1);
const testIdText = (testId) => evaluate(`(() => [...document.querySelectorAll('[data-testid="${testId}"]')].filter(${VISIBLE}).map((n) => n.innerText).join(' | '))()`);
const statsButtons = () => evaluate(`[...document.querySelectorAll('[aria-label^="Ver stats de"]')].length`);

async function reachTabs() {
  const start = Date.now();
  while (Date.now() - start < 120000) {
    const hasTab = await evaluate(`[...document.querySelectorAll('[role=tab]')].filter(${VISIBLE}).some((n) => n.getAttribute('aria-label') === 'Plaquinhas')`);
    if (hasTab) return;
    const body = await visibleText();
    if (body.includes('Antes de começar')) await click('Entendi, continuar').catch(() => undefined);
    await delay(400);
  }
  throw new Error(`abas não apareceram. Tela: ${String(await visibleText()).slice(0, 300)}`);
}

async function boot(reset) {
  if (reset) await evaluate(`localStorage.removeItem('qa-db'); localStorage.setItem('onboarding_done', 'true'); true`);
  await cdp('Page.navigate', { url: `${BASE}/` });
  await delay(1000);
  await reachTabs();
  await click('Plaquinhas', '[role=tab]');
}

/** Rola a lista até o fim (dispara onEndReached). */
async function scrollListToEnd() {
  await evaluate(`(() => { for (const n of document.querySelectorAll('div')) { if (/(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 4 && n.checkVisibility()) n.scrollTop = n.scrollHeight; } })()`);
  await delay(250);
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
    await boot(true);
    await waitFor('Cardápio');

    // Paginação: 20 na primeira página, 26 depois de rolar.
    const firstPage = await lastRequest((item) => item.path === '/rest/v1/redirect_links' && item.method === 'GET' && item.query.includes('offset=0'));
    check(`primeira página pede offset=0&limit=20 do usuário da sessão: ${tag}`, firstPage && firstPage.query.includes('limit=20') && firstPage.query.includes('user_id=eq.11111111-1111-4111-8111-111111111111'), firstPage?.query);
    check(`mostra 20 cards na primeira página: ${tag}`, (await statsButtons()) === 20, String(await statsButtons()));
    await shot(`lista-${vp.name}-${tag}`);
    let sawSkeleton = false;
    for (let attempt = 0; attempt < 30 && (await statsButtons()) < 26; attempt += 1) {
      await scrollListToEnd();
      if (!sawSkeleton && (await evaluate(`Boolean(document.querySelector('[data-testid="plaquinhas-loading-more"]'))`))) {
        sawSkeleton = true;
        await scrollListToEnd();
        await shot(`lista-carregando-mais-${vp.name}-${tag}`);
      }
    }
    check(`skeleton enquanto carrega a próxima página: ${tag}`, sawSkeleton);
    check(`carregou a segunda página ao rolar: ${tag}`, (await statsButtons()) === 26, String(await statsButtons()));
    const secondPage = await lastRequest((item) => item.path === '/rest/v1/redirect_links' && item.query.includes('offset=20'));
    check(`segunda página pede offset=20: ${tag}`, Boolean(secondPage), secondPage?.query);
    await waitFor('26 plaquinhas');
    await shot(`lista-fim-${vp.name}-${tag}`);
    // Estatísticas
    await boot(false);
    await waitFor('Cardápio');
    await click('Ver stats de Cardápio', '[role=button],button,a,[role=link]', true);
    await waitFor('Últimos 7 dias');
    await waitFor('Últimos scans');
    const qr = await testIdText('stat-qr');
    const nfc = await testIdText('stat-nfc');
    const total = await testIdText('stat-total');
    const last = await testIdText('stat-ultimo');
    check(`cards: total 49, QR 31, NFC 18: ${tag}`, total.includes('49') && qr.includes('31') && nfc.includes('18'), `${total} / ${qr} / ${nfc}`);
    check(`último scan em pt-BR: ${tag}`, /\d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/.test(last), last);
    const recent = await evaluate(`(() => [...document.querySelectorAll('[data-testid="ultimos-scans"] [aria-label]')].filter(${VISIBLE}).length)()`);
    check(`lista com os últimos 10 scans: ${tag}`, recent === 10, String(recent));
    const chart = await evaluate(`Boolean([...document.querySelectorAll('[data-testid="grafico-7-dias"]')].find(${VISIBLE}))`);
    check(`gráfico de 7 dias QR/NFC visível: ${tag}`, chart);
    await overflowCheck(`estatísticas ${tag}`);
    await shot(`stats-${vp.name}-${tag}`);

    // Criar em 4 passos: Cardápio com http:// (aviso, sem reescrever)
    await boot(false);
    await waitFor('Cardápio');
    await click('Criar plaquinha');
    await waitFor('Passo 1');
    await delay(500);
    await shot(`criar-1-nome-${vp.name}-${tag}`);
    await click('Usar o nome Mesa 5');
    await click('Próximo');
    await waitFor('Perfil completo');
    await delay(400);
    await shot(`criar-2-tipo-${vp.name}-${tag}`);
    await click('Cardápio', '[role=radio]');
    await click('Próximo');
    await fill('Link do cardápio', 'http://restaurante.com.br/menu');
    await waitFor('Esse link usa http://');
    await shot(`criar-3-form-${vp.name}-${tag}`);
    await click('Próximo');
    await waitFor('Criar apenas QR');
    const fullUrl = await testIdText('url-completa');
    check(`passo 4 mostra a URL completa da plaquinha: ${tag}`, /\/functions\/v1\/redirect\/[A-Z0-9]{6}/.test(fullUrl), fullUrl);
    await overflowCheck(`passo 4 ${tag}`);
    await shot(`criar-4-preview-${vp.name}-${tag}`);
    await click('Criar apenas QR');
    await delay(1500);
    const created = await lastRequest((item) => item.method === 'POST' && item.path === '/rest/v1/redirect_links');
    const createdBody = created ? JSON.parse(created.body) : {};
    check(
      `criou Cardápio com http:// mantido e usuário da sessão: ${tag}`,
      createdBody.name === 'Mesa 5' && createdBody.destination_type === 'menu' && createdBody.destination_url === 'http://restaurante.com.br/menu' && createdBody.user_id === '11111111-1111-4111-8111-111111111111',
      created?.body,
    );
    const afterCreate = await evaluate('location.pathname');
    check(`foi para a tela do QR: ${tag}`, afterCreate === `/plaquinha/qr/${createdBody.id}`, afterCreate);
    await shot(`criar-fim-qr-${vp.name}-${tag}`);

    // Perfil completo: profile_enabled e tela de links
    await boot(false);
    await waitFor('Cardápio');
    await click('Criar plaquinha');
    await waitFor('Passo 1');
    await fill('Nome da plaquinha', 'Cartão de visita');
    await click('Próximo');
    await click('Perfil completo', '[role=radio]');
    await click('Próximo');
    await delay(400);
    await shot(`criar-perfil-3-${vp.name}-${tag}`);
    await click('Próximo');
    await waitFor('Criar apenas QR');
    await click('Criar apenas QR');
    await delay(1500);
    const profile = await lastRequest((item) => item.method === 'POST' && item.path === '/rest/v1/redirect_links');
    const profileBody = profile ? JSON.parse(profile.body) : {};
    check(
      `Perfil completo: profile_enabled e destino = página: ${tag}`,
      profileBody.profile_enabled === true && profileBody.destination_type === 'profile' && profileBody.destination_url === `${PROFILE_PAGE_BASE}/${profileBody.id}`,
      profile?.body,
    );
    const afterProfile = await evaluate('location.pathname');
    check(`foi para a tela de links: ${tag}`, afterProfile === `/perfil/links/${profileBody.id}`, afterProfile);
    await shot(`criar-perfil-links-${vp.name}-${tag}`);

    // javascript: bloqueado no passo 3
    await boot(false);
    await waitFor('Cardápio');
    await click('Criar plaquinha');
    await fill('Nome da plaquinha', 'Teste');
    await click('Próximo');
    await click('Link (URL)', '[role=radio]');
    await click('Próximo');
    await fill('Link', 'javascript:alert(1)');
    await click('Próximo');
    await delay(500);
    const stillStep3 = !(await visibleText()).includes('Criar apenas QR');
    check(`URL javascript: não passa do passo 3: ${tag}`, stillStep3);
    await shot(`criar-url-bloqueada-${vp.name}-${tag}`);
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
