/// <reference types="jest" />
import { Ndef } from '@/core/nfc/nfcNative';
import { ndefEngine } from '@/core/nfc/NdefEngine';
import { payloadValidator } from '@/core/validation/payloadValidator';

describe('cartão personalizado', () => {
  const payload = {
    contentType: 'CUSTOM' as const,
    cardTitle: 'Estúdio Norte',
    cardIcon: 'Briefcase',
    cardColor: '#3B82F6',
    cardFields: [
      { label: 'Cargo', value: 'Designer' },
      { label: 'Cidade', value: 'Recife' },
    ],
  };

  it('grava vCard 3.0 e lê de volta sem ícone nem cor na tag', () => {
    const records = ndefEngine.buildMessage(payload);
    const decoded = Ndef.decodeMessage(Ndef.encodeMessage(records));
    const parsed = ndefEngine.parseRecord(decoded[0]!);
    expect(parsed.contentType).toBe('CUSTOM');
    expect(parsed.data.cardTitle).toBe('Estúdio Norte');
    expect(parsed.data.cardFields).toEqual([
      { label: 'Cargo', value: 'Designer' },
      { label: 'Cidade', value: 'Recife' },
    ]);
    expect(parsed.rawValue).toContain('BEGIN:VCARD');
    expect(parsed.rawValue).toContain('VERSION:3.0');
    expect(parsed.rawValue).toContain('X-TREVILLE-CARD:1');
    expect(parsed.rawValue).not.toContain('Briefcase');
    expect(parsed.rawValue).not.toContain('#3B82F6');
  });

  it('exige título e um campo completo', () => {
    expect(payloadValidator.validate(payload).ok).toBe(true);
    expect(payloadValidator.validate({ contentType: 'CUSTOM', cardTitle: '', cardFields: [] }).ok).toBe(false);
    expect(payloadValidator.validate({ contentType: 'CUSTOM', cardTitle: 'Ana', cardFields: [{ label: 'Site', value: '' }] }).ok).toBe(false);
  });
});
