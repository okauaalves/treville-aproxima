import type { CardField, NfcPayload } from '@/types/nfc';

/**
 * Cartão personalizado na tag — vCard 3.0, legível por outros celulares.
 *
 * O contato abre com FN = título. Cada campo vira uma linha NOTE
 * ("rótulo: valor"), que a maioria dos leitores mostra nas notas do contato.
 * O marcador X-TREVILLE-CARD:1 distingue este cartão de um vCard comum.
 * Ícone e cor ficam só no template e no histórico; não entram na tag.
 *
 * BEGIN:VCARD
 * VERSION:3.0
 * FN:Título
 * X-TREVILLE-CARD:1
 * NOTE:Rótulo: Valor
 * END:VCARD
 */
export const CUSTOM_CARD_MARKER = 'X-TREVILLE-CARD:1';

function escapeVCard(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function unescapeVCard(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/\\;/g, ';').replace(/\\,/g, ',').replace(/\\\\/g, '\\');
}

export function buildCustomCardBody(payload: NfcPayload): string {
  const title = (payload.cardTitle ?? '').trim();
  const fields = (payload.cardFields ?? []).filter((field) => field.label.trim() && field.value.trim());
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVCard(title)}`,
    CUSTOM_CARD_MARKER,
    ...fields.map((field) => `NOTE:${escapeVCard(field.label.trim())}: ${escapeVCard(field.value.trim())}`),
    'END:VCARD',
  ];
  return lines.join('\n');
}

export function isCustomCardVCard(text: string): boolean {
  return text.includes('BEGIN:VCARD') && text.includes(CUSTOM_CARD_MARKER);
}

export function parseCustomCard(text: string): { cardTitle: string; cardFields: CardField[] } {
  const title = unescapeVCard(text.match(/^FN:(.*)$/m)?.[1]?.trim() ?? '');
  const cardFields: CardField[] = [];
  for (const match of text.matchAll(/^NOTE:(.*)$/gm)) {
    const raw = unescapeVCard(match[1]?.trim() ?? '');
    const split = raw.indexOf(': ');
    if (split <= 0) {
      continue;
    }
    cardFields.push({ label: raw.slice(0, split).trim(), value: raw.slice(split + 2).trim() });
  }
  return { cardTitle: title, cardFields };
}
