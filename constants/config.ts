export const APP_NAME = 'Tréville Aproxima';
export const APP_TAGLINE = 'Aproxime. Configure. Conecte.';
export const APP_VERSION = '1.0.0';
export const APP_BUILD = '1';
/** Fallback nativo. Em runtime use getAuthRedirect() (web usa a origem; nativo usa o scheme treville). */
export const AUTH_REDIRECT = 'treville://auth/callback';
/** E-mail não é segredo: só decide se a UI do painel aparece. A autorização real é a Edge Function. */
export const ADMIN_EMAIL = process.env.EXPO_PUBLIC_ADMIN_EMAIL ?? 'previaemailofc@gmail.com';
export const PRIVACY_URL = 'https://example.com/nfc-manager/privacidade';
export const TERMS_URL = 'https://example.com/nfc-manager/termos';
/** Placeholder visível. Troque pelo e-mail real antes de publicar. */
export const SUPPORT_EMAIL = 'contato@exemplo.com';
export const DEFAULT_TAG_CAPACITY = 144;
export const HISTORY_PAGE_SIZE = 20;
export const SYNC_BATCH_SIZE = 50;
