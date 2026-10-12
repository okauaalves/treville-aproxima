/**
 * Conversão de campos do formulário em URI. Usada pelo NdefEngine (gravação direta)
 * e pelas plaquinhas (destino do redirect), para os dois gerarem o mesmo link.
 */

/**
 * Números BR sem DDI: 10 dígitos (DDD + 8) ou 11 (DDD + 9) recebem o prefixo 55.
 * Se já começa com 55 e tem 12+ dígitos, permanece.
 */
export function cleanPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return `55${digits}`;
  }
  return digits;
}

export function whatsAppUrl(phone: string, message?: string): string {
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${cleanPhone(phone)}${text}`;
}

export function phoneUri(phone: string, includeCountryCode = false): string {
  const digits = includeCountryCode ? cleanPhone(phone) : phone.replace(/\D/g, '');
  return `tel:+${digits}`;
}

export function smsUri(phone: string, body?: string): string {
  return `sms:+${cleanPhone(phone)}${body ? `?body=${encodeURIComponent(body)}` : ''}`;
}

export function emailUri(address: string, subject?: string, body?: string): string {
  const params = new URLSearchParams();
  if (subject) {
    params.set('subject', subject);
  }
  if (body) {
    params.set('body', body);
  }
  const query = params.toString();
  return `mailto:${address.trim()}${query ? `?${query}` : ''}`;
}

export function mapsUrl(query: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}
