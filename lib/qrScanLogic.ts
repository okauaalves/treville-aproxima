import { Config } from '@/constants/config';
import { parsePlaquinhaCode, plaquinhaCodeFromLink } from '@/lib/editAccessLogic';

export type ClaimPlaquinhaRow = {
  id: string;
  name: string;
  destination_type: string;
  claimed: boolean;
};

export type QrScanRoute =
  | { kind: 'unrecognized'; message: string }
  | { kind: 'not_found'; message: string }
  | { kind: 'open'; path: string; claimed: boolean };

const UNRECOGNIZED = 'QR não reconhecido';
const NOT_FOUND = 'Plaquinha não encontrada.';

/** Código a partir do payload do QR: URL nossa → id; código puro → id; resto → null. */
export function codeFromQrScan(raw: string | null | undefined, shortBase: string = Config.shortLinkBase): string | null {
  const text = (raw ?? '').trim();
  if (!text) {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) || /[./]/.test(text)) {
    const href = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    return plaquinhaCodeFromLink(href, shortBase);
  }
  return parsePlaquinhaCode(text);
}

/** Decide navegação após o RPC `claim_plaquinha` (ou falha de parse). */
export function routeAfterQrScan(raw: string | null | undefined, row: ClaimPlaquinhaRow | null, shortBase?: string): QrScanRoute {
  const code = codeFromQrScan(raw, shortBase);
  if (!code) {
    return { kind: 'unrecognized', message: UNRECOGNIZED };
  }
  if (!row?.id) {
    return { kind: 'not_found', message: NOT_FOUND };
  }
  if (row.destination_type === 'empty' || row.claimed) {
    return { kind: 'open', path: `/plaquinha/qr/${encodeURIComponent(row.id)}?edit=1`, claimed: true };
  }
  return { kind: 'open', path: `/plaquinha/qr/${encodeURIComponent(row.id)}`, claimed: false };
}
