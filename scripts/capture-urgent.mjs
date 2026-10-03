import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--remote-debugging-port=9222',
  '--user-data-dir=C:\\Users\\User\\AppData\\Local\\Temp\\nfc-manager-chrome-fresh',
  '--force-prefers-color-scheme=dark',
  '--window-size=390,844',
  'about:blank',
], { stdio: 'ignore' });

async function target() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const list = await fetch('http://127.0.0.1:9222/json/list').then((response) => response.json());
      const page = list.find((item) => item.type === 'page');
      if (page) {
        return page.webSocketDebuggerUrl;
      }
    } catch {
      await delay(300);
    }
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
  }
});

function cdp(method, params = {}) {
  const next = ++id;
  socket.send(JSON.stringify({ id: next, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(method)), 20000);
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
    throw new Error(result.exceptionDetails.text || 'eval');
  }
  return result.result?.value;
}

async function shot(name) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
  console.log('shot', name);
}

async function click(label) {
  const found = await evaluate(`(() => {
    const nodes = [...document.querySelectorAll('[role=button],button,a,[role=link],[role=switch]')];
    const exact = nodes.filter((item) => (item.innerText || item.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(label)});
    const node = exact.at(-1);
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!found) {
    throw new Error(`botão não encontrado: ${label}`);
  }
  await delay(400);
}

async function waitFor(text, timeout = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const body = await evaluate('document.body ? document.body.innerText : ""');
    if (typeof body === 'string' && body.includes(text)) {
      return body;
    }
    await delay(250);
  }
  const body = await evaluate('document.body ? document.body.innerText.slice(0, 600) : ""');
  throw new Error(`timeout esperando ${text}: ${body}`);
}

await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', {
  source: 'window.__errors=[];const orig=console.error;console.error=(...args)=>{window.__errors.push(args.map((item)=>String(item)).join(" "));return orig(...args);};',
});
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await cdp('Page.navigate', { url: 'http://localhost:8081' });

let landed = '';
const start = Date.now();
while (Date.now() - start < 60000) {
  landed = await evaluate('document.body ? document.body.innerText : ""');
  if (landed.includes('Leia tags') || landed.includes('Entrar') || landed.includes('Aproxime uma tag')) {
    break;
  }
  await delay(250);
}
console.log('first-screen', landed.includes('Aproxime uma tag') ? 'home' : landed.includes('Entrar') ? 'login' : landed.includes('Leia tags') ? 'onboarding' : 'other');
const light = await evaluate(`[...document.querySelectorAll('div')].some((el) => getComputedStyle(el).backgroundColor === 'rgb(248, 250, 255)')`);
console.log('light-surface', light);
if (landed.includes('Aproxime uma tag')) {
  throw new Error('primeira execução abriu a Home');
}
if (landed.includes('Leia tags')) {
  await click('Continuar');
  await waitFor('Grave conteúdos');
  await click('Continuar');
  await waitFor('Gerencie');
  await click('Começar');
  await waitFor('Entrar');
}
await shot('03-login');
await evaluate(`(() => {
  localStorage.setItem('nfc-manager.local-users', JSON.stringify([{ id: 'user-luiz', email: 'luiz@tags.dev', fullName: 'Luiz' }]));
  localStorage.setItem('nfc-manager.local-session', 'user-luiz');
  return true;
})()`);
await cdp('Page.navigate', { url: 'http://localhost:8081' });
await waitFor('Aproxime uma tag');
const home = await evaluate('document.body.innerText');
console.log('home-has-test-mode', String(home).includes('Modo de teste'));
console.log('home-ready', String(home).includes('Tudo pronto para começar.'));
await shot('04-home');
await cdp('Page.navigate', { url: 'http://localhost:8081/(tabs)/settings' });
await waitFor('Configurações');
const settings = await evaluate('document.body.innerText');
console.log('theme-label-claro', String(settings).includes('Claro'));
await click('Avisos sonoros');
await delay(300);
await click('Vibração');
await delay(300);
await click('Reduzir animações');
await delay(300);
await shot('12-ajustes');
await cdp('Page.reload', { ignoreCache: false });
await waitFor('Configurações');
const errors = await evaluate('JSON.stringify(window.__errors || [])');
console.log('console-errors', errors);
chrome.kill();
socket.close();
process.exit(0);
