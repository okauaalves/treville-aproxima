import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });
mkdirSync(`${OUT}/dark`, { recursive: true });
let folder = OUT;

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--remote-debugging-port=9222',
  '--user-data-dir=C:\\Users\\User\\AppData\\Local\\Temp\\nfc-manager-chrome',
  '--force-prefers-color-scheme=light',
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
  writeFileSync(`${folder}/${name}.png`, Buffer.from(data, 'base64'));
  console.log('shot', name);
}

async function click(label) {
  const found = await evaluate(`(() => {
    const nodes = [...document.querySelectorAll('[role=button],button,a,[role=link],[role=switch]')];
    const fallback = [...document.querySelectorAll('div,span')];
    const textOf = (item) => (item.innerText || item.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim();
    const match = (item) => textOf(item) === ${JSON.stringify(label)} || textOf(item).endsWith(${JSON.stringify(label)});
    const exact = nodes.filter((item) => textOf(item) === ${JSON.stringify(label)});
    const node = exact.at(-1) || nodes.find(match) || fallback.find((item) => (item.innerText || '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(label)});
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!found) {
    throw new Error(`botão não encontrado: ${label}`);
  }
  await delay(500);
}

async function waitFor(text, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const body = await evaluate('document.body ? document.body.innerText : ""');
    if (typeof body === 'string' && body.includes(text)) {
      return body;
    }
    await delay(250);
  }
  const body = await evaluate('document.body ? document.body.innerText.slice(0, 500) : ""');
  throw new Error(`timeout esperando ${text}: ${body}`);
}

await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', {
  source: 'window.__errors=[];const orig=console.error;console.error=(...args)=>{window.__errors.push(args.map((item)=>String(item)).join(" "));return orig(...args);};',
});
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await cdp('Page.navigate', { url: 'http://localhost:8081' });
const start = Date.now();
let landed = '';
while (Date.now() - start < 60000) {
  landed = await evaluate('document.body ? document.body.innerText : ""');
  if (landed.includes('Aproxime uma tag') || landed.includes('Entrar') || landed.includes('Leia tags')) {
    break;
  }
  await delay(250);
}
if (landed.includes('Aproxime uma tag')) {
  await shot('04-home');
} else {
if (landed.includes('Leia tags')) {
  await shot('02-onboarding-ler');
  await click('Continuar');
  await waitFor('Grave conteúdos');
  await shot('02-onboarding-gravar');
  await click('Continuar');
  await waitFor('Gerencie');
  await shot('02-onboarding-gerencie');
  await click('Começar');
  await waitFor('Entrar');
}
await shot('03-login');
await click('Criar conta');
await waitFor('Criar conta');
await shot('03-cadastro');
await evaluate(`(() => {
  localStorage.setItem('nfc-manager.local-users', JSON.stringify([{ id: 'user-luiz', email: 'luiz@tags.dev', fullName: 'Luiz' }]));
  localStorage.setItem('nfc-manager.local-session', 'user-luiz');
  return true;
})()`);
await cdp('Page.navigate', { url: 'http://localhost:8081' });
await waitFor('Aproxime uma tag', 20000);
await shot('04-home');
}
await cdp('Page.navigate', { url: 'http://localhost:8081/(tabs)/settings' });
await waitFor('Configurações');
const themeText = await evaluate('document.body.innerText');
if (!String(themeText).includes('Claro')) {
  await click('Tema');
  await waitFor('Claro');
  await click('Claro');
  await delay(300);
}
await click('Avisos sonoros');
await click('Vibração');
console.log('toggle-errors', await evaluate('JSON.stringify(window.__errors || [])'));
await click('Avisos sonoros');
await click('Vibração');
await cdp('Page.navigate', { url: 'http://localhost:8081/(tabs)' });
await waitFor('Aproxime uma tag');
await shot('04-home');
await click('Ler tag');
await waitFor('Modo de teste');
await shot('05-detectando');
await click('Modo de teste');
await waitFor('TAG DETECTADA', 15000);
await shot('05-detectada');
await click('Tag identificada');
await waitFor('Dados encontrados', 20000);
await shot('06-leitura');
await waitFor('Conteúdo da tag', 15000);
await shot('07-conteudo');
await cdp('Page.navigate', { url: 'http://localhost:8081/write/configure?contentType=WHATSAPP&prefill=' + encodeURIComponent(JSON.stringify({ contentType: 'WHATSAPP', phone: '+5599999999999', message: 'Olá! Gostaria de saber mais informações.' })) });
await waitFor('Configurar tag');
await shot('08-configurar');
await click('Continuar');
await waitFor('Gravando');
await shot('09-gravando');
const test = await evaluate(`(() => {
  const node = [...document.querySelectorAll('[role=button],button')].find((item) => (item.innerText || '').includes('Modo de teste'));
  if (!node) return false;
  node.click();
  return true;
})()`);
if (test) {
  await waitFor('TAG CONFIGURADA', 20000);
  await shot('09-gravada');
  await click('OK');
}
await cdp('Page.navigate', { url: 'http://localhost:8081/(tabs)/history' });
await waitFor('Histórico');
await shot('10-historico');
await cdp('Page.navigate', { url: 'http://localhost:8081/(tabs)/templates' });
await waitFor('Templates');
await shot('11-templates');
await cdp('Page.navigate', { url: 'http://localhost:8081/(tabs)/settings' });
await waitFor('Configurações');
await shot('12-ajustes');
await click('Tema');
await waitFor('Escuro');
await click('Escuro');
await delay(400);
folder = `${OUT}/dark`;
await shot('12-ajustes');
await cdp('Page.navigate', { url: 'http://localhost:8081/(tabs)' });
await waitFor('Aproxime uma tag');
await shot('04-home');
await cdp('Page.navigate', { url: 'http://localhost:8081/(tabs)/history' });
await waitFor('Histórico');
await shot('10-historico');
await cdp('Page.navigate', { url: 'http://localhost:8081/(tabs)/templates' });
await waitFor('Templates');
await shot('11-templates');
await cdp('Page.navigate', { url: 'http://localhost:8081/write/configure?contentType=WHATSAPP&prefill=' + encodeURIComponent(JSON.stringify({ contentType: 'WHATSAPP', phone: '+5599999999999', message: 'Olá!' })) });
await waitFor('Configurar tag');
await shot('08-configurar');
await cdp('Page.navigate', { url: 'http://localhost:8081/(tabs)' });
await waitFor('Aproxime uma tag');
await click('Ler tag');
await waitFor('Modo de teste');
await shot('05-detectando');
await click('Modo de teste');
await waitFor('TAG DETECTADA', 15000);
await shot('05-detectada');
await click('Tag identificada');
await waitFor('Dados encontrados', 20000);
await shot('06-leitura');
await waitFor('Conteúdo da tag', 15000);
await shot('07-conteudo');
await cdp('Page.navigate', { url: 'http://localhost:8081/write/configure?contentType=WHATSAPP&prefill=' + encodeURIComponent(JSON.stringify({ contentType: 'WHATSAPP', phone: '+5599999999999', message: 'Olá! Gostaria de saber mais informações.' })) });
await waitFor('Configurar tag');
await click('Continuar');
await waitFor('Gravando');
await shot('09-gravando');
const darkWrite = await evaluate(`(() => {
  const node = [...document.querySelectorAll('[role=button],button')].find((item) => (item.innerText || '').includes('Modo de teste'));
  if (!node) return false;
  node.click();
  return true;
})()`);
if (darkWrite) {
  await waitFor('TAG CONFIGURADA', 20000);
  await shot('09-gravada');
}
await cdp('Page.navigate', { url: 'http://localhost:8081/diagnostics' });
await waitFor('Diagnóstico');
await shot('13-diagnostico');
folder = OUT;
await cdp('Page.navigate', { url: 'http://localhost:8081/(tabs)/settings' });
await waitFor('Configurações');
await click('Tema');
await waitFor('Claro');
await click('Claro');
await delay(300);
await cdp('Page.navigate', { url: 'http://localhost:8081/diagnostics' });
await waitFor('Diagnóstico');
await shot('13-diagnostico');
const before = await evaluate('document.body.innerText');
await cdp('Page.reload', { ignoreCache: false });
await waitFor('Diagnóstico');
const after = await evaluate('document.body.innerText');
await cdp('Page.navigate', { url: 'http://localhost:8081/(tabs)/history' });
await waitFor('Histórico');
const history = await evaluate('document.body.innerText');
writeFileSync(`${OUT}/reload-check.txt`, `history:\n${history}\n\nbefore-diag:\n${before}\n\nafter-diag:\n${after}\n`);
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: 'http://localhost:8081/(tabs)' });
await waitFor('Aproxime uma tag');
await shot('14-desktop-1280');
const widths = [360, 390, 412, 430, 768, 1024, 1280, 1440];
const overflow = [];
for (const width of widths) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 768 });
  await cdp('Page.navigate', { url: 'http://localhost:8081/(tabs)' });
  await waitFor('Aproxime uma tag');
  const ok = await evaluate('document.documentElement.scrollWidth <= window.innerWidth');
  overflow.push(`${width}:${ok}`);
}
console.log('overflow-widths', overflow.join(' '));
console.log('history-has-whatsapp', String(history).includes('WhatsApp'));
console.log('console-errors', await evaluate('JSON.stringify(window.__errors || [])'));
chrome.kill();
socket.close();
process.exit(0);
