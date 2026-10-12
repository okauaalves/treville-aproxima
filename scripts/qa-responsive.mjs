import { Buffer } from 'node:buffer';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.QA_BASE ?? 'http://localhost:8090';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = join('screenshots', 'responsive');
const PROFILE = join(tmpdir(), `treville-responsive-${Date.now()}`);
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'small', width: 360, height: 800 },
  { name: 'normal', width: 393, height: 852 },
  { name: 'large', width: 430, height: 932 },
  { name: 'ipad-mini', width: 744, height: 1133 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'bigtablet', width: 1024, height: 1366 },
  { name: 'fold-open', width: 904, height: 1000 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'landscape', width: 852, height: 393 },
];

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9334', `--user-data-dir=${PROFILE}`, '--window-size=1280,1366', 'about:blank'], { stdio: 'ignore' });

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
      const list = await fetch('http://127.0.0.1:9334/json/list').then((response) => response.json());
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

const bodyText = () => evaluate('document.body ? document.body.innerText : ""');

async function waitFor(text, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const body = await bodyText();
    if (typeof body === 'string' && body.includes(text)) return body;
    await delay(150);
  }
  throw new Error(`timeout esperando "${text}". Tela: ${String(await bodyText()).slice(0, 300)}`);
}

async function click(label, roles = '[role=button],button,a,[role=link],[role=tab]') {
  const found = await evaluate(`(() => {
    const want = ${JSON.stringify(label)};
    const norm = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const node = [...document.querySelectorAll(${JSON.stringify(roles)})]
      .filter((item) => { const r = item.getBoundingClientRect(); return r.width > 0 && r.height > 0 && item.checkVisibility({ visibilityProperty: true }); })
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
  await delay(120);
}

async function viewport({ width, height }) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 1280 });
  await delay(700);
}

async function resetScroll() {
  await evaluate(`(() => { for (const node of document.querySelectorAll('*')) { if (node.scrollTop) node.scrollTop = 0; } window.scrollTo(0, 0); })()`);
  await delay(250);
}

/** Visível = no viewport e não escondido (telas inativas das tabs ficam com display none / fora). */
const VISIBLE = `(node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0 && node.checkVisibility({ visibilityProperty: true, opacityProperty: true }); }`;

async function layout() {
  return evaluate(`(() => {
    const visible = ${VISIBLE};
    const byTest = (id) => [...document.querySelectorAll('[data-testid="' + id + '"]')].filter(visible).map((n) => { const r = n.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width), top: Math.round(r.top), bottom: Math.round(r.bottom) }; })[0] || null;
    const tabs = [...document.querySelectorAll('[role=tab]')].filter(visible).map((n) => { const r = n.getBoundingClientRect(); return { label: n.getAttribute('aria-label'), x: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width) }; });
    return {
      innerWidth, innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      sidebar: byTest('sidebar'),
      tabs,
      homeContent: byTest('home-content'),
      homeColumns: byTest('home-columns'),
      homeLeft: byTest('home-left'),
      homeRight: byTest('home-right'),
      actions: byTest('home-actions'),
      grid: byTest('templates-grid'),
    };
  })()`);
}

async function overflowCheck(label) {
  const info = await evaluate(`(() => {
    const visible = ${VISIBLE};
    const width = innerWidth;
    const offenders = [...document.querySelectorAll('body *')].filter((node) => {
      if (!visible(node)) return false;
      const r = node.getBoundingClientRect();
      if (r.right <= width + 1 && r.left >= -1) return false;
      let parent = node.parentElement;
      while (parent) {
        const style = getComputedStyle(parent);
        const pr = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden)/.test(style.overflowX) && pr.right <= width + 1 && pr.left >= -1) return false;
        parent = parent.parentElement;
      }
      return true;
    });
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: width, count: offenders.length, sample: offenders.slice(0, 3).map((n) => n.tagName + ':' + (n.innerText || n.getAttribute('aria-label') || '').slice(0, 30)) };
  })()`);
  check(`sem overflow horizontal: ${label}`, info.scrollWidth <= info.innerWidth && info.count === 0, `scrollWidth ${info.scrollWidth} / innerWidth ${info.innerWidth}${info.count ? ` ${JSON.stringify(info.sample)}` : ''}`);
}

async function navCheck(vp, label) {
  const info = await layout();
  if (vp.width >= 600) {
    const expected = vp.width >= 900 ? 220 : 96;
    const ok = info.sidebar && info.sidebar.x === 0 && Math.abs(info.sidebar.w - expected) <= 2 && info.tabs.length === 5 && info.tabs.every((tab) => tab.x < info.sidebar.w);
    check(`sidebar à esquerda (${expected}px): ${label}`, ok, JSON.stringify(info.sidebar));
  } else {
    const ok = !info.sidebar && info.tabs.length === 5 && info.tabs.every((tab) => tab.top > info.innerHeight - 90);
    check(`bottom tab: ${label}`, ok, `tops ${info.tabs.map((tab) => tab.top).join(',')}`);
  }
  return info;
}

async function contentWidth(selectorLabel) {
  // Largura do maior card/linha visível com o rótulo dado (mede a coluna de conteúdo).
  return evaluate(`(() => {
    const visible = ${VISIBLE};
    const node = [...document.querySelectorAll('[role=button],[role=switch]')].filter(visible).find((n) => (n.getAttribute('aria-label') || '').trim() === ${JSON.stringify(selectorLabel)});
    if (!node) return null;
    let card = node;
    for (let i = 0; i < 3 && card.parentElement; i += 1) card = card.parentElement;
    const r = card.getBoundingClientRect();
    return { x: Math.round(r.left), w: Math.round(r.width), right: Math.round(r.right) };
  })()`);
}

async function gridColumns() {
  return evaluate(`(() => {
    const visible = ${VISIBLE};
    const grid = [...document.querySelectorAll('[data-testid="templates-grid"]')].find(visible);
    if (!grid) return null;
    const tabs = ['Básicos', 'Avançados'];
    const cards = [...grid.querySelectorAll('[role=button]')].filter(visible).filter((n) => !tabs.includes((n.getAttribute('aria-label') || n.innerText || '').trim())).map((n) => ({ r: n.getBoundingClientRect(), n }));
    if (!cards.length) return null;
    const firstTop = Math.min(...cards.map((c) => Math.round(c.r.top)));
    const row = cards.filter((c) => Math.abs(Math.round(c.r.top) - firstTop) <= 2);
    const heights = row.map((c) => Math.round(c.r.height));
    const titles = cards.map((c) => c.n.querySelector('div[dir=auto]')).filter(Boolean);
    const clipped = titles.filter((t) => t.scrollHeight > t.clientHeight + 2).map((t) => t.innerText);
    const gr = grid.getBoundingClientRect();
    return { cols: row.length, heights, cardWidth: Math.round(row[0].r.width), clipped, gridX: Math.round(gr.left), gridW: Math.round(gr.width) };
  })()`);
}

try {
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await viewport({ width: 393, height: 852 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });

  await cdp('Page.navigate', { url: `${BASE}/` });
  await waitFor('Antes de começar', 90000);
  await click('Entendi, continuar');
  await waitFor('Entrar');
  await click('Criar conta');
  await waitFor('Nome completo');
  await fill('Nome completo', 'Luiz Teste');
  await fill('E-mail', 'luiz@exemplo.com');
  await fill('Senha', '123456');
  await fill('Confirmar senha', '123456');
  await click('Criar conta');
  await waitFor('aproxime sua tag');

  // Uma leitura simulada para Recentes/Histórico terem itens.
  await click('Modo leitura');
  await waitFor('Modo de teste (simulação)');
  await click('Modo de teste (simulação)');
  await waitFor('Com o app aberto, aproxime a tag NFC');
  await click('Simular tag (modo de teste)');
  await delay(4000);
  await cdp('Page.navigate', { url: `${BASE}/` });
  await waitFor('aproxime sua tag', 90000);
  await delay(800);

  for (const vp of VIEWPORTS) {
    const tag = `${vp.name} ${vp.width}x${vp.height}`;
    await viewport(vp);

    // Home
    await click('Início');
    await waitFor('aproxime sua tag');
    await resetScroll();
    let info = await navCheck(vp, `home ${tag}`);
    await overflowCheck(`home ${tag}`);
    if (vp.width > 900) {
      const ratio = info.homeLeft && info.homeRight ? info.homeLeft.w / (info.homeLeft.w + info.homeRight.w) : 0;
      check(`Home em duas colunas 45/55: ${tag}`, info.homeColumns && Math.abs(ratio - 0.45) < 0.02, `esq ${info.homeLeft?.w} dir ${info.homeRight?.w}`);
      check(`Home maxWidth 1000 centralizada: ${tag}`, info.homeContent.w <= 1000 && Math.abs((info.homeContent.x - (info.sidebar?.w ?? 0)) - (vp.width - info.homeContent.x - info.homeContent.w)) <= 2, JSON.stringify(info.homeContent));
    } else {
      check(`Home em coluna única: ${tag}`, !info.homeColumns);
      if (vp.width >= 600) {
        check(`Home maxWidth 600 centralizada: ${tag}`, info.homeContent.w <= 600 && Math.abs((info.homeContent.x - (info.sidebar?.w ?? 0)) - (vp.width - info.homeContent.x - info.homeContent.w)) <= 2, JSON.stringify(info.homeContent));
      }
    }
    if (vp.width >= 340 && vp.width < 600) {
      const buttons = await evaluate(`(() => { const v = ${VISIBLE}; const b = [...document.querySelectorAll('[role=button]')].filter(v).filter((n) => ['Modo leitura', 'Gravar tag'].includes(n.getAttribute('aria-label'))).map((n) => { const r = n.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height) }; }); return b; })()`);
      check(`Modo leitura e Gravar lado a lado, mesma altura: ${tag}`, buttons.length === 2 && Math.abs(buttons[0].top - buttons[1].top) <= 2 && buttons[0].h === buttons[1].h, JSON.stringify(buttons));
    }
    if (vp.width === 360) {
      const header = await evaluate(`(() => { const h = [...document.querySelectorAll('[aria-label="Tréville Aproxima"]')].find(${VISIBLE}); const r = h.getBoundingClientRect(); return { right: Math.round(r.right), width: innerWidth, text: h.innerText }; })()`);
      check('header Tréville Aproxima cabe em 360', header.right <= header.width && header.text.includes('Aproxima'), JSON.stringify(header));
    }
    if (vp.name === 'landscape') {
      const scrollable = await evaluate(`(() => [...document.querySelectorAll('div')].some((n) => /(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 20 && n.checkVisibility()))()`);
      check(`Home rola em landscape: ${tag}`, scrollable);
    }
    await shot(`home-${vp.name}-${vp.width}x${vp.height}`);

    // Templates
    await click('Templates');
    await waitFor('Básicos');
    await delay(500);
    await resetScroll();
    await navCheck(vp, `templates ${tag}`);
    await overflowCheck(`templates ${tag}`);
    const grid = await gridColumns();
    const expectedCols = vp.width >= 900 ? 4 : vp.width >= 600 ? 3 : 2;
    check(`Templates grid ${expectedCols} colunas: ${tag}`, grid && grid.cols === expectedCols && new Set(grid.heights).size === 1, JSON.stringify(grid));
    if (vp.width < 380) {
      check(`Templates 2 colunas sem título cortado: ${tag}`, grid && grid.clipped.length === 0, `card ${grid?.cardWidth}px ${JSON.stringify(grid?.clipped)}`);
    }
    await shot(`templates-${vp.name}-${vp.width}x${vp.height}`);

    // Configurações
    await click('Ajustes');
    await waitFor('Configurações');
    await resetScroll();
    await navCheck(vp, `settings ${tag}`);
    await overflowCheck(`settings ${tag}`);
    if (vp.width >= 600) {
      const card = await contentWidth('Tema');
      check(`Configurações maxWidth 600: ${tag}`, card && card.w <= 600, JSON.stringify(card));
    }
    await shot(`settings-${vp.name}-${vp.width}x${vp.height}`);

    // Histórico
    await click('Histórico');
    await waitFor('Limpar');
    await resetScroll();
    await navCheck(vp, `history ${tag}`);
    await overflowCheck(`history ${tag}`);
    if (vp.width >= 600) {
      const column = await evaluate(`(() => { const v = ${VISIBLE}; const n = [...document.querySelectorAll('[aria-label="Limpar histórico"]')].find(v); let p = n; for (let i = 0; i < 3; i += 1) p = p.parentElement; const r = p.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width) }; })()`);
      check(`Histórico maxWidth 700: ${tag}`, column.w <= 700, JSON.stringify(column));
    }
    await shot(`history-${vp.name}-${vp.width}x${vp.height}`);
  }

  // Tela interna (Configurar tag) em 1024.
  await viewport({ width: 1024, height: 1366 });
  await cdp('Page.navigate', { url: `${BASE}/write/configure?contentType=WHATSAPP` });
  await waitFor('Tipo de conteúdo', 90000);
  await delay(800);
  await overflowCheck('write/configure 1024');
  const configure = await evaluate(`(() => { const v = ${VISIBLE}; const n = [...document.querySelectorAll('[aria-label="Tipo de conteúdo"]')].find(v); const r = n.getBoundingClientRect(); return { x: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), vw: innerWidth }; })()`);
  const column = configure.w + 32;
  check('Configurar tag em coluna de até 500 centralizada (1024)', column <= 500 && Math.abs(configure.x - (configure.vw - configure.right)) <= 2, JSON.stringify(configure));
  await shot('write-configure-bigtablet-1024x1366');
} catch (error) {
  check('roteiro sem exceção', false, error instanceof Error ? error.message : String(error));
  await shot('erro').catch(() => undefined);
} finally {
  const relevant = consoleErrors.filter((text) => !/Download the React DevTools/.test(text));
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
}
