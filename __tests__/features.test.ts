/// <reference types="jest" />
import { Ndef } from '@/core/nfc/nfcNative';
import { ndefEngine } from '@/core/nfc/NdefEngine';
import { payloadValidator } from '@/core/validation/payloadValidator';
import { decideInitialRoute, ONBOARDING_KEY } from '@/lib/bootRoute';

describe('cartão personalizado', () => {
  it('grava vCard 3.0 e reconhece na leitura, sem ícone na tag', () => {
    const payload = {
      contentType: 'CUSTOM' as const,
      cardTitle: 'Estúdio',
      cardIcon: 'IdCard',
      cardColor: '#3B82F6',
      cardFields: [
        { label: 'Cargo', value: 'Design' },
        { label: 'Cidade', value: 'Recife' },
      ],
    };
    const message = ndefEngine.buildMessage(payload);
    const decoded = Ndef.decodeMessage(Ndef.encodeMessage(message));
    const parsed = ndefEngine.parseRecord(decoded[0]!);
    expect(parsed.contentType).toBe('CUSTOM');
    expect(parsed.data.cardTitle).toBe('Estúdio');
    expect(parsed.data.cardFields).toEqual([
      { label: 'Cargo', value: 'Design' },
      { label: 'Cidade', value: 'Recife' },
    ]);
    expect(parsed.rawValue).toContain('BEGIN:VCARD');
    expect(parsed.rawValue).toContain('X-TREVILLE-CARD:1');
    expect(parsed.rawValue).not.toContain('IdCard');
    expect(payloadValidator.validate(payload).ok).toBe(true);
    expect(payloadValidator.validate({ contentType: 'CUSTOM', cardTitle: '', cardFields: [] }).ok).toBe(false);
  });
});

describe('boot', () => {
  it('manda onboarding, login ou abas conforme a sessão', () => {
    expect(ONBOARDING_KEY).toBe('onboarding_done');
    expect(decideInitialRoute({ onboardingSeen: false, hasSession: false })).toBe('/onboarding');
    expect(decideInitialRoute({ onboardingSeen: false, hasSession: true })).toBe('/onboarding');
    expect(decideInitialRoute({ onboardingSeen: true, hasSession: false })).toBe('/(auth)/login');
    expect(decideInitialRoute({ onboardingSeen: true, hasSession: true })).toBe('/(tabs)');
  });
});
