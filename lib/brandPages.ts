import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { draftsForPersist, type BrandLinkDraft, type BrandLinkType } from '@/lib/brandLinkLogic';
import { getLinkUrl, SessionError } from '@/lib/plaquinhas';
import { resolveProfilePageBase } from '@/lib/plaquinhaLogic';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export type BrandThemeMode = 'dark' | 'light' | 'balanced';

export type BrandPage = {
  id: string;
  user_id: string;
  plaquinha_id: string | null;
  custom_slug: string | null;
  brand_name: string | null;
  tagline: string | null;
  about: string | null;
  logo_url: string | null;
  banner_image_url: string | null;
  theme_mode: BrandThemeMode;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  background_color: string | null;
  text_color: string | null;
  border_color: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};

export type BrandLinkRow = {
  id: string;
  brand_page_id: string;
  link_type: BrandLinkType;
  label: string | null;
  description: string | null;
  destination_url: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
};

export type BrandPageUpdate = Partial<
  Pick<
    BrandPage,
    | 'plaquinha_id'
    | 'custom_slug'
    | 'brand_name'
    | 'tagline'
    | 'about'
    | 'logo_url'
    | 'banner_image_url'
    | 'theme_mode'
    | 'primary_color'
    | 'secondary_color'
    | 'accent_color'
    | 'background_color'
    | 'text_color'
    | 'border_color'
    | 'is_published'
  >
>;

const BRAND_PAGE_COLUMNS =
  'id, user_id, plaquinha_id, custom_slug, brand_name, tagline, about, logo_url, banner_image_url, theme_mode, primary_color, secondary_color, accent_color, background_color, text_color, border_color, is_published, created_at, updated_at';

const BRAND_PAGE_COLUMNS_FALLBACK =
  'id, user_id, plaquinha_id, custom_slug, brand_name, tagline, logo_url, banner_image_url, theme_mode, primary_color, secondary_color, accent_color, background_color, text_color, border_color, is_published, created_at, updated_at';

const BRAND_LINK_COLUMNS = 'id, brand_page_id, link_type, label, description, destination_url, position, is_active, created_at';

const BRAND_PAGE_BASE = resolveProfilePageBase(process.env.EXPO_PUBLIC_PROFILE_PAGE_URL).replace(/\/p\/?$/i, '');

const LOGO_MAX_EDGE = 1024;
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export class BrandPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrandPageError';
  }
}

function client() {
  if (!supabase || !isSupabaseConfigured) {
    throw new BrandPageError('Minha Página precisa de conta e conexão.');
  }
  return supabase;
}

function sessionUserId(): string {
  const id = useAuthStore.getState().user?.id;
  if (!id) {
    throw new SessionError('Entre na sua conta para configurar a página.');
  }
  return id;
}

function friendly(error: { message?: string } | null | undefined, fallback: string): Error {
  const message = (error?.message ?? '').toLowerCase();
  if (message.includes('bucket not found')) {
    return new BrandPageError('O armazenamento de logos ainda não foi criado no servidor (supabase db push).');
  }
  if (message.includes('relation') && message.includes('brand_pages')) {
    return new BrandPageError('A tabela de páginas ainda não existe no servidor. Aplique a migration brand_pages.');
  }
  if (message.includes('jwt') || message.includes('auth')) {
    return new SessionError('Sessão expirada. Entre novamente.');
  }
  return new BrandPageError(error?.message?.trim() || fallback);
}

async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    return (await fetch(uri)).arrayBuffer();
  }
  return new File(uri).arrayBuffer();
}

function extensionForMime(mime: string): string {
  if (mime === 'image/png') {
    return 'png';
  }
  if (mime === 'image/webp') {
    return 'webp';
  }
  return 'jpg';
}

function asBrandPage(row: Record<string, unknown>): BrandPage {
  return {
    ...(row as unknown as BrandPage),
    about: typeof row.about === 'string' ? row.about : null,
  };
}

