import { ContentTypeColors, ContentTypeIcons, type ContentType } from '@/theme/colors';

export interface BasicTemplate {
  type: ContentType;
  name: string;
  description: string;
  category: 'basic' | 'advanced';
}

export const DEFAULT_TEMPLATES = [
  { id: 'default-whatsapp', type: 'WHATSAPP' as const, name: 'WhatsApp', description: 'Contato rápido', icon: ContentTypeIcons.WHATSAPP },
  { id: 'default-vcard', type: 'VCARD' as const, name: 'Cartão de visita', description: 'vCard profissional', icon: ContentTypeIcons.VCARD },
  { id: 'default-wifi', type: 'WIFI' as const, name: 'Wi-Fi', description: 'Conexão automática', icon: ContentTypeIcons.WIFI },
  { id: 'default-url', type: 'URL' as const, name: 'Link', description: 'Site ou página', icon: ContentTypeIcons.URL },
  { id: 'default-phone', type: 'PHONE' as const, name: 'Telefone', description: 'Ligação direta', icon: ContentTypeIcons.PHONE },
  { id: 'default-email', type: 'EMAIL' as const, name: 'E-mail', description: 'Enviar mensagem', icon: ContentTypeIcons.EMAIL },
  { id: 'default-location', type: 'LOCATION' as const, name: 'Localização', description: 'Abrir no Maps', icon: ContentTypeIcons.LOCATION },
  { id: 'default-text', type: 'TEXT' as const, name: 'Texto', description: 'Mensagem de texto', icon: ContentTypeIcons.TEXT },
];

export const BASIC_TEMPLATES: BasicTemplate[] = [
  { type: 'WHATSAPP', name: 'WhatsApp', description: 'Contato rápido', category: 'basic' },
  { type: 'VCARD', name: 'Cartão de visita', description: 'vCard profissional', category: 'basic' },
  { type: 'WIFI', name: 'Wi-Fi', description: 'Conexão automática', category: 'basic' },
  { type: 'URL', name: 'Link', description: 'Site ou página', category: 'basic' },
  { type: 'PHONE', name: 'Telefone', description: 'Ligação direta', category: 'basic' },
  { type: 'EMAIL', name: 'E-mail', description: 'Enviar mensagem', category: 'basic' },
  { type: 'LOCATION', name: 'Localização', description: 'Abrir no Maps', category: 'basic' },
  { type: 'TEXT', name: 'Texto', description: 'Mensagem de texto', category: 'basic' },
];

export const ADVANCED_TEMPLATES: BasicTemplate[] = [
  { type: 'VCARD', name: 'Cartão multi-campo', description: 'vCard com empresa e site', category: 'advanced' },
  { type: 'LINK_APP', name: 'Link de aplicativo', description: 'Deep link para um app', category: 'advanced' },
  { type: 'EVENT', name: 'Evento', description: 'Compromisso na tag', category: 'advanced' },
];

export const CONTENT_TYPE_META: Record<
  ContentType,
  { name: string; description: string; colors: { dark: string; light: string }; icon: string }
> = {
  URL: { name: 'Link (URL)', description: 'Site ou página', colors: ContentTypeColors.URL, icon: ContentTypeIcons.URL },
  WHATSAPP: { name: 'WhatsApp', description: 'Abrir conversa direto', colors: ContentTypeColors.WHATSAPP, icon: ContentTypeIcons.WHATSAPP },
  PHONE: { name: 'Telefone', description: 'Ligação direta', colors: ContentTypeColors.PHONE, icon: ContentTypeIcons.PHONE },
  EMAIL: { name: 'E-mail', description: 'Enviar mensagem', colors: ContentTypeColors.EMAIL, icon: ContentTypeIcons.EMAIL },
  VCARD: { name: 'Cartão de visita', description: 'vCard profissional', colors: ContentTypeColors.VCARD, icon: ContentTypeIcons.VCARD },
  WIFI: { name: 'Wi-Fi', description: 'Conexão automática', colors: ContentTypeColors.WIFI, icon: ContentTypeIcons.WIFI },
  LOCATION: { name: 'Localização', description: 'Abrir no Maps', colors: ContentTypeColors.LOCATION, icon: ContentTypeIcons.LOCATION },
  TEXT: { name: 'Texto', description: 'Mensagem de texto', colors: ContentTypeColors.TEXT, icon: ContentTypeIcons.TEXT },
  LINK_APP: { name: 'Link app', description: 'Abrir aplicativo', colors: ContentTypeColors.LINK_APP, icon: ContentTypeIcons.LINK_APP },
  EVENT: { name: 'Evento', description: 'Compromisso', colors: ContentTypeColors.EVENT, icon: ContentTypeIcons.EVENT },
  CUSTOM: { name: 'Cartão personalizado', description: 'Ícone, cor e campos livres', colors: ContentTypeColors.CUSTOM, icon: 'IdCard' },
};

export function isContentType(value: string): value is ContentType {
  return value in CONTENT_TYPE_META;
}
