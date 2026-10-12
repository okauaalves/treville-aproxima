export type SocialNetwork = 'instagram' | 'tiktok';

const HOSTS: Record<SocialNetwork, RegExp> = {
  instagram: /^(?:https?:\/\/)?(?:www\.|m\.)?instagr(?:am\.com|\.am)\//i,
  tiktok: /^(?:https?:\/\/)?(?:www\.|m\.|vm\.)?tiktok\.com\//i,
};

const VALID: Record<SocialNetwork, RegExp> = {
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  tiktok: /^[A-Za-z0-9._]{1,24}$/,
};

export const SOCIAL_LABEL: Record<SocialNetwork, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

/** Aceita "@nome", "nome" ou a URL do perfil colada; devolve só o nome de usuário. */
export function extractSocialUsername(network: SocialNetwork, raw: string): string {
  let value = raw.replace(/\s+/g, '');
  if (HOSTS[network].test(value)) {
    value = value.replace(HOSTS[network], '').split(/[/?#]/)[0] ?? '';
  }
  return value.replace(/^@+/, '');
}

export function buildSocialUrl(network: SocialNetwork, username: string): string {
  return network === 'instagram' ? `https://instagram.com/${username}` : `https://tiktok.com/@${username}`;
}

/** Reconhece uma URL de perfil já gravada, para reabrir o formulário no modo certo. */
export function detectSocialUrl(url: string): { network: SocialNetwork; username: string } | null {
  for (const network of Object.keys(HOSTS) as SocialNetwork[]) {
    if (HOSTS[network].test(url.trim())) {
      const username = extractSocialUsername(network, url);
      return username ? { network, username } : null;
    }
  }
  return null;
}

export type SocialCheck = { ok: true; url: string } | { ok: false; error: string };

export function validateSocialUsername(network: SocialNetwork, raw: string): SocialCheck {
  const username = extractSocialUsername(network, raw);
  if (!username) {
    return { ok: false, error: `Informe o nome de usuário do ${SOCIAL_LABEL[network]}.` };
  }
  if (!VALID[network].test(username)) {
    return { ok: false, error: `Nome de usuário do ${SOCIAL_LABEL[network]} inválido. Use letras, números, ponto ou sublinhado.` };
  }
  return { ok: true, url: buildSocialUrl(network, username) };
}
