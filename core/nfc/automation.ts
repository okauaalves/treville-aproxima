import { payloadValidator } from '@/core/validation/payloadValidator';
import type { WifiSecurity, WritePayload } from '@/types/nfc';

export type AutomationKind = 'app' | 'url' | 'call' | 'whatsapp' | 'wifi';

export interface AppPreset {
  id: string;
  name: string;
  androidPackage: string;
  iosUri: string;
}

export const APP_PRESETS: AppPreset[] = [
  { id: 'whatsapp', name: 'WhatsApp', androidPackage: 'com.whatsapp', iosUri: 'whatsapp://' },
  { id: 'instagram', name: 'Instagram', androidPackage: 'com.instagram.android', iosUri: 'instagram://' },
  { id: 'spotify', name: 'Spotify', androidPackage: 'com.spotify.music', iosUri: 'spotify://' },
  { id: 'youtube', name: 'YouTube', androidPackage: 'com.google.android.youtube', iosUri: 'youtube://' },
  { id: 'waze', name: 'Waze', androidPackage: 'com.waze', iosUri: 'waze://' },
];

export interface AutomationInput {
  kind: AutomationKind;
  androidPackage?: string;
  appUri?: string;
  url?: string;
  phone?: string;
  message?: string;
  ssid?: string;
  password?: string;
  security?: WifiSecurity;
}

export interface AutomationInfo {
  title: string;
  description: string;
  android: string;
  ios: string;
}

export const AUTOMATION_INFO: Record<AutomationKind, AutomationInfo> = {
  app: {
    title: 'Abrir app específico',
    description: 'Grava um Android Application Record (pacote do app) e, se informado, um deep link para o iPhone.',
    android: 'O Android abre o app ao aproximar a tag. Se o app não estiver instalado, abre a página dele na Play Store.',
    ios: 'O iPhone ignora o registro de pacote Android. Deep links (ex.: instagram://) só funcionam lidos por um app ou por uma automação do app Atalhos.',
  },
  url: {
    title: 'Abrir URL',
    description: 'Grava um link https.',
    android: 'O Android abre o link no navegador ou no app associado ao aproximar.',
    ios: 'O iPhone mostra uma notificação para abrir o link (leitura em segundo plano, iPhone XS ou mais novo).',
  },
  call: {
    title: 'Ligar para número',
    description: 'Grava um link tel:.',
    android: 'O Android abre o discador com o número preenchido. Nenhum app consegue completar a ligação sozinho: a pessoa confirma.',
    ios: 'O iPhone oferece a ligação por notificação; a pessoa confirma.',
  },
  whatsapp: {
    title: 'Enviar mensagem WhatsApp',
    description: 'Grava um link wa.me com a mensagem pronta.',
    android: 'Abre a conversa no WhatsApp com o texto preenchido. O envio é feito pela pessoa.',
    ios: 'O iPhone mostra a notificação do link e abre o WhatsApp com o texto preenchido.',
  },
  wifi: {
    title: 'Wi-Fi',
    description: 'Grava um registro de rede Wi-Fi (WSC, padrão Wi-Fi Alliance) com nome, senha e segurança.',
    android: 'O Android oferece conectar à rede ao aproximar. Desde o Android 10 nenhum app liga ou desliga o Wi-Fi sozinho; para alternar o Wi-Fi use o Tasker.',
    ios: 'O iPhone não conecta em Wi-Fi a partir de tags. Use o app Atalhos (Automação > NFC) para executar ações.',
  },
};

/** Monta o conteúdo da tag para cada automação e valida com as mesmas regras da gravação normal. */
export function buildAutomationPayload(input: AutomationInput): { payload: WritePayload | null; error?: string } {
  let payload: WritePayload;
  switch (input.kind) {
    case 'app':
      payload = {
        contentType: 'LINK_APP',
        appUri: input.appUri?.trim() || undefined,
        androidPackage: input.androidPackage?.trim() || undefined,
      };
      break;
    case 'url':
      payload = { contentType: 'URL', url: input.url?.trim() ?? '' };
      break;
    case 'call':
      payload = { contentType: 'PHONE', phone: input.phone?.trim() ?? '', includeCountryCode: true };
      break;
    case 'whatsapp':
      payload = { contentType: 'WHATSAPP', phone: input.phone?.trim() ?? '', message: input.message?.trim() || undefined, includeCountryCode: true };
      break;
    case 'wifi':
      payload = { contentType: 'WIFI', ssid: input.ssid?.trim() ?? '', password: input.password ?? '', security: input.security ?? 'WPA2' };
      break;
    default:
      return { payload: null, error: 'Tipo de automação inválido.' };
  }
  const validation = payloadValidator.validate(payload);
  if (!validation.ok) {
    return { payload: null, error: validation.error };
  }
  return { payload };
}
