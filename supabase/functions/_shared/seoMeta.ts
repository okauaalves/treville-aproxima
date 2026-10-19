/** Meta tags Open Graph / descrição para páginas públicas HTML (perfil e marca). */

/** Texto livre (title/description): mesmo escape do profilePage, inclui `=`. */
const TEXT_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
  '=': '&#61;',
};

/** URLs já validadas: não escapar `=` (quebraria `https://`). */
const URL_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeText(value: string): string {
  return value.replace(/[&<>"'`=]/g, (char) => TEXT_ESCAPES[char] ?? char);
}

function escapeUrlAttr(value: string): string {
  return value.replace(/[&<>"']/g, (char) => URL_ESCAPES[char] ?? char);
}

export type SeoMetaInput = {
  title: string;
  description: string;
  /** URL absoluta da página (canonical / og:url). */
  pageUrl?: string | null;
  /** Imagem absoluta (avatar, logo). */
  imageUrl?: string | null;
  /** false = noindex (páginas de erro). Default true. */
  indexable?: boolean;
};

/** Bloco `<meta>` + `<link rel="canonical">` pronto para o `<head>`. Valores já escapados. */
export function renderSeoMetaTags(input: SeoMetaInput): string {
  const title = escapeText(input.title.trim() || 'Tréville Aproxima');
  const description = escapeText(
    (input.description.trim() || 'Página pública Tréville Aproxima.').slice(0, 200),
  );
  const indexable = input.indexable !== false;
  const robots = indexable ? 'index, follow' : 'noindex, nofollow';
  const pageUrl = sanitizeAbsoluteUrl(input.pageUrl);
  const imageUrl = sanitizeAbsoluteUrl(input.imageUrl);

  const lines = [
    `<meta name="description" content="${description}">`,
    `<meta name="robots" content="${robots}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
  ];
  if (pageUrl) {
    const escaped = escapeUrlAttr(pageUrl);
    lines.push(`<link rel="canonical" href="${escaped}">`);
    lines.push(`<meta property="og:url" content="${escaped}">`);
  }
  if (imageUrl) {
    const escaped = escapeUrlAttr(imageUrl);
    lines.push(`<meta property="og:image" content="${escaped}">`);
    lines.push(`<meta name="twitter:image" content="${escaped}">`);
  }
  return lines.join('\n');
}

function sanitizeAbsoluteUrl(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw || raw.length > 2048) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
