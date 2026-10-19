// Regras puras da autorização de edição e da gestão de admins (testáveis sem Supabase).

import { DEFAULT_SHORT_LINK_BASE } from '@/lib/plaquinhaLogic';

export const PRIMARY_ADMIN_EMAIL = 'previaemailofc@gmail.com';
export const EDIT_REASON_MAX = 300;
export const ADMIN_NAME_MAX = 80;

export type EditRequestStatus = 'pending' | 'approved' | 'denied' | 'revoked';

export interface EditRequestRow {
  id: string;
  link_id: string;
  link_name: string;
  status: EditRequestStatus;
  reason?: string | null;
  requested_at: string;
  reviewed_at?: string | null;
  expires_at?: string | null;
}

const CODE_RE = /^[A-Z0-9]{4,8}$/;

const FUNCTION_PATH_RE = /\/functions\/v1\/redirect\/([^/]+)\/?$/;
const SHORT_PATH_RE = /^\/t\/([^/]+)\/?$/;
const PROFILE_PATH_RE = /^\/p\/([^/]+)\/?$/;

function parseHttpUrl(text: string): URL | null {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function codeFrom(segment: string | undefined): string | null {
  if (!segment) {
    return null;
  }
  try {
    const code = decodeURIComponent(segment).toUpperCase();
    return CODE_RE.test(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * Código da plaquinha a partir do texto digitado/colado ou da URL lida na tag/QR.
 * Aceita o código puro, o link curto `/t/<ID>`, a URL longa da função (`/functions/v1/redirect/<ID>`),
 * ambos com ou sem `?s=nfc`, e a página `/p/<ID>`.
 */
export function parsePlaquinhaCode(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text) {
    return null;
  }
  const plain = text.toUpperCase();
  if (CODE_RE.test(plain)) {
    return plain;
  }
  const url = parseHttpUrl(text);
  if (!url) {
    return null;
  }
  const path = url.pathname;
  return codeFrom((FUNCTION_PATH_RE.exec(path) ?? SHORT_PATH_RE.exec(path) ?? PROFILE_PATH_RE.exec(path))?.[1]);
}

function easPreviewHostPattern(originHost: string): RegExp {
  const slug = originHost.replace(/\.expo\.app$/i, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${slug}(--[a-z0-9-]+)?\\.expo\\.app$`, 'i');
}

/** Domínios aceitos para `/t/<ID>`: o configurado, o de produção e os aliases de preview do EAS Hosting. */
function isShortLinkHost(host: string, shortBase: string): boolean {
  const normalized = host.toLowerCase();
  const configured = parseHttpUrl(shortBase)?.host.toLowerCase();
  if (configured && normalized === configured) {
    return true;
  }
  const productionHost = parseHttpUrl(DEFAULT_SHORT_LINK_BASE)?.host.toLowerCase();
  if (productionHost && (normalized === productionHost || easPreviewHostPattern(productionHost).test(normalized))) {
    return true;
  }
  // Tags/QR antigos no domínio órfão ainda devem ser reconhecidos na leitura.
  return /^treville-aproxima(--[a-z0-9-]+)?\.expo\.app$/.test(normalized);
}

/**
 * Código só se a URL lida numa tag/QR é link de plaquinha: `/t/<ID>` no domínio curto ou a URL longa
 * `https://<projeto>.supabase.co/functions/v1/redirect/<ID>` (tags e QRs gravados antes do link curto).
 */
export function plaquinhaCodeFromLink(href: string | null | undefined, shortBase: string): string | null {
  const url = parseHttpUrl((href ?? '').trim());
  if (!url || !/^https?:\/\//i.test((href ?? '').trim())) {
    return null;
  }
  const host = url.host.toLowerCase();
  if (isShortLinkHost(host, shortBase)) {
    return codeFrom(SHORT_PATH_RE.exec(url.pathname)?.[1]);
  }
  if (/^[a-z0-9]{10,}\.supabase\.co$/.test(host)) {
    return codeFrom(FUNCTION_PATH_RE.exec(url.pathname)?.[1]);
  }
  return null;
}

export type EditBadgeKind = 'waiting' | 'authorized' | 'denied' | 'revoked' | 'expired';

export interface EditBadge {
  kind: EditBadgeKind;
  label: string;
  tone: 'warning' | 'success' | 'error' | 'muted';
  detail: string;
  /** Editar destino e gravar NFC liberados. */
  canEdit: boolean;
  /** Pode mandar um pedido novo para a mesma plaquinha. */
  canRequestAgain: boolean;
}

export function isExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) {
    return false;
  }
  const time = new Date(expiresAt).getTime();
  return Number.isFinite(time) && time <= now.getTime();
}

export function editBadge(request: Pick<EditRequestRow, 'status' | 'expires_at'>, now: Date = new Date()): EditBadge {
  switch (request.status) {
    case 'pending':
      return { kind: 'waiting', label: 'Aguardando', tone: 'warning', detail: 'Aguardando aprovação do administrador', canEdit: false, canRequestAgain: false };
    case 'approved':
      if (isExpired(request.expires_at, now)) {
        return { kind: 'expired', label: 'Expirado', tone: 'muted', detail: 'O prazo de edição terminou', canEdit: false, canRequestAgain: true };
      }
      return { kind: 'authorized', label: 'Autorizado', tone: 'success', detail: request.expires_at ? `Edição liberada até ${formatDatePtBr(request.expires_at)}` : 'Edição liberada', canEdit: true, canRequestAgain: false };
    case 'denied':
      return { kind: 'denied', label: 'Negado', tone: 'error', detail: 'Acesso negado pelo administrador', canEdit: false, canRequestAgain: true };
    default:
      return { kind: 'revoked', label: 'Revogado', tone: 'error', detail: 'Acesso revogado pelo administrador', canEdit: false, canRequestAgain: true };
  }
}

/** Mais recente por plaquinha: um card por link, com o status atual. */
export function latestByLink<T extends Pick<EditRequestRow, 'link_id' | 'requested_at'>>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const current = latest.get(row.link_id);
    if (!current || new Date(row.requested_at).getTime() > new Date(current.requested_at).getTime()) {
      latest.set(row.link_id, row);
    }
  }
  return [...latest.values()].sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());
}

export type ExpiryChoice = 'none' | '7' | '30';

export const EXPIRY_OPTIONS: { value: ExpiryChoice; label: string }[] = [
  { value: 'none', label: 'Sem prazo' },
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
];

export function expiresAtFor(choice: ExpiryChoice, now: Date = new Date()): string | null {
  if (choice === 'none') {
    return null;
  }
  return new Date(now.getTime() + Number(choice) * 24 * 60 * 60 * 1000).toISOString();
}

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export type RemoveAdminCheck = { ok: true } | { ok: false; reason: string };

/** Espelha remove_admin() no banco: a UI esconde/avisa, o servidor decide. */
export function canRemoveAdmin(input: { target: string; self: string | null | undefined; total: number }): RemoveAdminCheck {
  const target = normalizeEmail(input.target);
  if (target === normalizeEmail(input.self)) {
    return { ok: false, reason: 'Você não pode remover a si mesmo.' };
  }
  if (target === PRIMARY_ADMIN_EMAIL) {
    return { ok: false, reason: 'O administrador principal não pode ser removido.' };
  }
  if (input.total <= 1) {
    return { ok: false, reason: 'É preciso manter pelo menos um administrador.' };
  }
  return { ok: true };
}

const pad = (value: number) => String(value).padStart(2, '0');

export function formatDatePtBr(value: string | null | undefined): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}
