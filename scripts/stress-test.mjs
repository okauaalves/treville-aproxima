#!/usr/bin/env node
// Teste de carga do redirect das plaquinhas.
//
// Uso:
//   SUPABASE_URL=https://<ref>.supabase.co LINK_ID=K7M2QX node scripts/stress-test.mjs
//   node scripts/stress-test.mjs --url https://<ref>.supabase.co --link K7M2QX [--concurrency 50] [--rounds 10]
//   node scripts/stress-test.mjs --mock            (servidor local que imita o redirect; não toca em produção)
//
// Não usa chave nenhuma: a função redirect é pública (verify_jwt = false).
// Cuidado: contra produção, cada requisição conta como invocação (cota do plano) e, até o rate limit,
// como scan. Rode contra um projeto de teste.
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  return fallback;
}

const useMock = process.argv.includes('--mock');
const concurrency = Number(arg('concurrency', process.env.CONCURRENCY ?? 50));
const rounds = Number(arg('rounds', process.env.ROUNDS ?? 10));
const linkId = String(arg('link', process.env.LINK_ID ?? (useMock ? 'K7M2QX' : '')));

if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(rounds) || rounds < 1) {
  console.error('concurrency e rounds precisam ser inteiros positivos.');
  process.exit(2);
}
if (!/^[A-Z0-9]{4,8}$/.test(linkId)) {
  console.error('Informe LINK_ID (ou --link) com 4 a 8 letras maiúsculas/números.');
  process.exit(2);
}

/** Imita a função: valida o id, 302 para o destino e 404 para id desconhecido, com um pequeno atraso. */
function startMock() {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const id = (request.url ?? '').split('?')[0].split('/').filter(Boolean).pop() ?? '';
      const delayMs = 5 + Math.random() * 25;
      setTimeout(() => {
        if (!/^[A-Z0-9]{4,8}$/.test(id)) {
          response.writeHead(400).end();
        } else if (id !== linkId) {
          response.writeHead(404).end();
        } else {
          response.writeHead(302, { Location: 'https://example.com/destino', 'Cache-Control': 'no-store' }).end();
        }
      }, delayMs);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

let server = null;
let base = String(arg('url', process.env.SUPABASE_URL ?? '')).replace(/\/+$/, '');
if (useMock) {
  server = await startMock();
  base = `http://127.0.0.1:${server.address().port}`;
}
if (!base) {
  console.error('Informe SUPABASE_URL (ou --url), ou use --mock.');
  process.exit(2);
}

const target = `${base}/functions/v1/redirect/${linkId}`;
const durations = [];
const statuses = new Map();
let success = 0;
let failures = 0;

async function hit() {
  const started = performance.now();
  try {
    const response = await fetch(target, { redirect: 'manual', headers: { 'User-Agent': 'Treville-Aproxima-StressTest/1' } });
    await response.arrayBuffer().catch(() => undefined);
    statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
    if (response.status >= 300 && response.status < 400) {
      success += 1;
    } else {
      failures += 1;
    }
  } catch {
    statuses.set('erro de rede', (statuses.get('erro de rede') ?? 0) + 1);
    failures += 1;
  } finally {
    durations.push(performance.now() - started);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

console.log(`Alvo: ${useMock ? 'servidor mock local' : target}`);
console.log(`Carga: ${concurrency} concorrentes x ${rounds} rodadas = ${concurrency * rounds} requisições\n`);

const startedAll = performance.now();
for (let round = 1; round <= rounds; round += 1) {
  const roundStart = performance.now();
  await Promise.all(Array.from({ length: concurrency }, () => hit()));
  console.log(`Rodada ${String(round).padStart(2, ' ')}: ${Math.round(performance.now() - roundStart)} ms`);
}
const totalMs = performance.now() - startedAll;

const sorted = [...durations].sort((a, b) => a - b);
const average = sorted.reduce((sum, value) => sum + value, 0) / (sorted.length || 1);
const total = success + failures;

console.log('\nRelatório');
console.log(`  Total:          ${total}`);
console.log(`  Sucesso (3xx):  ${success} (${total ? ((success / total) * 100).toFixed(1) : '0.0'}%)`);
console.log(`  Falhas:         ${failures}`);
console.log(`  Média:          ${average.toFixed(1)} ms`);
console.log(`  p95:            ${percentile(sorted, 95).toFixed(1)} ms`);
console.log(`  Máximo:         ${(sorted[sorted.length - 1] ?? 0).toFixed(1)} ms`);
console.log(`  Vazão:          ${(total / (totalMs / 1000)).toFixed(1)} req/s`);
console.log(`  Status:         ${[...statuses.entries()].map(([status, count]) => `${status}=${count}`).join(', ')}`);

server?.close();
process.exit(failures > 0 ? 1 : 0);
