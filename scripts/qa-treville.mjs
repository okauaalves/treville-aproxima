import { Buffer } from 'node:buffer';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.QA_BASE ?? 'http://localhost:8090';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'screenshots';
const PROFILE = join(tmpdir(), `treville-qa-${Date.now()}`);
mkdirSync(join(OUT, 'dark'), { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--remote-debugging-port=9333',
  `--user-data-dir=${PROFILE}`,
  '--window-size=390,844',
  'about:blank',
], { stdio: 'ignore' });

const results = [];
const consoleErrors = [];
const consoleWarnings = [];

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function target() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const list = await fetch('http://127.0.0.1:9333/json/list').then((response) => response.json());
      const page = list.find((item) => item.type === 'page');
      if (page) {
        return page.webSocketDebuggerUrl;
      }
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
  if (message.method === 'Runtime.consoleAPICalled') {
    const text = message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ');
    if (message.params.type === 'error' || message.params.type === 'assert') {
      consoleErrors.push(text.slice(0, 400));
    } else if (message.params.type === 'warning') {
      consoleWarnings.push(text.slice(0, 200));
    }
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails;
    consoleErrors.push(`EXCEPTION ${details.exception?.description ?? details.text}`.slice(0, 400));
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    consoleErrors.push(`LOG ${message.params.entry.text} ${message.params.entry.url ?? ''}`.slice(0, 400));
  }
});

function cdp(method, params = {}) {
  const next = ++id;
  socket.send(JSON.stringify({ id: next, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), 30000);
    pending.set(next, (message) => {
      clearTimeout(timer);
      if (message.error) {
        reject(new Error(JSON.stringify(message.error)));
        return;
      }
      resolve(message.result);
    });
  });
}

async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'eval');
  }
  return result.result?.value;
}

async function shot(name, clip) {
  const params = { format: 'png' };
  if (clip) {
    params.clip = { ...clip, scale: 2 };
  }
  const { data } = await cdp('Page.captureScreenshot', params);
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log('     shot', `${OUT}/${name}.png`);
}

const bodyText = () => evaluate('document.body ? document.body.innerText : ""');

async function waitFor(text, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const body = await bodyText();
    if (typeof body === 'string' && body.includes(text)) {
      return body;
    }
    await delay(150);
  }
  const body = await bodyText();
  throw new Error(`timeout esperando "${text}". Tela: ${String(body).slice(0, 500)}`);
}

async function click(label, { contains = false } = {}) {
  const found = await evaluate(`(() => {
    const want = ${JSON.stringify(label)};
    const norm = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const nodes = [...document.querySelectorAll('[role=button],button,a,[role=link],[role=switch],[role=tab]')]
      .filter((item) => { const r = item.getBoundingClientRect(); return r.width > 0 && r.height > 0 && item.checkVisibility({ visibilityProperty: true }); });
    const match = (item) => {
      const values = [norm(item.getAttribute('aria-label')), norm(item.innerText)];
      return values.some((value) => (${contains} ? value.includes(want) : value === want));
    };
    const node = nodes.filter(match).at(-1);
    if (!node) return false;
    node.scrollIntoView({ block: 'center' });
    node.click();
    return true;
  })()`);
  if (!found) {
    throw new Error(`botão não encontrado: ${label}`);
  }
  await delay(450);
}

