#!/usr/bin/env node
/**
 * Gera supabase/migrations/_consolidado_pendente.sql a partir das migrations numeradas.
 * Não registra em schema_migrations — só para colar no SQL Editor.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
const outPath = path.join(migrationsDir, '_consolidado_pendente.sql');

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => /^\d{14}_.+\.sql$/.test(f))
  .sort();

const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

const header = `-- =============================================================================
-- CONSOLIDADO PENDENTE — colar no SQL Editor do Supabase (projeto fyavoukktjysxtmtkspd)
--
-- Gerado em: ${stamp} (scripts/build-consolidado-pendente.mjs)
-- Motivo: RPC save_profile_links retorna 404; nenhuma migration registrada no remoto
--         (\`supabase migration list --linked\`: coluna remote vazia para as 13 migrations).
-- Schema remoto parcial (setup manual): profiles, profile_links, redirect_links, scan_logs,
-- admins, brand_pages, brand_links; RPC increment_scan_count; SEM save_profile_links.
--
-- save_profile_links: migration 20261012010000_profile_page_webhook.sql
--
-- Conteúdo: ${files.length} migrations locais em ordem, idempotente onde possível.
-- NÃO é migration da CLI (prefixo _). Não rode \`supabase db push\`.
-- Após executar, teste POST /rest/v1/rpc/save_profile_links (usuário autenticado).
-- =============================================================================
`;

const parts = [header];
for (const f of files) {
  const body = fs.readFileSync(path.join(migrationsDir, f), 'utf8').trim();
  parts.push(`-- -----------------------------------------------------------------------------\n-- ${f}\n-- -----------------------------------------------------------------------------\n\n${body}\n`);
}

fs.writeFileSync(outPath, parts.join('\n'), 'utf8');
console.log(`Wrote ${outPath} (${files.length} migrations)`);
