import { ndefEngine } from '@/core/nfc/NdefEngine';
import { isValidEmail, isValidPhone, isValidUrl } from '@/utils/validators';
import type { NfcPayload, WifiSecurity } from '@/types/nfc';

export interface ValidationResult {
  ok: boolean;
  error?: string;
  errorField?: string;
  estimatedBytes?: number;
}

const WIFI_VALUES: WifiSecurity[] = ['WPA', 'WPA2', 'WPA3', 'WEP', 'nopass'];

function fail(error: string, errorField?: string): ValidationResult {
  return { ok: false, error, errorField };
}

export class PayloadValidator {
  validate(payload: NfcPayload): ValidationResult {
    const result = this.route(payload);
    if (!result.ok) {
      return result;
    }
    return { ...result, estimatedBytes: this.estimateSize(payload) };
  }

  route(payload: NfcPayload): ValidationResult {
    switch (payload.contentType) {
      case 'URL':
      case 'LINK_APP':
        return this.validateUrl(payload.contentType === 'LINK_APP' ? payload.appUri ?? '' : payload.url ?? '');
      case 'WHATSAPP':
        return this.validateWhatsApp(payload.phone ?? '', payload.message);
      case 'PHONE':
        return this.validatePhone(payload.phone ?? '');
      case 'EMAIL':
        return this.validateEmail(payload.email ?? '');
      case 'VCARD':
        return this.validateVCard(payload);
      case 'WIFI':
        return this.validateWifi(payload);
      case 'TEXT':
      case 'CUSTOM':
      case 'EVENT':
        return this.validateText(payload.text ?? payload.eventTitle ?? '');
      case 'LOCATION':
        if ((payload.latitude && payload.longitude) || payload.address) {
          return { ok: true };
        }
        return fail('Informe latitude e longitude ou um endereço.', 'address');
      default:
        return fail('Tipo de conteúdo inválido.');
    }
  }

  validateUrl(url: string): ValidationResult {
    if (!isValidUrl(url)) {
      return fail('Informe uma URL http ou https válida.', 'url');
    }
    return { ok: true };
  }

  validateWhatsApp(phone: string, message?: string): ValidationResult {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      return fail('Informe o número com DDI.', 'phone');
    }
    if ((message ?? '').length > 500) {
      return fail('A mensagem pode ter no máximo 500 caracteres.', 'message');
    }
    return { ok: true };
  }

  validatePhone(phone: string): ValidationResult {
    if (!/^[+\d\s()-]+$/.test(phone) || !isValidPhone(phone)) {
      return fail('Informe um telefone válido.', 'phone');
    }
    return { ok: true };
  }

  validateEmail(email: string): ValidationResult {
    if (!isValidEmail(email)) {
      return fail('Informe um e-mail válido.', 'email');
    }
    return { ok: true };
  }

  validateVCard(payload: NfcPayload): ValidationResult {
    if (!payload.fullName?.trim()) {
      return fail('O nome completo é obrigatório.', 'fullName');
    }
    if (!payload.phone?.trim() && !payload.email?.trim()) {
      return fail('Informe ao menos um telefone ou e-mail.', 'phone');
    }
    return { ok: true };
  }

  validateWifi(payload: NfcPayload): ValidationResult {
    const ssid = payload.ssid ?? '';
    if (ssid.length < 1 || ssid.length > 32) {
      return fail('O SSID deve ter de 1 a 32 caracteres.', 'ssid');
    }
    const security = payload.security ?? 'WPA2';
    if (!WIFI_VALUES.includes(security)) {
      return fail('Segurança inválida.', 'security');
    }
    if (security === 'nopass') {
      return { ok: true };
    }
    const password = payload.password ?? '';
    if (security === 'WEP') {
      const ascii = password.length === 5 || password.length === 13;
      const hex = /^[0-9a-fA-F]+$/.test(password) && (password.length === 10 || password.length === 26);
      if (!ascii && !hex) {
        return fail('Senha WEP: 5 ou 13 caracteres, ou 10/26 hexadecimais.', 'password');
      }
      return { ok: true };
    }
    if (password.length < 8 || password.length > 63) {
      return fail('A senha WPA deve ter de 8 a 63 caracteres.', 'password');
    }
    return { ok: true };
  }

  validateText(text: string): ValidationResult {
    if (!text.trim()) {
      return fail('Informe o texto.', 'text');
    }
    if (text.length > 400) {
      return fail('O texto pode ter no máximo 400 caracteres.', 'text');
    }
    return { ok: true };
  }

  estimateSize(payload: NfcPayload): number {
    return ndefEngine.calculateMessageSize(ndefEngine.buildMessage(payload));
  }
}

export const payloadValidator = new PayloadValidator();