/** Busca a página do usuário; se não existir, cria um rascunho (is_published: false). */
export async function getOrCreateBrandPage(): Promise<BrandPage> {
  const userId = sessionUserId();
  const db = client();
  let existing = await db.from('brand_pages').select(BRAND_PAGE_COLUMNS).eq('user_id', userId).maybeSingle();
  if (existing.error && /about/i.test(existing.error.message ?? '')) {
    existing = await db.from('brand_pages').select(BRAND_PAGE_COLUMNS_FALLBACK).eq('user_id', userId).maybeSingle();
  }
  if (existing.error) {
    throw friendly(existing.error, 'Não foi possível carregar sua página.');
  }
  if (existing.data) {
    return asBrandPage(existing.data as Record<string, unknown>);
  }
  let created = await db
    .from('brand_pages')
    .insert({ user_id: userId, is_published: false, theme_mode: 'dark' })
    .select(BRAND_PAGE_COLUMNS)
    .single();
  if (created.error && /about/i.test(created.error.message ?? '')) {
    created = await db
      .from('brand_pages')
      .insert({ user_id: userId, is_published: false, theme_mode: 'dark' })
      .select(BRAND_PAGE_COLUMNS_FALLBACK)
      .single();
  }
  if (created.error) {
    throw friendly(created.error, 'Não foi possível criar sua página.');
  }
  return asBrandPage(created.data as Record<string, unknown>);
}

export async function getBrandPage(): Promise<BrandPage | null> {
  const userId = sessionUserId();
  let { data, error } = await client().from('brand_pages').select(BRAND_PAGE_COLUMNS).eq('user_id', userId).maybeSingle();
  if (error && /about/i.test(error.message ?? '')) {
    ({ data, error } = await client().from('brand_pages').select(BRAND_PAGE_COLUMNS_FALLBACK).eq('user_id', userId).maybeSingle());
  }
  if (error) {
    throw friendly(error, 'Não foi possível carregar sua página.');
  }
  return data ? asBrandPage(data as Record<string, unknown>) : null;
}

export async function updateBrandPage(id: string, patch: BrandPageUpdate): Promise<BrandPage> {
  sessionUserId();
  let { data, error } = await client().from('brand_pages').update(patch).eq('id', id).select(BRAND_PAGE_COLUMNS).single();
  if (error && /about/i.test(error.message ?? '')) {
    const { about: _omit, ...withoutAbout } = patch;
    void _omit;
    ({ data, error } = await client().from('brand_pages').update(withoutAbout).eq('id', id).select(BRAND_PAGE_COLUMNS_FALLBACK).single());
  }
  if (error) {
    throw friendly(error, 'Não foi possível salvar a página.');
  }
  return asBrandPage(data as Record<string, unknown>);
}

/** Cria a página com logo e cores iniciais (rascunho). */
export async function createBrandPageWithPalette(input: {
  logoUrl: string;
  primary: string;
  secondary: string;
  tertiary: string;
}): Promise<BrandPage> {
  const userId = sessionUserId();
  const row = {
    user_id: userId,
    logo_url: input.logoUrl,
    primary_color: input.primary,
    secondary_color: input.secondary,
    accent_color: input.secondary,
    text_color: input.tertiary,
    background_color: null as string | null,
    border_color: input.primary,
    is_published: false,
    theme_mode: 'dark' as BrandThemeMode,
  };
  let { data, error } = await client()
    .from('brand_pages')
    .upsert(row, { onConflict: 'user_id' })
    .select(BRAND_PAGE_COLUMNS)
    .single();
  if (error && /about/i.test(error.message ?? '')) {
    ({ data, error } = await client()
      .from('brand_pages')
      .upsert(row, { onConflict: 'user_id' })
      .select(BRAND_PAGE_COLUMNS_FALLBACK)
      .single());
  }
  if (error) {
    throw friendly(error, 'Não foi possível criar sua página.');
  }
  return asBrandPage(data as Record<string, unknown>);
}

