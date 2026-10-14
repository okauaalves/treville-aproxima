import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { Config } from '@/constants/config';
import { EMPTY_PROFILE, validateProfileForm, validateProfileLinks, type Profile, type ProfileLink } from '@/lib/perfilLogic';
import { friendly, PlaquinhaError, SessionError } from '@/lib/plaquinhas';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { isAllowedAvatarUrl, isProfileIcon } from '@/supabase/functions/_shared/profilePage';

export * from '@/lib/perfilLogic';

const PROFILE_COLUMNS = 'id, full_name, display_name, bio, avatar_url, theme_color';
const AVATAR_SIZE = 512;

function client() {
  if (!supabase) {
    throw new PlaquinhaError('O perfil digital precisa de conta e conexão.');
  }
  return supabase;
}

/** Sempre o usuário da sessão; nunca um id vindo de rota ou parâmetro. */
function sessionUserId(): string {
  const id = useAuthStore.getState().user?.id;
  if (!id) {
    throw new SessionError('Entre na sua conta para editar o perfil.');
  }
  return id;
}

/** Perfil do usuário da sessão; se a linha ainda não existir, cria uma vazia. */
export async function getProfile(): Promise<Profile> {
  const userId = sessionUserId();
  const db = client();
  const { data, error, status } = await db.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  if (error) {
    throw friendly({ ...error, status }, 'Não foi possível carregar o perfil.');
  }
  if (data) {
    return data as Profile;
  }
  const created = await db.from('profiles').upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true }).select(PROFILE_COLUMNS).maybeSingle();
  if (created.error) {
    throw friendly({ ...created.error, status: created.status }, 'Não foi possível criar o perfil.');
  }
  return (created.data as Profile | null) ?? EMPTY_PROFILE(userId);
}

export async function updateProfile(input: { displayName: string; bio: string; themeColor: string; avatarUrl?: string | null }): Promise<Profile> {
  const userId = sessionUserId();
  const check = validateProfileForm(input);
  if (!check.ok) {
    throw new PlaquinhaError(check.error);
  }
  const row: Record<string, unknown> = { id: userId, ...check.value, updated_at: new Date().toISOString() };
  if (input.avatarUrl !== undefined) {
    if (input.avatarUrl !== null && !isAllowedAvatarUrl(input.avatarUrl, Config.supabaseUrl)) {
      throw new PlaquinhaError('Foto inválida. Envie de novo.');
    }
    row.avatar_url = input.avatarUrl;
  }
  const { data, error } = await client().from('profiles').upsert(row, { onConflict: 'id' }).select(PROFILE_COLUMNS).single();
  if (error) {
    throw friendly(error, 'Não foi possível salvar o perfil.');
  }
  return data as Profile;
}

async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    return (await fetch(uri)).arrayBuffer();
  }
  return new File(uri).arrayBuffer();
}

/** Reduz para 512px JPEG, envia para `avatars/<uid>/avatar.jpg` e devolve a URL pública com cache-bust. */
export async function uploadAvatar(localUri: string): Promise<string> {
  const userId = sessionUserId();
  const db = client();
  let body: ArrayBuffer;
  try {
    const rendered = await ImageManipulator.manipulate(localUri).resize({ width: AVATAR_SIZE }).renderAsync();
    const saved = await rendered.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
    body = await readBytes(saved.uri);
  } catch {
    throw new PlaquinhaError('Não foi possível preparar a foto.');
  }
  if (body.byteLength > 2 * 1024 * 1024) {
    throw new PlaquinhaError('A foto ficou maior que 2 MB. Escolha outra.');
  }
  const path = `${userId}/avatar.jpg`;
  const { error } = await db.storage.from('avatars').upload(path, body, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
  if (error) {
    const message = (error.message ?? '').toLowerCase();
    if (message.includes('bucket not found')) {
      throw new PlaquinhaError('O armazenamento de fotos ainda não foi criado no servidor (supabase db push).');
    }
    throw friendly({ message: error.message }, 'Não foi possível enviar a foto.');
  }
  const { data } = db.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

interface LinkRow {
  id: string;
  title: string;
  url: string;
  icon: string;
  is_active: boolean;
}

function toProfileLink(row: LinkRow): ProfileLink {
  return { id: row.id, title: row.title, url: row.url, icon: isProfileIcon(row.icon) ? row.icon : 'link', is_active: row.is_active };
}

export async function getProfileLinks(plaquinhaId: string): Promise<ProfileLink[]> {
  sessionUserId();
  const { data, error } = await client().from('profile_links').select('id, title, url, icon, is_active, position').eq('plaquinha_id', plaquinhaId).order('position', { ascending: true });
  if (error) {
    throw friendly(error, 'Não foi possível carregar os links.');
  }
  return ((data ?? []) as LinkRow[]).map(toProfileLink);
}

/** Salva a lista inteira numa transação (RPC): nada se perde se algo falhar no meio. */
export async function saveProfileLinks(plaquinhaId: string, links: ProfileLink[]): Promise<ProfileLink[]> {
  sessionUserId();
  const check = validateProfileLinks(links);
  if (!check.ok) {
    throw new PlaquinhaError(`Link ${check.index + 1}: ${check.error}`);
  }
  const payload = check.links.map((link) => ({ id: link.id, title: link.title, url: link.url, icon: link.icon, is_active: link.is_active }));
  const { data, error } = await client().rpc('save_profile_links', { p_plaquinha_id: plaquinhaId, p_links: payload });
  if (error) {
    throw friendly(error, 'Não foi possível salvar os links.');
  }
  return ((data ?? []) as LinkRow[]).map(toProfileLink);
}

export async function toggleProfilePage(plaquinhaId: string, enabled: boolean): Promise<void> {
  sessionUserId();
  const { error } = await client().from('redirect_links').update({ profile_enabled: enabled, updated_at: new Date().toISOString() }).eq('id', plaquinhaId);
  if (error) {
    throw friendly(error, 'Não foi possível mudar a página de perfil.');
  }
}