async function fill(label, value, nth = 0) {
  const ok = await evaluate(`(() => {
    const inputs = [...document.querySelectorAll('input,textarea')].filter((input) => {
      const r = input.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || !input.checkVisibility({ visibilityProperty: true })) return false;
      const container = input.parentElement && input.parentElement.parentElement;
      const first = container && container.firstElementChild;
      return first && first !== input.parentElement && (first.innerText || '').trim() === ${JSON.stringify(label)};
    });
    const input = inputs[${nth}];
    if (!input) return false;
    const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!ok) {
    throw new Error(`campo não encontrado: ${label}`);
  }
  await delay(120);
}

async function rectOf(labels) {
  return evaluate(`(() => {
    const wanted = ${JSON.stringify(labels)};
    const nodes = [...document.querySelectorAll('[role=button],[role=switch]')].filter((node) => wanted.includes((node.getAttribute('aria-label') || node.innerText || '').trim()));
    if (!nodes.length) return null;
    const rects = nodes.map((node) => node.getBoundingClientRect());
    const x = Math.max(0, Math.min(...rects.map((r) => r.left)) - 12);
    const y = Math.max(0, Math.min(...rects.map((r) => r.top)) - 12);
    const right = Math.max(...rects.map((r) => r.right)) + 12;
    const bottom = Math.max(...rects.map((r) => r.bottom)) + 12;
    return { x, y, width: Math.min(innerWidth, right) - x, height: bottom - y };
  })()`);
}

async function overflow(screen) {
  const info = await evaluate(`(() => {
    const width = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll('body *')].filter((node) => {
      const r = node.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right <= width + 1) return false;
      let parent = node.parentElement;
      while (parent) {
        const style = getComputedStyle(parent);
        if (/(auto|scroll|hidden)/.test(style.overflowX) && parent.getBoundingClientRect().right <= width + 1) return false;
        parent = parent.parentElement;
      }
      return true;
    });
    return { scroll: document.documentElement.scrollWidth > width, count: offenders.length, sample: offenders.slice(0, 3).map((n) => n.tagName + ':' + (n.innerText || '').slice(0, 30)) };
  })()`);
  check(`sem overflow horizontal: ${screen}`, !info.scroll && info.count === 0, info.count ? JSON.stringify(info.sample) : '');
}

async function viewport(width, height) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  await delay(400);
}

async function overflowBoth(screen) {
  await viewport(360, 800);
  await overflow(`${screen} @360x800`);
  await viewport(390, 844);
  await overflow(`${screen} @390x844`);
}

async function go(path) {
  await cdp('Page.navigate', { url: `${BASE}${path}` });
}

async function setTheme(label) {
  await go('/settings');
  await waitFor('Configurações');
  await click('Tema');
  await click(label);
  await delay(500);
}

try {
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Log.enable');
  await viewport(390, 844);
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

  // 1. Storage limpo: perfil novo do Chrome (sem IndexedDB/localStorage).
  await go('/');
  let splashSeenAt = 0;
  const splashStart = Date.now();
  while (Date.now() - splashStart < 60000) {
    if (await evaluate(`Boolean(document.querySelector('[data-testid=splash-intro]'))`)) {
      splashSeenAt = Date.now();
      await delay(700);
      await shot('splash-intro');
      break;
    }
    if ((await bodyText()).includes('Antes de começar')) {
      break;
    }
    await delay(50);
  }
  check('abertura animada aparece', splashSeenAt > 0);
  let splashGone = false;
  const endStart = Date.now();
  while (Date.now() - endStart < 30000) {
    if (!(await evaluate(`Boolean(document.querySelector('[data-testid=splash-intro]'))`))) {
      splashGone = true;
      break;
    }
    await delay(100);
  }
  check('splash sai depois da animação', splashGone, `${((Date.now() - splashSeenAt) / 1000).toFixed(2)}s visível`);

  // 2. Onboarding (primeira vez).
  const onboarding = await waitFor('Antes de começar');
  check('onboarding na 1ª abertura', onboarding.includes('Como instalar este app') && onboarding.includes('Não grave tags de outras pessoas sem permissão'));
  await delay(1200);
  await shot('onboarding-instalacao');
  await overflowBoth('onboarding');
  await click('Entendi, continuar');

  // 3. Login em modo local + validação.
  const login = await waitFor('Entrar');
  check('login indica modo local', login.includes('Modo local'));
  check('login com Tréville Aproxima + subtítulo', login.includes('Tréville Aproxima') && login.includes('Aproxime. Configure. Conecte.') && !login.includes('NFC Manager'));
  await delay(600);
  await shot('brand-login');
  await shot('v2-login');
  const logoRect = await evaluate(`(() => { const r = document.querySelector('[aria-label="Logo Tréville"]').getBoundingClientRect(); return { x: r.left - 8, y: r.top - 8, width: r.width + 16, height: r.height + 16 }; })()`);
  await cdp('Page.captureScreenshot', { format: 'png', clip: { ...logoRect, scale: 4 } }).then(({ data }) => {
    writeFileSync(join(OUT, 'brand-logo-new.png'), Buffer.from(data, 'base64'));
    console.log('     shot', `${OUT}/brand-logo-new.png`);
  });
  await overflowBoth('login');
  await click('Entrar');
  let body = await waitFor('Informe um e-mail válido.');
  check('validação: e-mail inválido', body.includes('Informe um e-mail válido.'));
  await fill('E-mail', 'luiz@exemplo.com');
  await fill('Senha', '123');
  await click('Entrar');
  body = await waitFor('A senha precisa ter ao menos 6 caracteres.');
  check('validação: senha curta', true);
  await fill('Senha', '123456');
  await click('Entrar');
  body = await waitFor('E-mail ou senha inválidos.');
  check('erro amigável para conta inexistente', true);

  // 4. Cadastro.
  await click('Criar conta');
  await waitFor('Nome completo');
  await fill('Nome completo', 'Luiz Teste');
  await fill('E-mail', 'luiz@exemplo.com');
  await fill('Senha', '123456');
  await fill('Confirmar senha', '654321');
  await click('Criar conta');
  body = await waitFor('As senhas não coincidem.');
  check('validação: senhas diferentes', true);
  await fill('Confirmar senha', '123456');
  await click('Criar conta');

  // 5. Home.
  body = await waitFor('Toque para ler');
  check('cadastro leva à Home', true);
  check('Home com Tréville Aproxima', body.includes('Tréville') && body.includes('Aproxima'));
  check('Home com botão único Ler tag + Gravar tag', body.includes('Ler tag') && body.includes('Gravar tag'));
  check('Home sem Modo leitura/Diagnóstico', !body.includes('Modo leitura') && !body.includes('Diagnóstico NFC'));
  check('Home sem Modo de teste', !body.includes('Modo de teste'));
  check('título da aba', (await evaluate('document.title')).includes('Tréville Aproxima'), await evaluate('document.title'));
  check('logo no header da Home', await evaluate(`!!document.querySelector('[aria-label="Logo Tréville"]')`));
  await delay(800);
  await shot('brand-home');
  await shot('v2-home');
  const lightButtons = await rectOf(['Ler tag', 'Gravar tag']);
  if (lightButtons) {
    await shot('glass-buttons-light', lightButtons);
    await shot('v2-buttons', lightButtons);
  }
  const buttonLook = await evaluate(`(() => { const n = [...document.querySelectorAll('[role=button]')].find((x) => x.getAttribute('aria-label') === 'Ler tag'); if (!n) return null; const s = getComputedStyle(n); const r = n.getBoundingClientRect(); return { bg: s.backgroundColor, w: Math.round(r.width), h: Math.round(r.height), radius: s.borderTopLeftRadius }; })()`);
  check('Ler tag: botão circular sólido navy', !!buttonLook && buttonLook.bg === 'rgb(30, 64, 175)' && Math.abs(buttonLook.w - buttonLook.h) <= 1 && parseFloat(buttonLook.radius) >= buttonLook.w / 2 - 1, JSON.stringify(buttonLook));
  await viewport(360, 800);
  await delay(500);
  const header = await evaluate(`(() => { const h = document.querySelector('[aria-label="Tréville Aproxima"]'); const r = h.getBoundingClientRect(); return { right: r.right, width: innerWidth, text: h.innerText }; })()`);
  check('header da Home cabe em 360px sem truncar', header.right <= header.width && header.text.includes('Aproxima'), JSON.stringify(header));
  await shot('v2-home-360');
  await viewport(390, 844);
  await overflowBoth('home');

  // 6. Ler tag (web sem Web NFC) → cartão virtual em /tag-result.
  await click('Ler tag');
  body = await waitFor('Web NFC sem suporte');
  check('Ler → tela NFC indisponível', body.includes('Tentar novamente'));
  check('Modo de teste rotulado em DEV', body.includes('Modo de teste (simulação)'));
  await shot('nfc-indisponivel');
  await overflowBoth('nfc-indisponivel');
  await click('Modo de teste (simulação)');
  body = await waitFor('Aproxime a tag');
  check('tela de leitura com instrução curta', body.includes('Ler tag') && body.includes('Aproxime a tag'));
  await delay(500);
  await shot('v2-modo-leitura');
  await click('Simular tag (modo de teste)');
  body = await waitFor('Tag verificada', 15000);
  check('leitura vai direto ao cartão virtual', (await evaluate('location.pathname')) === '/tag-result' && !body.includes('TAG DETECTADA'), await evaluate('location.pathname'));
  check('cartão mostra diagnóstico resumido', body.includes('Tag funcional') && body.includes('Capacidade'));
  check('cartão não abre link sozinho', (await evaluate('location.host')) === new URL(BASE).host);
  await shot('tag-result');
  await overflowBoth('tag-result');
  await click('Ver mais detalhes');
  body = await waitFor('Registros NDEF');
  check('detalhes expandem UID/tecnologias/registros', body.includes('UID') && body.includes('Tecnologias') && body.includes('Bytes livres'));
  await click('Ler novamente');
  body = await waitFor('Aproxime a tag');
  check('Ler novamente rearma a leitura no cartão', true);
  await click('Fechar');
  await waitFor('Toque para ler');
  check('X do cartão volta à Home', true);

  // 7. Gravar → identificar → escolher → Cartão personalizado.
  await go('/');
  await waitFor('Toque para ler');
  await click('Gravar tag');
  await waitFor('Web NFC sem suporte');
  await click('Modo de teste (simulação)');
  body = await waitFor('Identificar tag');
  check('identificação pede para aproximar a tag', body.includes('Aproxime a tag'));
  await delay(500);
  await shot('v2-scan');
  await click('Simular tag (modo de teste)');
  body = await waitFor('TAG DETECTADA');
  check('identificação mostra modelo/capacidade/gravável/conteúdo', body.includes('Modelo') && body.includes('bytes') && /Gravável|Somente leitura/.test(body) && /Conteúdo atual|Sem conteúdo/.test(body));
  await shot('gravar-identificar');
  await click('Escolher tipo de conteúdo');
  body = await waitFor('Escolher conteúdo');
  check('escolha de tipo sem pré-seleção', body.includes('Cartão personalizado'));
  await click('Cartão personalizado');
  await waitFor('Campos');
  await fill('Título', 'Cartão do Luiz');
  await fill('Rótulo', 'Instagram');
  await fill('Valor', '@treville');
  await delay(400);
  await shot('cartao-personalizado');
  await overflowBoth('configurar cartão');
  await click('Salvar como template');
  await waitFor('Template salvo.');
  check('salvar como template', true);
  await click('Continuar');
  await waitFor('Gravando tag');
  await delay(600);
  await click('Simular tag (modo de teste)');
  body = await waitFor('TAG CONFIGURADA', 30000);
  check('gravação verificada (TAG CONFIGURADA)', body.includes('conteúdo foi verificado'));

  // 8. Templates.
  await go('/templates');
  body = await waitFor('Cartão do Luiz', 20000);
  check('template aparece em Templates', true);
  await overflowBoth('templates');

  // 9. Configurações: toggles e tema escuro.
  await go('/settings');
  body = await waitFor('Configurações');
  check('Configurações tem Conta e Sair', body.includes('Conta') && body.includes('Sair'));
  check('Painel Admin oculto para não-admin', !body.includes('Painel Admin'));
  const nested = await evaluate(`[...document.querySelectorAll('[role=button] [role=button],[role=button] [role=switch],button button')].length`);
  check('sem botão aninhado em Configurações', nested === 0, String(nested));
  await evaluate(`[...document.querySelectorAll('[role=switch]')].find((n) => n.getAttribute('aria-label') === 'Vibração').scrollIntoView({ block: 'center' })`);
  await delay(300);
  const toggles = await rectOf(['Avisos sonoros', 'Vibração']);
  await evaluate(`[...document.querySelectorAll('[role=switch]')].find((n) => n.getAttribute('aria-label') === 'Vibração').click()`);
  await delay(90);
  await shot('toggle-goo', toggles ?? undefined);
  await delay(400);
  await delay(800);
  await click('Vibração');
  await evaluate(`[...document.querySelectorAll('*')].forEach((node) => { if (node.scrollTop > 0) node.scrollTop = 0; })`);
  await delay(300);
  await shot('v2-settings');
  await overflowBoth('configurações');
  await click('Termos de uso');
  body = await waitFor('Termos de uso');
  check('Termos: seções', ['Uso responsável', 'Limitações de responsabilidade', 'Dados coletados', 'Privacidade', 'Vigência'].every((item) => body.includes(item)));
  await shot('termos');
  await overflowBoth('termos');

  await setTheme('Escuro');
  await go('/');
  await waitFor('Toque para ler');
  await delay(1200);
  await shot('dark/glass-home');
  await shot('dark/v2-home');
  const darkButtons = await rectOf(['Ler tag', 'Gravar tag']);
  if (darkButtons) {
    await shot('glass-buttons-dark', darkButtons);
  }
  await go('/settings');
  await waitFor('Configurações');
  await delay(800);
  await shot('dark/settings');
  await setTheme('Claro');

  // 10. /admin como não-admin redireciona.
  await go('/admin');
  const adminStart = Date.now();
  let sawAdmin = false;
  while (Date.now() - adminStart < 20000) {
    body = await bodyText();
    if (body.includes('Painel Admin — Tréville Aproxima')) sawAdmin = true;
    if (body.includes('Toque para ler')) break;
    await delay(150);
  }
  const adminUrl = await evaluate('location.pathname');
  check('/admin como não-admin redireciona para as tabs', body.includes('Toque para ler') && !sawAdmin, `url=${adminUrl} tela=${body.slice(0, 80).replace(/\n/g, ' | ')}`);

  // 11. Sair → login → reload sem onboarding.
  await go('/settings');
  await waitFor('Configurações');
  await click('Sair');
  await waitFor('Encerrar a sessão neste aparelho?');
  await click('Sair');
  await waitFor('Esqueci minha senha');
  check('Sair volta ao login', true);
  await fill('E-mail', 'luiz@exemplo.com');
  await fill('Senha', '123456');
  await click('Entrar');
  await waitFor('Toque para ler');
  check('login local entra na Home', true);
  await cdp('Page.reload', { ignoreCache: false });
  await delay(400);
  const reloadStart = Date.now();
  let sawOnboarding = false;
  while (Date.now() - reloadStart < 30000) {
    body = await bodyText();
    if (body.includes('Antes de começar')) sawOnboarding = true;
    if (body.includes('Toque para ler')) break;
    await delay(150);
  }
  check('reload mantém sessão e não repete onboarding', body.includes('Toque para ler') && !sawOnboarding);

  // 12. Admin sem Supabase configurado (conta local com o e-mail admin).
  await go('/settings');
  await waitFor('Configurações');
  await click('Sair');
  await waitFor('Encerrar a sessão neste aparelho?');
  await click('Sair');
  await waitFor('Esqueci minha senha');
  await click('Criar conta');
  await waitFor('Nome completo');
  await fill('Nome completo', 'Admin');
  await fill('E-mail', 'previaemailofc@gmail.com');
  await fill('Senha', '123456');
  await fill('Confirmar senha', '123456');
  await click('Criar conta');
  await waitFor('Toque para ler');
  await go('/settings');
  body = await waitFor('Configurações');
  check('Painel Admin visível para admin', body.includes('Painel Admin'));
  await click('Painel Admin');
  body = await waitFor('Supabase não configurado', 20000);
  check('admin mostra erro claro sem Supabase', body.includes('Painel Admin — Tréville Aproxima'));
  await shot('admin-nao-configurado');
  await overflowBoth('admin');
} catch (error) {
  check('roteiro concluído', false, error instanceof Error ? error.message : String(error));
  try {
    await shot('qa-falha');
  } catch {
    // sem screenshot
  }
}

const relevant = consoleErrors.filter((text) => !/Download the React DevTools/.test(text));
check('console sem erros', relevant.length === 0, relevant.slice(0, 8).join(' || '));
check('sem "AccessibilityInfo is not defined"', !consoleErrors.some((text) => text.includes('AccessibilityInfo is not defined')));
check('sem aviso de botão aninhado', ![...consoleErrors, ...consoleWarnings].some((text) => /cannot be a descendant of|cannot contain a nested/.test(text)));
const failed = results.filter((item) => !item.ok);
console.log(JSON.stringify({ total: results.length, failed: failed.length, warnings: [...new Set(consoleWarnings)].slice(0, 10) }, null, 2));
chrome.kill();
socket.close();
await delay(500);
try {
  rmSync(PROFILE, { recursive: true, force: true });
} catch {
  // Chrome pode segurar arquivos por alguns ms.
}
process.exit(failed.length ? 1 : 0);
