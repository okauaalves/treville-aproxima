#!/usr/bin/env node
// Falha (exit 1) se o código do app ou um bundle exportado tiver a service_role do Supabase.
// Uso: node scripts/check-secrets.mjs [pasta-do-export ...]
//   sem argumentos: só o código-fonte do app; com argumentos: também cada pasta (ex.: saída do expo export).
import { Buffer } from 'node:buffer';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_DIRS = ['app', 'components', 'core', 'lib', 'hooks', 'stores', 'utils', 'constants', 'types', 'theme'];
const SOURCE_FILES = ['app.json', 'eas.json', 'package.json'];
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.json', '.html', '.map', '.txt', '.css', '.hbc', '.bundle']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.expo']);

const FORBIDDEN_NAMES = ['EXPO_PUBLIC_SUPABASE_SERVICE_KEY', 'EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY', 'EXPO_PUBLIC_SERVICE_ROLE'];
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const SECRET_KEY = /\bsb_secret_[A-Za-z0-9_-]{10,}/g;

function jwtRole(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role ?? null;
  } catch {
    return null;
  }
}

function* walk(path) {
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat) {
    return;
  }
  if (stat.isFile()) {
    yield path;
    return;
  }
  for (const entry of readdirSync(path)) {
    if (!SKIP_DIRS.has(entry)) {
      yield* walk(join(path, entry));
    }
  }
}

export function scanText(text) {
  const findings = [];
  for (const name of FORBIDDEN_NAMES) {
    if (text.includes(name)) {
      findings.push(`variável proibida ${name}`);
    }
  }
  for (const match of text.matchAll(JWT)) {
    if (jwtRole(match[0]) === 'service_role') {
      findings.push('JWT com role "service_role"');
    }
  }
  if (SECRET_KEY.test(text)) {
    findings.push('chave secreta sb_secret_');
  }
  SECRET_KEY.lastIndex = 0;
  return findings;
}

function scan(paths) {
  const problems = [];
  let files = 0;
  for (const base of paths) {
    for (const file of walk(base)) {
      if (!TEXT_EXT.has(extname(file)) && extname(file) !== '') {
        continue;
      }
      files += 1;
      for (const finding of scanText(readFileSync(file, 'utf8'))) {
        problems.push(`${relative(root, file) || file}: ${finding}`);
      }
    }
  }
  return { problems, files };
}

const extra = process.argv.slice(2).map((dir) => resolve(dir));
const targets = [...SOURCE_DIRS.map((dir) => join(root, dir)), ...SOURCE_FILES.map((file) => join(root, file)), ...extra];
const { problems, files } = scan(targets);
if (problems.length > 0) {
  console.error(`check-secrets: ${problems.length} problema(s) em ${files} arquivo(s):`);
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}
console.log(`check-secrets: ok (${files} arquivos verificados${extra.length ? `, incluindo ${extra.map((dir) => relative(root, dir) || dir).join(', ')}` : ''}).`);
