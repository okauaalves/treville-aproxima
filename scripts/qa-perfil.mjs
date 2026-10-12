// QA visual do perfil digital + links + webhook. Usa um projeto Supabase fictício (QA_MOCK_REF) cujas chamadas
// são respondidas por um fetch simulado injetado na página; nada toca o Supabase real.
// Modo local (sem conta): QA_LOCAL_BASE aponta para um servidor sem Supabase configurado.
import { Buffer } from 'node:buffer';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.QA_BASE ?? 'http://localhost:8090';
const MOCK_REF = process.env.QA_MOCK_REF ?? 'qamockproj0123';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join('screenshots', 'perfil');
const PROFILE = join(tmpdir(), `treville-perfil-${Date.now()}`);
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
    ].map((link) => ({ ...link, profile_enabled: false, webhook_url: null }));
    const perDay = [3, 7, 4, 9, 6, 12, 8];
    const logs = [];
    perDay.forEach((count, index) => {
      for (let n = 0; n < count; n += 1) logs.push({ id: 'log-' + index + '-' + n, link_id: 'K7M2QX', scanned_at: iso(t - (6 - index) * day - n * 600000), scan_type: n % 3 === 0 ? 'nfc' : 'qr' });
    });
    return { links, logs: logs.reverse(), profile: { id: user.id, full_name: 'Luiz Teste', display_name: null, bio: null, avatar_url: null, theme_color: '#1E40AF', theme_style: 'glass' }, profileLinks: [] };
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
    if (url.pathname === '/rest/v1/profiles') {
      const wantsObject = (headers.get('accept') || '').includes('vnd.pgrst.object');
      if (method === 'GET') return db.profile ? json(wantsObject ? db.profile : [db.profile]) : wantsObject ? json({ code: 'PGRST116', message: 'no rows' }, 406) : json([]);
      db.profile = { ...db.profile, ...JSON.parse(body || '{}') };
      save(db);
      return json(wantsObject ? db.profile : [db.profile], 201);
    }
    if (url.pathname === '/rest/v1/profile_links') return json(db.profileLinks.filter((row) => row.plaquinha_id === eq('plaquinha_id')).sort((a, b) => a.position - b.position));
    if (url.pathname === '/rest/v1/rpc/save_profile_links') {
      const args = JSON.parse(body || '{}');
      const rows = args.p_links.map((link, index) => ({ id: link.id || crypto.randomUUID(), user_id: user.id, plaquinha_id: args.p_plaquinha_id, title: link.title, url: link.url, icon: link.icon, is_active: link.is_active, position: index }));
      db.profileLinks = db.profileLinks.filter((row) => row.plaquinha_id !== args.p_plaquinha_id).concat(rows);
      save(db);
      return json(rows);
    }
    if (url.pathname === '/rest/v1/scan_logs') return json(db.logs.filter((row) => row.link_id === eq('link_id')));
    return json([]);
  };
})();`;

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9336', `--user-data-dir=${PROFILE}`, '--window-size=1280,1366', 'about:blank'], { stdio: 'ignore' });

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
      const list = await fetch('http://127.0.0.1:9336/json/list').then((response) => response.json());
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

async function scrollAllToBottom() {
  await evaluate(`(() => { for (const n of document.querySelectorAll('div')) { if (/(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 4 && n.checkVisibility()) n.scrollTop = n.scrollHeight; } })()`);
  await delay(400);
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
  await evaluate(`localStorage.setItem('qa-mode', ${JSON.stringify(mode)}); localStorage.removeItem('qa-db'); localStorage.setItem('onboarding_done', 'true'); true`);
  await cdp('Page.navigate', { url: `${BASE}/` });
  await delay(1000);
  await reachTabs();
  await click('Plaquinhas', '[role=tab]');
}


async function bootKeep() {
  await cdp('Page.navigate', { url: `${BASE}/` });
  await delay(1000);
  await reachTabs();
  await click('Plaquinhas', '[role=tab]');
}

const lastRequest = async (predicate) => (await requests()).filter(predicate).at(-1);

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
    await boot('data');
    await waitFor('Cardápio');

    // Configurações → Meu Perfil Digital
    await click('Ajustes', '[role=tab]');
    await waitFor('Meu Perfil Digital');
    await waitFor('Ver minha página');
    await shot(`ajustes-${vp.name}-${tag}`);
    await click('Ver minha página');
    await waitFor('Nenhuma plaquinha está com a página de perfil ativa');
    check(`Ver minha página explica quando nenhuma tem perfil: ${tag}`, true);
    await click('Editar perfil');
    await waitFor('Cor do perfil');
    await fill('Nome de exibição', 'Luiz Tréville');
    await fill('Bio', 'Doces artesanais <b>sob encomenda</b> em São Paulo');
    await click('Roxo', '[role=radio]');
    await waitFor('50/120');
    await delay(400);
    await overflowCheck(`editar perfil ${tag}`);
    await shot(`editar-perfil-${vp.name}-${tag}`);
    await scrollAllToBottom();
    await shot(`editar-perfil-preview-${vp.name}-${tag}`);
    await click('Salvar');
    await waitFor('Perfil salvo.');
    const profileSave = await lastRequest((item) => item.method === 'POST' && item.path === '/rest/v1/profiles');
    const profileBody = profileSave ? JSON.parse(profileSave.body) : {};
    check(`perfil salvo com id da sessão, nome, bio e cor: ${tag}`, profileBody.id === '11111111-1111-4111-8111-111111111111' && profileBody.display_name === 'Luiz Tréville' && profileBody.theme_color === '#7C3AED' && profileBody.bio?.startsWith('Doces'), profileSave?.body);

    // Plaquinhas → card → Perfil
    await bootKeep();
    await waitFor('Link direto');
    await click('Editar perfil de Cardápio');
    await waitFor('Página de perfil ativada');
    await waitFor('Nenhum link ainda');
    await click('Página de perfil ativada', '[role=switch]');
    await waitFor('Página de perfil ativada. Quem escanear vê seus links.');
    const toggle = await lastRequest((item) => item.method === 'PATCH' && item.query.includes('K7M2QX'));
    check(`toggle envia profile_enabled=true: ${tag}`, toggle && JSON.parse(toggle.body).profile_enabled === true, toggle?.body);

    await click('Adicionar link');
    await waitFor('Localização');
    await delay(800);
    await shot(`adicionar-link-${vp.name}-${tag}`);
    await click('WhatsApp');
    await fill('Link', '11 99999-8888');
    await click('Adicionar link');
    await delay(800);
    await click('Instagram');
    await fill('Link', '@treville');
    await click('Adicionar link');
    await delay(800);
    await click('Outro');
    await fill('Link', 'javascript:alert(1)');
    await click('Salvar links');
    await waitFor('Confira o link 3.');
    check(`link javascript: bloqueado no app: ${tag}`, !(await requests()).some((item) => item.path === '/rest/v1/rpc/save_profile_links' && item.body.includes('javascript')));
    await click('Excluir Link');
    await click('Subir Instagram');
    await delay(300);
    const order = await evaluate(`[...document.querySelectorAll('[data-testid="profile-link-item"]')].filter(${VISIBLE}).map((n) => n.innerText.split('\\n')[0])`);
    check(`reordenou com as setas: ${tag}`, order.length === 2 && order[0].includes('Instagram') && order[1].includes('WhatsApp'), JSON.stringify(order));
    await shot(`links-${vp.name}-${tag}`);
    await click('Salvar links');
    await waitFor('Links salvos.');
    const rpc = await lastRequest((item) => item.path === '/rest/v1/rpc/save_profile_links');
    const rpcBody = rpc ? JSON.parse(rpc.body) : { p_links: [] };
    check(
      `RPC atômica com ordem e URLs normalizadas: ${tag}`,
      rpcBody.p_plaquinha_id === 'K7M2QX' && rpcBody.p_links.map((link) => link.url).join(' ') === 'https://instagram.com/treville https://wa.me/5511999998888',
      rpc?.body,
    );

    await click('Ver como ficará');
    await delay(1500);
    const srcdoc = await evaluate(`(() => { const f = [...document.querySelectorAll('iframe')].at(-1); return f ? f.getAttribute('srcdoc') : ''; })()`);
    check(`preview usa o renderer com dados atuais e escapa HTML: ${tag}`, srcdoc.includes('Luiz Tréville — Tréville Aproxima') && srcdoc.includes('&lt;b&gt;sob encomenda&lt;/b&gt;') && !/<script/i.test(srcdoc) && srcdoc.includes('href="https://wa.me/5511999998888"'));
    const sandbox = await evaluate(`[...document.querySelectorAll('iframe')].at(-1)?.getAttribute('sandbox')`);
    check(`iframe sem scripts (sandbox): ${tag}`, sandbox === 'allow-popups allow-popups-to-escape-sandbox', sandbox);
    await shot(`previa-${vp.name}-${tag}`);
    await click('Fechar');
    await delay(600);

    // Card mostra o badge roxo
    await bootKeep();
    await waitFor('Perfil ativo');
    check(`card com badge Perfil ativo: ${tag}`, true);
    await shot(`lista-badges-${vp.name}-${tag}`);

    // Webhook na tela do QR
    await evaluate(`[...document.querySelectorAll('[aria-label="QR Code"]')].filter(${VISIBLE})[0].click()`);
    await waitFor('Webhook ativo');
    await click('Webhook ativo', '[role=switch]');
    await fill('URL do webhook', 'https://127.0.0.1/hook');
    await click('Salvar webhook');
    await waitFor('Endereços internos não são permitidos.');
    check(`webhook interno bloqueado sem chamar o banco: ${tag}`, !(await requests()).some((item) => item.method === 'PATCH' && (item.body || '').includes('127.0.0.1')));
    await fill('URL do webhook', 'http://hooks.exemplo.com/scan');
    await click('Salvar webhook');
    await waitFor('O webhook precisa usar https://.');
    await shot(`webhook-bloqueado-${vp.name}-${tag}`);
    await fill('URL do webhook', 'https://hooks.exemplo.com/scan');
    await click('Salvar webhook');
    await waitFor('Webhook salvo.');
    const hook = await lastRequest((item) => item.method === 'PATCH' && (item.body || '').includes('webhook_url'));
    check(`webhook válido salvo: ${tag}`, hook && JSON.parse(hook.body).webhook_url === 'https://hooks.exemplo.com/scan', hook?.body);
    await overflowCheck(`qr com webhook ${tag}`);
    await delay(3500);
    await shot(`webhook-${vp.name}-${tag}`);

    // Página HTML real (mesmo renderer da Edge Function), em tela cheia
    await evaluate(`(() => { const html = ${JSON.stringify(srcdoc)}.replace(/ target="_blank"/g, ''); document.open(); document.write(html); document.close(); return true; })()`);
    await delay(800);
    const page = await evaluate(`(() => ({ title: document.title, links: document.querySelectorAll('a.link').length, scripts: document.scripts.length, lang: document.documentElement.lang }))()`);
    check(`página renderizada: título, idioma, 2 links, sem scripts: ${tag}`, page.title === 'Luiz Tréville — Tréville Aproxima' && page.lang === 'pt-BR' && page.links === 2 && page.scripts === 0, JSON.stringify(page));
    await shot(`pagina-perfil-${vp.name}-${tag}`);
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