/** Envia logo para `brand-assets/<uid>/logo.<ext>` e devolve URL pública com cache-bust. */
export async function uploadBrandAsset(localUri: string): Promise<string> {
  const userId = sessionUserId();
  const db = client();
  let body: ArrayBuffer;
  let contentType = 'image/jpeg';
  try {
    const rendered = await ImageManipulator.manipulate(localUri).resize({ width: LOGO_MAX_EDGE }).renderAsync();
    const saved = await rendered.saveAsync({ compress: 0.88, format: SaveFormat.PNG });
    body = await readBytes(saved.uri);
    contentType = 'image/png';
  } catch {
    try {
      body = await readBytes(localUri);
      const lower = localUri.toLowerCase();
      if (lower.includes('.png')) {
        contentType = 'image/png';
      } else if (lower.includes('.webp')) {
        contentType = 'image/webp';
      }
    } catch {
      throw new BrandPageError('Não foi possível preparar a logo.');
    }
  }
  if (body.byteLength > LOGO_MAX_BYTES) {
    throw new BrandPageError('A logo ficou maior que 2 MB. Escolha outra imagem.');
  }
  const path = `${userId}/logo.${extensionForMime(contentType)}`;
  const { error } = await db.storage.from('brand-assets').upload(path, body, {
    contentType,
    upsert: true,
    cacheControl: '3600',
  });
  if (error) {
    throw friendly(error, 'Não foi possível enviar a logo.');
  }
  const { data } = db.storage.from('brand-assets').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function listBrandLinks(brandPageId: string): Promise<BrandLinkRow[]> {
  sessionUserId();
  const { data, error } = await client()
    .from('brand_links')
    .select(BRAND_LINK_COLUMNS)
    .eq('brand_page_id', brandPageId)
    .order('position', { ascending: true });
  if (error) {
    throw friendly(error, 'Não foi possível carregar os links.');
  }
  return (data ?? []) as BrandLinkRow[];
}

/** Upsert dos 6 cartões por (brand_page_id, link_type). Não apaga conteúdo ao desativar. */
export async function upsertBrandLinks(brandPageId: string, drafts: BrandLinkDraft[]): Promise<BrandLinkRow[]> {
  sessionUserId();
  const rows = draftsForPersist(drafts).map((item) => ({
    brand_page_id: brandPageId,
    link_type: item.link_type,
    label: item.label,
    description: item.description || null,
    destination_url: item.destination_url,
    position: item.position,
    is_active: item.is_active,
  }));
  const { data, error } = await client()
    .from('brand_links')
    .upsert(rows, { onConflict: 'brand_page_id,link_type' })
    .select(BRAND_LINK_COLUMNS)
    .order('position', { ascending: true });
  if (error) {
    throw friendly(error, 'Não foi possível salvar os links.');
  }
  return (data ?? []) as BrandLinkRow[];
}

export async function publishBrandPage(id: string): Promise<BrandPage> {
  return updateBrandPage(id, { is_published: true });
}

/**
 * URL estável da plaquinha (mesma do QR/NFC via `getLinkUrl`).
 * Mudar links, cores ou tema da brand_page NÃO exige regravar a tag nem gerar novo QR.
 */
export function getPlaquinhaScanUrl(plaquinhaId: string, via: 'qr' | 'nfc' = 'qr'): string {
  return getLinkUrl(plaquinhaId, via);
}

/** Página HTML pública da marca no EAS Hosting (`/b/<id>`), sem contar scan. */
export function getBrandViewUrl(plaquinhaOrSlug: string): string {
  const base = BRAND_PAGE_BASE.replace(/\/+$/, '');
  return `${base}/b/${encodeURIComponent(plaquinhaOrSlug)}`;
}

/**
 * Endereço público para compartilhar:
 * - Com plaquinha: link curto `/t/<ID>` (o que vai no QR/NFC — estável).
 * - Só custom_slug: `/b/<slug>` (sem plaquinha física).
 */
export function getPublicUrl(page: Pick<BrandPage, 'plaquinha_id' | 'custom_slug' | 'is_published'>): string | null {
  if (page.plaquinha_id) {
    return getPlaquinhaScanUrl(page.plaquinha_id, 'qr');
  }
  if (page.custom_slug) {
    return getBrandViewUrl(page.custom_slug);
  }
  return null;
}

/**
 * Liga ou desliga a plaquinha da brand_page.
 * Publicação NÃO exige vínculo — página pode ficar só no link direto `/b/...` se houver slug.
 * Só aceita plaquinha do próprio usuário (já cadastrada em redirect_links).
 */
export async function linkPlaquinhaToBrandPage(pageId: string, plaquinhaId: string | null): Promise<BrandPage> {
  const userId = sessionUserId();
  if (plaquinhaId) {
    const id = plaquinhaId.trim().toUpperCase();
    const { data, error } = await client().from('redirect_links').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
    if (error) {
      throw friendly(error, 'Não foi possível validar a plaquinha.');
    }
    if (!data) {
      throw new BrandPageError('Escolha uma plaquinha da sua conta.');
    }
    return updateBrandPage(pageId, { plaquinha_id: id });
  }
  return updateBrandPage(pageId, { plaquinha_id: null });
}
