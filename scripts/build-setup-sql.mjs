#!/usr/bin/env node
/**
 * Gera supabase/setup_completo.sql concatenando as migrações em ordem.
 *
 *   node scripts/build-setup-sql.mjs                 # só migrações commitadas (conteúdo do HEAD)
 *   node scripts/build-setup-sql.mjs --working-tree  # tudo que está em supabase/migrations no disco
 *   node scripts/build-setup-sql.mjs --check         # não grava; falha se o arquivo estiver desatualizado
 *
 * Funções que mudam o tipo de retorno entre migrações ganham `drop function if exists` antes de cada
 * definição, senão a segunda execução falharia com "cannot change return type of existing function".
 * O script também recusa comandos que não são idempotentes (create table/index sem if not exists etc.).
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dir = 'supabase/migrations';
const out = join(root, 'supabase', 'setup_completo.sql');
const args = new Set(process.argv.slice(2));
const fromDisk = args.has('--working-tree');

function git(...params) {
  return execFileSync('git', params, { cwd: root, encoding: 'utf8' });
}

function listMigrations() {
  const names = fromDisk
    ? readdirSync(join(root, dir)).filter((name) => name.endsWith('.sql')).map((name) => `${dir}/${name}`)
    : git('ls-tree', '--name-only', 'HEAD', `${dir}/`).split('\n').filter((name) => name.endsWith('.sql'));
  return names.sort().map((path) => ({
    path,
    sql: (fromDisk ? readFileSync(join(root, path), 'utf8') : git('show', `HEAD:${path}`)).replace(/\r\n/g, '\n').trimEnd(),
  }));
}

const FN_RE = /create\s+(or\s+replace\s+)?function\s+([\w.]+)\s*\(([^)]*)\)\s*returns\s+(setof\s+[\w.]+|[\w.]+)/gi;

function normalizeArgTypes(raw) {
  return raw
    .split(',')
    .map((part) => part.trim().replace(/\s+default\s+.*$/i, ''))
    .filter(Boolean)
    .map((part) => {
      const tokens = part.split(/\s+/);
      return (tokens.length > 1 ? tokens.slice(1) : tokens).join(' ').toLowerCase();
    })
    .join(', ');
}

function functionsWithChangingReturn(migrations) {
  const returns = new Map();
  for (const { sql } of migrations) {
    for (const match of sql.matchAll(FN_RE)) {
      const key = `${match[2].toLowerCase()}(${normalizeArgTypes(match[3])})`;
      const set = returns.get(key) ?? new Set();
      set.add(match[4].toLowerCase());
      returns.set(key, set);
    }
  }
  return new Set([...returns].filter(([, set]) => set.size > 1).map(([key]) => key));
}

function guardReturnChanges(sql, changing) {
  return sql.replace(FN_RE, (whole, _orReplace, name, rawArgs, _returns, offset, source) => {
    const key = `${name.toLowerCase()}(${normalizeArgTypes(rawArgs)})`;
    if (!changing.has(key)) {
      return whole;
    }
    const before = source.slice(Math.max(0, offset - 200), offset).toLowerCase();
    if (before.includes(`drop function if exists ${key}`)) {
      return whole;
    }
    return `drop function if exists ${key};\n${whole}`;
  });
}

function strip(sql) {
  return sql
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, ' ')
    .replace(/--.*$/gm, '')
    .toLowerCase();
}

function idempotencyProblems(path, sql) {
  const body = strip(sql);
  const problems = [];
  const check = (re, ok, label) => {
    for (const match of body.matchAll(re)) {
      if (!ok(match)) {
        problems.push(`${path}: ${label}: ${match[0].trim().slice(0, 80)}`);
      }
    }
  };
  check(/create\s+table\s+(?!if\s+not\s+exists)\S+/g, () => false, 'create table sem if not exists');
  check(/create\s+(unique\s+)?index\s+(?!if\s+not\s+exists)\S+/g, () => false, 'create index sem if not exists');
  check(/create\s+extension\s+(?!if\s+not\s+exists)\S+/g, () => false, 'create extension sem if not exists');
  check(/create\s+policy\s+("[^"]+"|\S+)\s+on\s+(\S+)/g, (m) => body.includes(`drop policy if exists ${m[1]} on ${m[2]}`), 'create policy sem drop policy if exists');
  check(/create\s+trigger\s+(\S+)\s+[\s\S]*?\son\s+(\S+)/g, (m) => body.includes(`drop trigger if exists ${m[1]} on ${m[2]}`), 'create trigger sem drop trigger if exists');
  check(/create\s+function\s+([\w.]+)/g, (m) => body.includes(`drop function if exists ${m[1]}`), 'create function sem drop/or replace');
  check(/add\s+constraint\s+(\S+)/g, (m) => body.includes(`drop constraint if exists ${m[1]}`), 'add constraint sem drop constraint if exists');
  return problems;
}

const migrations = listMigrations();
if (migrations.length === 0) {
  console.error('Nenhuma migração encontrada.');
  process.exit(1);
}
const changing = functionsWithChangingReturn(migrations);
const sections = migrations.map(({ path, sql }) => ({ path, sql: guardReturnChanges(sql, changing) }));
const problems = sections.flatMap(({ path, sql }) => idempotencyProblems(path, sql));
if (problems.length) {
  console.error('Comandos não idempotentes:\n' + problems.join('\n'));
  process.exit(1);
}

const header = `-- =============================================================================
-- Tréville Aproxima — setup completo do banco (Supabase)
--
-- Para colar no SQL Editor se não usar a CLI; equivale a todas as migrações em ordem; idempotente.
-- Pode rodar de novo sem efeito colateral. Quem usa a CLI deve continuar com \`supabase db push\`.
--
-- NÃO EDITE À MÃO. Gerado por scripts/build-setup-sql.mjs a partir de ${dir}/
-- (${fromDisk ? 'arquivos do disco' : 'migrações commitadas no HEAD'}):
${migrations.map(({ path }) => `--   - ${path.split('/').pop()}`).join('\n')}
${changing.size ? `--\n-- Funções que mudam de retorno entre migrações (recebem drop antes de recriar):\n${[...changing].map((key) => `--   - ${key}`).join('\n')}\n` : ''}--
-- Requer: extensão pg_cron (Database → Extensions) para a limpeza automática agendada.
-- =============================================================================
`;

const content = `${header}\n${sections.map(({ path, sql }) => `-- -----------------------------------------------------------------------------\n-- ${path.split('/').pop()}\n-- -----------------------------------------------------------------------------\n\n${sql}\n`).join('\n')}`;

if (args.has('--check')) {
  const current = existsSync(out) ? readFileSync(out, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== content) {
    console.error('supabase/setup_completo.sql está desatualizado. Rode: node scripts/build-setup-sql.mjs');
    process.exit(1);
  }
  console.log('supabase/setup_completo.sql em dia.');
  process.exit(0);
}

writeFileSync(out, content, 'utf8');
console.log(`Gerado ${out} com ${migrations.length} migrações${changing.size ? `; drop antes de: ${[...changing].join(', ')}` : ''}.`);
