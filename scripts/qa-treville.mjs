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
  let video = null;
  const splashStart = Date.now();
  while (Date.now() - splashStart < 60000) {
    video = await evaluate(`(() => { const v = document.querySelector('video[data-testid=splash-video]'); return v ? { t: v.currentTime, d: v.duration, paused: v.paused, muted: v.muted, ended: v.ended, fit: getComputedStyle(v).objectFit, w: v.getBoundingClientRect().width, h: v.getBoundingClientRect().height } : null; })()`);
    if (video && video.t > 0.6) {
      await shot('video-splash');
      break;
    }
    if ((await bodyText()).includes('Antes de começar')) {
      break;
    }
    await delay(80);
  }
  check('vídeo de abertura toca sozinho (autoplay muted)', video && video.t > 0.6 && video.muted && !video.paused, JSON.stringify(video));
  check('vídeo cobre a tela (object-fit cover)', video && video.fit === 'cover' && video.w >= 389 && video.h >= 843);
  let videoEnded = false;
  const endStart = Date.now();
  while (Date.now() - endStart < 30000) {
    const state = await evaluate(`(() => { const v = document.querySelector('video[data-testid=splash-video]'); return v ? v.ended : 'gone'; })()`);
    if (state === true || state === 'gone') {
      videoEnded = true;
      break;
    }
    await delay(100);
  }
  check('splash sai depois do fim do vídeo', videoEnded, `duração ${video?.d?.toFixed?.(2)}s`);

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
  check('login com subtítulo NFC Manager by Tréville', login.includes('NFC Manager by Tréville'));
  await delay(600);
  await shot('brand-login');
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
  body = await waitFor('Aproxime uma tag');
  check('cadastro leva à Home', true);
  check('Home com Tréville', body.includes('Tréville'));
  check('Home sem Modo de teste', !body.includes('Modo de teste'));
  check('logo no header da Home', await evaluate(`!!document.querySelector('[aria-label="Logo Tréville"]')`));
  await delay(800);
  await shot('brand-home');
  const lightButtons = await rectOf(['Ler tag', 'Gravar tag']);
  if (lightButtons) {
    await shot('glass-buttons-light', lightButtons);
  }
  await overflowBoth('home');

  // 6. Ler tag (web sem Web NFC).
  await click('Ler tag');
  body = await waitFor('Web NFC sem suporte');
  check('Ler → tela NFC indisponível', body.includes('Tentar novamente'));
  check('Modo de teste rotulado em DEV', body.includes('Modo de teste (simulação)'));
  await shot('nfc-indisponivel');
  await overflowBoth('nfc-indisponivel');
  await click('Modo de teste (simulação)');
  await waitFor('AGUARDANDO TAG');
  await click('Simular tag (modo de teste)');
  body = await waitFor('TAG DETECTADA');
  await click('Ver conteúdo');
  body = await waitFor('Detectar', 15000);
  await delay(2500);
  body = await bodyText();
  check('leitura simulada mostra conteúdo', /Conte[uú]do|Registro|NDEF|https?:/i.test(body), body.slice(0, 120).replace(/\n/g, ' | '));

  // 7. Gravar → identificar → escolher → Cartão personalizado.
  await go('/');
  await waitFor('Aproxime uma tag');
  await click('Gravar tag');
  await waitFor('Web NFC sem suporte');
  await click('Modo de teste (simulação)');
  await waitFor('Identificar tag');
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
  await overflowBoth('configurações');
  await click('Termos de uso');
  body = await waitFor('Termos de uso');
  check('Termos: seções', ['Uso responsável', 'Limitações de responsabilidade', 'Dados coletados', 'Privacidade', 'Vigência'].every((item) => body.includes(item)));
  await shot('termos');
  await overflowBoth('termos');

  await setTheme('Escuro');
  await go('/');
  await waitFor('Aproxime uma tag');
  await delay(1200);
  await shot('dark/glass-home');
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
    if (body.includes('Painel Admin — Tréville')) sawAdmin = true;
    if (body.includes('Aproxime uma tag')) break;
    await delay(150);
  }
  const adminUrl = await evaluate('location.pathname');
  check('/admin como não-admin redireciona para as tabs', body.includes('Aproxime uma tag') && !sawAdmin, `url=${adminUrl} tela=${body.slice(0, 80).replace(/\n/g, ' | ')}`);

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
  await waitFor('Aproxime uma tag');
  check('login local entra na Home', true);
  await cdp('Page.reload', { ignoreCache: false });
  await delay(400);
  const reloadStart = Date.now();
  let sawOnboarding = false;
  while (Date.now() - reloadStart < 30000) {
    body = await bodyText();
    if (body.includes('Antes de começar')) sawOnboarding = true;
    if (body.includes('Aproxime uma tag')) break;
    await delay(150);
  }
  check('reload mantém sessão e não repete onboarding', body.includes('Aproxime uma tag') && !sawOnboarding);

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
  await waitFor('Aproxime uma tag');
  await go('/settings');
  body = await waitFor('Configurações');
  check('Painel Admin visível para admin', body.includes('Painel Admin'));
  await click('Painel Admin');
  body = await waitFor('Supabase não configurado', 20000);
  check('admin mostra erro claro sem Supabase', body.includes('Painel Admin — Tréville'));
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
