// QA visual: QR em lote, gerenciar acessos, convite, telas de aguardo/negado e badge da Home.
// Supabase fictício (QA_MOCK_REF) respondido por um fetch simulado injetado na página; nada toca o projeto real.
// Pré-requisito: `npx expo start --web --port 8097` com EXPO_PUBLIC_SUPABASE_URL=https://qamockproj0123.supabase.co.
import { Buffer } from 'node:buffer';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.QA_BASE ?? 'http://localhost:8097';
const MOCK_REF = process.env.QA_MOCK_REF ?? 'qamockproj0123';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9341;
const OUT = join('screenshots', 'admin-acesso');
const PROFILE = join(tmpdir(), `treville-admin-acesso-${Date.now()}`);
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'phone', width: 393, height: 852 },
  { name: 'tablet', width: 1024, height: 1366 },
];

const MOCK = `(() => {
  const REF = ${JSON.stringify(MOCK_REF)};
  const HOST = REF + '.supabase.co';
  const b64 = (value) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\\+/g, '-').replace(/\\//g, '_');
  const now = Math.floor(Date.now() / 1000);
  const USERS = {
    admin: { id: '11111111-1111-4111-8111-111111111111', email: 'previaemailofc@gmail.com', user_metadata: { full_name: 'Admin Tréville' } },
    member: { id: '22222222-2222-4222-8222-222222222222', email: 'novo.usuario@exemplo.com', user_metadata: { full_name: 'Novo Usuário' } },
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
  const seed = () => {
    const t = Date.now();
    const people = [
      ['Mariana Costa', 'mariana.costa@exemplo.com', 'pending', 1],
      ['João Pereira', 'joao.pereira@exemplo.com', 'pending', 2],
      ['Carla Souza', 'carla@restaurante.com.br', 'pending', 3],
      ['Admin Tréville', 'previaemailofc@gmail.com', 'approved', 30],
      ['Rafael Lima', 'rafael.lima@exemplo.com', 'approved', 12],
      ['Beatriz Alves', 'bia.alves@exemplo.com', 'approved', 9],
      ['Spam Bot', 'spam@bot.example', 'blocked', 5],
    ];
    return {
      access: people.map(([name, email, status, ago], index) => ({
        id: '0000000' + index + '-aaaa-4aaa-8aaa-00000000000' + index,
        userId: '3333333' + index + '-bbbb-4bbb-8bbb-00000000000' + index,
        email, name, status, avatarUrl: null, invited: false,
        createdAt: iso(t - ago * day), approvedAt: status === 'approved' ? iso(t - (ago - 1) * day) : null,
      })),
      links: [],
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
  window.__qaRequests = [];
  window.__qaDownloads = [];
  const originalCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => { blob.text().then((text) => window.__qaDownloads.push(text)); return originalCreate(blob); };
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const makeId = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * 32)]).join('');
  const original = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, location.href);
    if (url.host !== HOST) return original(input, init);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const body = typeof init.body === 'string' ? init.body : null;
    window.__qaRequests.push({ method, path: url.pathname, query: url.search, body });
    const json = (value, status = 200, extra = {}) => new Response(method === 'HEAD' ? null : JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...extra } });
    if (url.pathname === '/auth/v1/user') return json(user);
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 });
    if (url.pathname.startsWith('/auth/v1/')) return json({});
    const db = load();
    if (url.pathname === '/rest/v1/rpc/my_access_status') return json(localStorage.getItem('qa-access') || (who === 'admin' ? 'admin' : 'pending'));
    if (url.pathname === '/rest/v1/admins') return json(who === 'admin' ? [{ email: user.email }] : []);
    if (url.pathname === '/rest/v1/user_access') {
      const pending = db.access.filter((row) => row.status === 'pending').length;
      return json([], 200, { 'content-range': '*/' + (who === 'admin' ? pending : 0) });
    }
    if (url.pathname === '/functions/v1/admin') {
      const payload = JSON.parse(body || '{}');
      const action = payload.action;
      if (action === 'stats') return json({ totalUsers: db.access.length, activeUsers7d: 4, totalOperations: 128, totalTemplates: 6, users: [], operationsByType: [{ contentType: 'URL', count: 80 }, { contentType: 'WHATSAPP', count: 48 }], recentOperations: [], topTemplates: [], usage: { scansThisMonth: 1840, limit: 500000, percent: 0.4, warning: false, monthStart: iso(Date.now()) } });
      if (action === 'access_list') return json({ items: db.access });
      if (action === 'pending_count') return json({ pending: db.access.filter((row) => row.status === 'pending').length });
      if (action === 'access_set_status') {
        db.access = db.access.map((row) => (row.id === payload.id ? { ...row, status: payload.status, approvedAt: payload.status === 'approved' ? new Date().toISOString() : row.approvedAt } : row));
        save(db);
        return json({ id: payload.id, status: payload.status });
      }
      if (action === 'invite') {
        db.access.unshift({ id: crypto.randomUUID(), userId: null, email: payload.email, name: payload.email, status: 'approved', avatarUrl: null, invited: true, createdAt: new Date().toISOString(), approvedAt: new Date().toISOString() });
        save(db);
        return json({ invited: true, email: payload.email });
      }
      if (action === 'batch_create') {
        await new Promise((resolve) => setTimeout(resolve, Number(localStorage.getItem('qa-batch-delay') || 900)));
        const items = Array.from({ length: payload.quantity }, (_, index) => {
          const id = makeId();
          const name = payload.prefix + ' ' + (payload.start + index);
          const empty = payload.type === 'empty' || (!payload.url && payload.type !== 'profile');
          return {
            id, name,
            destination_url: payload.type === 'profile' || empty ? 'https://treville-aproxima.expo.app/p/' + id : payload.url,
            destination_type: payload.type === 'profile' ? 'profile' : empty ? 'empty' : payload.type,
            is_active: !empty, profile_enabled: payload.type === 'profile',
          };
        });
        db.links.push(...items);
        save(db);
        return json({ items });
      }
      return json({ error: 'Ação desconhecida.' }, 400);
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

/** Troca de usuário/status e reabre o app do zero. */
async function boot({ who, access, path = '/', reset = false }) {
  await evaluate(`(() => {
    ${reset ? "localStorage.removeItem('qa-db');" : ''}
    localStorage.setItem('onboarding_done', 'true');
    localStorage.setItem('qa-user', ${JSON.stringify(who)});
    ${access ? `localStorage.setItem('qa-access', ${JSON.stringify(access)});` : "localStorage.removeItem('qa-access');"}
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

    // Aguardando aprovação (usuário comum pendente).
    await boot({ who: 'member', access: 'pending', reset: true });
    await settle('Acesso solicitado!');
    const waiting = await visibleText();
    check(`aguardo: textos sem prometer e-mail: ${tag}`, waiting.includes('Seu acesso está sendo analisado.') && waiting.includes('Você poderá entrar assim que for aprovado.') && !/receberá um e-mail/i.test(waiting));
    check(`aguardo: rota /waiting-approval: ${tag}`, (await evaluate('location.pathname')) === '/waiting-approval', await evaluate('location.pathname'));
    await overflowCheck(`aguardo ${tag}`);
    await shot(`aguardando-aprovacao-${vp.name}-${tag}`);
    // Tentar abrir uma tela do app direto pela URL continua no aguardo.
    await cdp('Page.navigate', { url: `${BASE}/plaquinhas` });
    await delay(2500);
    await settle('Acesso solicitado!');
    check(`pendente não abre /plaquinhas pela URL: ${tag}`, (await evaluate('location.pathname')) !== '/plaquinhas', await evaluate('location.pathname'));
    // Aprovado pelo admin: "Verificar novamente" libera.
    await evaluate(`localStorage.setItem('qa-access', 'approved'); true`);
    await click('Verificar novamente');
    await settle('Recentes');
    check(`aprovado entra no app após verificar de novo: ${tag}`, !(await visibleText()).includes('Acesso solicitado!'));

    // Bloqueado.
    await boot({ who: 'member', access: 'blocked' });
    await settle('Acesso negado');
    const denied = await visibleText();
    check(`negado: textos: ${tag}`, denied.includes('Sua conta foi bloqueada.') && denied.includes('Entre em contato para mais informações.'));
    await shot(`acesso-negado-${vp.name}-${tag}`);
    await click('Sair');
    await settle('Entrar');
    check(`Sair volta ao login: ${tag}`, (await evaluate('location.pathname')).includes('login'), await evaluate('location.pathname'));

    // Admin: badge na Home.
    await boot({ who: 'admin', reset: true });
    await settle('Recentes');
    await delay(800);
    const badge = await evaluate(`(() => { const b = [...document.querySelectorAll('[data-testid="home-admin"] [data-testid="count-badge"]')].find(${VISIBLE}); return b ? b.innerText : ''; })()`);
    check(`badge vermelho com 3 pendentes na Home: ${tag}`, badge.trim() === '3', badge);
    const pendingQuery = (await requests()).find((item) => item.path === '/rest/v1/user_access' && item.query.includes('status=eq.pending'));
    check(`contagem pelo select (RLS is_admin) com status=pending: ${tag}`, Boolean(pendingQuery));
    await shot(`home-badge-admin-${vp.name}-${tag}`);
    await click('Painel Admin: 3 pedidos pendentes');
    await settle('Gerenciar acessos');
    await shot(`painel-admin-${vp.name}-${tag}`);

    // Gerenciar acessos: 3 abas.
    await click('Gerenciar acessos: 3 pendentes', '[role=button]');
    await settle('Mariana Costa');
    check(`aba Pendentes com 3 cards: ${tag}`, (await countVisible('access-card')) === 3, String(await countVisible('access-card')));
    await overflowCheck(`acessos ${tag}`);
    await shot(`acessos-pendentes-${vp.name}-${tag}`);
    await click('Aprovar mariana.costa@exemplo.com');
    await delay(600);
    const setReq = (await requests()).filter((item) => item.path === '/functions/v1/admin' && (item.body || '').includes('access_set_status')).at(-1);
    check(`Aprovar chama access_set_status approved: ${tag}`, setReq && JSON.parse(setReq.body).status === 'approved', setReq?.body);
    check(`card sai de Pendentes: ${tag}`, (await countVisible('access-card')) === 2);
    await click('Aprovados (4)', '[role=tab]');
    await waitFor('Acesso liberado');
    await shot(`acessos-aprovados-${vp.name}-${tag}`);
    await click('Bloqueados (1)', '[role=tab]');
    await waitFor('Spam Bot');
    check(`badge Bloqueado na aba Bloqueados: ${tag}`, (await visibleText()).includes('Bloqueado'));
    await shot(`acessos-bloqueados-${vp.name}-${tag}`);

    // Convite.
    await click('Convidar usuário', '[role=button]');
    await waitFor('Enviar convite');
    await fill('E-mail', 'email-invalido');
    await click('Enviar convite');
    await waitFor('E-mail inválido.');
    await fill('E-mail', 'Convidado.Novo@Exemplo.com');
    await shot(`convite-modal-${vp.name}-${tag}`);
    await click('Enviar convite');
    await waitFor('Convite enviado para convidado.novo@exemplo.com');
    const inviteReq = (await requests()).filter((item) => (item.body || '').includes('"invite"')).at(-1);
    check(`convite manda e-mail normalizado: ${tag}`, inviteReq && JSON.parse(inviteReq.body).email === 'convidado.novo@exemplo.com', inviteReq?.body);
    await shot(`convite-enviado-${vp.name}-${tag}`);

    // QR em lote.
    await boot({ who: 'admin', path: '/qr-batch' });
    await settle('Gerar plaquinhas');
    await fill('Quantidade', '12');
    await fill('Prefixo do nome', 'Mesa');
    await click('WhatsApp', '[role=radio]');
    await fill('WhatsApp padrão (opcional)', '11 99999-8888');
    await click('Gerar PDF', '[role=switch]');
    await shot(`lote-formulario-${vp.name}-${tag}`);
    await overflowCheck(`lote formulário ${tag}`);
    await click('Gerar plaquinhas');
    await waitFor('Criando 5/12...', 15000);
    await shot(`lote-progresso-${vp.name}-${tag}`);
    await waitFor('12 plaquinhas criadas', 20000);
    const batchReqs = (await requests()).filter((item) => (item.body || '').includes('batch_create')).map((item) => JSON.parse(item.body));
    check(`lote em 3 blocos com numeração contínua: ${tag}`, batchReqs.length === 3 && batchReqs.map((item) => item.start).join(',') === '1,6,11' && batchReqs.every((item) => item.url === 'https://wa.me/5511999998888' && item.type === 'whatsapp'), JSON.stringify(batchReqs.map((item) => [item.start, item.quantity])));
    check(`12 QR codes na lista: ${tag}`, (await countVisible('qr-batch-item')) === 12, String(await countVisible('qr-batch-item')));
    const order = await evaluate(`[...document.querySelectorAll('[data-testid="qr-batch-item"]')].map((n) => n.innerText.split('\\n')[1]).slice(0, 3).join('|')`);
    check(`ordem Mesa 1, Mesa 2, Mesa 3: ${tag}`, order === 'Mesa 1|Mesa 2|Mesa 3', order);
    await overflowCheck(`lote resultado ${tag}`);
    await shot(`lote-resultado-${vp.name}-${tag}`);
    await click('Exportar CSV');
    await delay(800);
    const csv = (await evaluate('window.__qaDownloads')).at(-1) || '';
    check(`CSV com cabeçalho e 12 linhas: ${tag}`, csv.includes('id,nome,url_curta,destino') && csv.trim().split('\r\n').length === 13 && csv.includes('/functions/v1/redirect/'), csv.slice(0, 120));

    // Lote "Vazio".
    await click('Gerar outro lote');
    await fill('Quantidade', '2');
    await fill('Prefixo do nome', 'Reserva');
    await click('Vazio', '[role=radio]');
    await click('Gerar plaquinhas');
    await waitFor('2 plaquinhas criadas', 15000);
    check(`Vazio mostra "Sem destino": ${tag}`, (await visibleText()).includes('Sem destino'));
    await shot(`lote-vazio-${vp.name}-${tag}`);
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
