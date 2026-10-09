import { Buffer } from 'node:buffer';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = join(tmpdir(), `treville-logo-${Date.now()}`);
const WIDTH = 1024;
const HEIGHT = Math.round((WIDTH * 5.84) / 6.48);
const OUT = process.argv[2] ?? 'assets/brand/treville-logo.png';
const PAD = 24;

const svg = readFileSync('public/logo.svg', 'utf8')
  .replace(/<\?xml[^>]*>/, '')
  .replace(/<!DOCTYPE[^>]*>/, '')
  .replace(/width="[^"]*mm"/, `width="${WIDTH - 2 * PAD}"`)
  .replace(/height="[^"]*mm"/, `height="${HEIGHT - 2 * PAD}"`);
const html = `<!doctype html><html><body style="margin:0;padding:${PAD}px;overflow:hidden;background:transparent"><style>svg{display:block}</style>${svg}</body></html>`;

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9334', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });

let url = '';
for (let attempt = 0; attempt < 40 && !url; attempt += 1) {
  try {
    const list = await fetch('http://127.0.0.1:9334/json/list').then((response) => response.json());
    url = list.find((item) => item.type === 'page')?.webSocketDebuggerUrl ?? '';
  } catch {
    // Chrome ainda subindo.
  }
  if (!url) await delay(300);
}
const socket = new WebSocket(url);
await new Promise((resolve) => socket.addEventListener('open', resolve));
let id = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  pending.get(message.id)?.(message.result);
  pending.delete(message.id);
});
const cdp = (method, params = {}) =>
  new Promise((resolve) => {
    const next = ++id;
    pending.set(next, resolve);
    socket.send(JSON.stringify({ id: next, method, params }));
  });

await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
await cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
await cdp('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
await delay(800);
const { data } = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 } });
writeFileSync(OUT, Buffer.from(data, 'base64'));
console.log('png', OUT, `${WIDTH}x${HEIGHT}`);
chrome.kill();
socket.close();
await delay(400);
try {
  rmSync(PROFILE, { recursive: true, force: true });
} catch {
  // Chrome pode segurar arquivos por alguns ms.
}
process.exit(0);
