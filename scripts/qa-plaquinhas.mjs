// QA visual das plaquinhas. Usa um projeto Supabase fictício (QA_MOCK_REF) cujas chamadas
// são respondidas por um fetch simulado injetado na página; nada toca o Supabase real.
// Modo local (sem conta): QA_LOCAL_BASE aponta para um servidor sem Supabase configurado.
import { Buffer } from 'node:buffer';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.QA_BASE ?? 'http://localhost:8090';
const LOCAL_BASE = process.env.QA_LOCAL_BASE ?? '';
const MOCK_REF = process.env.QA_MOCK_REF ?? 'qamockproj0123';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join('screenshots', 'plaquinhas');
const PROFILE = join(tmpdir(), `treville-plaquinhas-${Date.now()}`);
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
  const seed = () => {
    const t = Date.now();
    const links = [
      { id: 'K7M2QX', user_id: user.id, name: 'Cardápio', destination_url: 'https://treville.com.br/cardapio', destination_type: 'url', is_active: true, scan_count: 128, nfc_synced: true, qr_synced: true, created_at: iso(t - 3 * day), updated_at: iso(t - day) },
      { id: 'P4TZ9A', user_id: user.id, name: 'Mesa 5', destination_url: 'https://wa.me/5511999998888?text=Ol%C3%A1', destination_type: 'whatsapp', is_active: true, scan_count: 37, nfc_synced: false, qr_synced: true, created_at: iso(t - 5 * day), updated_at: iso(t - 5 * day) },
      { id: 'H8RW3N', user_id: user.id, name: 'Portfólio', destination_url: 'https://instagram.com/treville', destination_type: 'instagram', is_active: false, scan_count: 5, nfc_synced: false, qr_synced: true, created_at: iso(t - 9 * day), updated_at: iso(t - 2 * day) },
    ];
    const perDay = [3, 7, 4, 9, 6, 12, 8];
    const logs = [];
    perDay.forEach((count, index) => {
      for (let n = 0; n < count; n += 1) logs.push({ id: 'log-' + index + '-' + n, link_id: 'K7M2QX', scanned_at: iso(t - (6 - index) * day - n * 600000), scan_type: n % 3 === 0 ? 'nfc' : 'qr' });
    });
    return { links, logs: logs.reverse() };
  };
  const load = () => {
    const mode = localStorage.getItem('qa-mode') || 'empty';
    const raw = localStorage.getItem('qa-db');
    if (raw) return JSON.parse(raw);
    const db = mode === 'data' ? seed() : { links: [], logs: [] };
    localStorage.setItem('qa-db', JSON.stringify(db));
    return db;
  };
  const save = (db) => localStorage.setItem('qa-db', JSON.stringify(db));
  window.__qaRequests = [];
  const original = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, location.href);
    if (url.host !== HOST) return original(input, init);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const body = typeof init.body === 'string' ? init.body : null;
    window.__qaRequests.push({ method, path: url.pathname, query: url.search, body });
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/v1/user') return json(user);
    if (url.pathname.startsWith('/auth/v1/')) return json({});
    const db = load();
    const eq = (field) => (url.searchParams.get(field) || '').replace(/^eq\\./, '');
    if (url.pathname === '/rest/v1/redirect_links') {
      if (method === 'GET' || method === 'HEAD') {
        let rows = db.links;
        if (url.searchParams.get('id')) rows = rows.filter((row) => row.id === eq('id'));
        if (url.searchParams.get('user_id')) rows = rows.filter((row) => row.user_id === eq('user_id'));
        if ((headers.get('accept') || '').includes('vnd.pgrst.object')) return rows[0] ? json(rows[0]) : json({ code: 'PGRST116', message: 'no rows' }, 406);
        return json(rows);
      }
      if (method === 'POST') {
        const row = JSON.parse(body || '{}');
        if (db.links.some((item) => item.id === row.id)) return json({ code: '23505', message: 'duplicate key' }, 409);
        const t = new Date().toISOString();
        db.links.unshift({ is_active: true, scan_count: 0, nfc_synced: false, qr_synced: true, created_at: t, updated_at: t, ...row });
        save(db);
        return new Response(null, { status: 201 });
      }
      if (method === 'PATCH') {
        const patch = JSON.parse(body || '{}');
        db.links = db.links.map((row) => (row.id === eq('id') ? { ...row, ...patch } : row));
        save(db);
        return new Response(null, { status: 204 });
      }
    }
    if (url.pathname === '/rest/v1/scan_logs') return json(db.logs.filter((row) => row.link_id === eq('link_id')));
    return json([]);
  };
})();`;

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9335', `--user-data-dir=${PROFILE}`, '--window-size=1280,1366', 'about:blank'], { stdio: 'ignore' });

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
      const list = await fetch('http://127.0.0.1:9335/json/list').then((response) => response.json());
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

async function click(label, roles = '[role=button],button,a,[role=link],[role=tab],[role=radio],[role=switch]') {
  const found = await evaluate(`(() => {
    const want = ${JSON.stringify(label)};
    const norm = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const node = [...document.querySelectorAll(${JSON.stringify(roles)})]
      .filter(${VISIBLE})
      .filter((item) => norm(item.getAttribute('aria-label')) === want || norm(item.innerText) === want).at(-1);
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
    const input = [...document.querySelectorAll('input,textarea')].find((item) => {
      const r = item.getBoundingClientRect();
      if (!r.width || !item.checkVisibility({ visibilityProperty: true })) return false;
      const first = item.parentElement?.parentElement?.firstElementChild;
      return first && first !== item.parentElement && (first.innerText || '').trim() === ${JSON.stringify(label)};
    });
    if (!input) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
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

async function scrollAllToBottom() {
  await evaluate(`(() => { for (const n of document.querySelectorAll('div')) { if (/(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 4 && n.checkVisibility()) n.scrollTop = n.scrollHeight; } })()`);
  await delay(400);
}

async function waitGone(text, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout && (await visibleText()).includes(text)) await delay(200);
  await delay(300);
}

const requests = () => evaluate('window.__qaRequests || []');

/** Passa pelo onboarding (e cadastro local, se pedir) até as abas aparecerem. */
async function reachTabs() {
  const start = Date.now();
  while (Date.now() - start < 120000) {
    const hasTab = await evaluate(`[...document.querySelectorAll('[role=tab]')].filter(${VISIBLE}).some((n) => n.getAttribute('aria-label') === 'Plaquinhas')`);
    if (hasTab) return;
    const body = await visibleText();
    if (body.includes('Antes de começar')) {
      await click('Entendi, continuar').catch(() => undefined);
    } else if (body.includes('Esqueci')) {
      await click('Criar conta');
      await waitFor('Nome completo');
      await fill('Nome completo', 'Luiz Teste');
      await fill('E-mail', 'luiz@exemplo.com');
      await fill('Senha', '123456');
      await fill('Confirmar senha', '123456');
      await click('Criar conta');
    }
    await delay(400);
  }
  throw new Error(`abas não apareceram. Tela: ${String(await visibleText()).slice(0, 300)}`);
}

async function boot(mode) {
  await evaluate(`localStorage.setItem('qa-mode', ${JSON.stringify(mode)}); localStorage.removeItem('qa-db'); true`);
  await cdp('Page.navigate', { url: `${BASE}/` });
  await delay(1000);
  await reachTabs();
  await click('Plaquinhas', '[role=tab]');
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

    // Vazio
    await boot('empty');
    await waitFor('Nenhuma plaquinha ainda');
    await waitFor('Crie uma plaquinha para ter um QR Code e tag NFC com destino que você pode mudar quando quiser.');
    check(`aba entre Templates e Ajustes: ${tag}`, await evaluate(`(() => { const t = [...document.querySelectorAll('[role=tab]')].filter(${VISIBLE}).map((n) => n.getAttribute('aria-label')); const i = t.indexOf('Plaquinhas'); return t[i - 1] === 'Templates' && t[i + 1] === 'Ajustes'; })()`));
    await overflowCheck(`vazio ${tag}`);
    await shot(`vazio-${vp.name}-${tag}`);

    // Criar: passo 1..3
    await click('Criar primeira plaquinha');
    await waitFor('Passo 1 de 3');
    await fill('Nome da plaquinha', 'Cardápio do almoço');
    await shot(`criar-passo1-${vp.name}-${tag}`);
    await click('Próximo');
    await waitFor('Passo 2 de 3');
    await fill('Link', 'javascript:alert(1)');
    await click('Próximo');
    await delay(300);
    check(`destino javascript: bloqueado no app: ${tag}`, (await visibleText()).includes('Passo 2 de 3'));
    await fill('Link', 'treville.com.br/almoco');
    await shot(`criar-passo2-${vp.name}-${tag}`);
    await click('Próximo');
    await waitFor('Passo 3 de 3');
    await waitFor(`${MOCK_REF}.supabase.co/…/`);
    check(`preview sem domínio fictício: ${tag}`, !(await visibleText()).includes('aproxima.app'));
    await shot(`criar-passo3-${vp.name}-${tag}`);
    await click('Criar plaquinha');
    await waitFor('Destino atual');
    const created = (await requests()).find((item) => item.method === 'POST' && item.path === '/rest/v1/redirect_links');
    const createdBody = created ? JSON.parse(created.body) : null;
    check(`criou com user da sessão e destino https: ${tag}`, createdBody && createdBody.user_id === '11111111-1111-4111-8111-111111111111' && createdBody.destination_url === 'https://treville.com.br/almoco' && /^[A-HJ-NP-Z2-9]{6}$/.test(createdBody.id), JSON.stringify(createdBody));
    await waitFor('NFC não gravado');
    await overflowCheck(`qr recém-criada ${tag}`);
    await shot(`qr-nova-${vp.name}-${tag}`);

    // Com dados
    await boot('data');
    await waitFor('Mesa 5');
    await waitFor('128 scans · QR + NFC');
    await waitFor('Só QR');
    await waitFor('Inativa');
    await overflowCheck(`lista ${tag}`);
    await shot(`lista-${vp.name}-${tag}`);

    // Toggle
    await click('Ativar Portfólio');
    await waitFor('Plaquinha ativada.');
    const patch = (await requests()).find((item) => item.method === 'PATCH' && item.query.includes('H8RW3N'));
    check(`toggle envia is_active: ${tag}`, patch && JSON.parse(patch.body).is_active === true, patch?.body);

    // Editar destino
    const editButtons = await evaluate(`[...document.querySelectorAll('[aria-label="Editar"]')].filter(${VISIBLE}).length`);
    check(`botões de ação por card: ${tag}`, editButtons === 3, String(editButtons));
    await evaluate(`[...document.querySelectorAll('[aria-label="Editar"]')].filter(${VISIBLE})[1].click()`);
    await waitFor('Mudar destino');
    await waitFor('O QR Code e a tag continuam iguais.');
    await delay(1200);
    const sheet = await evaluate(`(() => { const n = [...document.querySelectorAll('[data-testid="editar-destino"]')].at(-1); if (!n) return null; const r = n.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight }; })()`);
    check(`folha de edição visível: ${tag}`, sheet && sheet.top >= 0 && sheet.bottom <= sheet.h + 1, JSON.stringify(sheet));
    await shot(`editar-${vp.name}-${tag}`);
    await fill('Número', '11988887777');
    await click('Salvar');
    await waitFor('Destino atualizado! Todos os scans já vão pro novo destino.');
    const edit = (await requests()).filter((item) => item.method === 'PATCH' && item.query.includes('P4TZ9A')).at(-1);
    const editBody = edit ? JSON.parse(edit.body) : {};
    check(`editar só troca destino (sem nfc_synced): ${tag}`, editBody.destination_url?.startsWith('https://wa.me/5511988887777') && !('nfc_synced' in editBody) && !('qr_synced' in editBody), edit?.body);

    // Tela QR
    await evaluate(`[...document.querySelectorAll('[aria-label="QR Code"]')].filter(${VISIBLE})[0].click()`);
    await waitFor('Estatísticas');
    await waitFor('NFC sincronizado');
    await waitFor('Últimos 7 dias');
    const header = await visibleText();
    check(`header QR Code — nome: ${tag}`, header.includes('QR Code — Cardápio'));
    await overflowCheck(`qr ${tag}`);
    await waitGone('Destino atualizado!');
    await shot(`qr-${vp.name}-${tag}`);
    await scrollAllToBottom();
    await shot(`qr-estatisticas-${vp.name}-${tag}`);
    await click('Compartilhar QR');
    await delay(1500);
    const shareToast = await visibleText();
    check(`compartilhar no web baixa PNG ou compartilha link: ${tag}`, /QR Code baixado em PNG|Link compartilhado|Link copiado/.test(shareToast));
  }
} catch (error) {
  check('roteiro sem exceção', false, error instanceof Error ? error.message : String(error));
  await shot('erro').catch(() => undefined);
}

if (LOCAL_BASE) {
  try {
    await cdp('Page.navigate', { url: `${LOCAL_BASE}/` });
    await delay(2000);
    for (const vp of VIEWPORTS) {
      await viewport(vp);
      await reachTabs();
      await click('Plaquinhas', '[role=tab]');
      await waitFor('Plaquinhas precisam de conta e conexão');
      check(`modo local explica sem quebrar: ${vp.width}x${vp.height}`, true);
      await shot(`sem-conta-${vp.name}-${vp.width}x${vp.height}`);
    }
  } catch (error) {
    check('roteiro modo local sem exceção', false, error instanceof Error ? error.message : String(error));
    await shot('erro-local').catch(() => undefined);
  }
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
