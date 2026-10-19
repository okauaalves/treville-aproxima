import fs from 'node:fs';

const b64 = fs.readFileSync('assets/banner-decoration.b64.txt', 'utf8').trim();
const content = `/** Decoração PNG do banner (outline + ondas) embutida como data URI para HTML SSR. */
export const BANNER_DECORATION_DATA_URI =
  'data:image/png;base64,${b64}';

/** Markup do overlay — sempre acima do fundo sólido/banner_image e abaixo do conteúdo. */
export function bannerDecorationMarkup(): string {
  return \`<img class="banner-decor" src="\${BANNER_DECORATION_DATA_URI}" alt="" aria-hidden="true" decoding="async">\`;
}

/** CSS do overlay: cover com proporção; opacidade menor no tema claro. */
export function bannerDecorationCss(): string {
  return \`
.banner-decor{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;pointer-events:none;z-index:0;opacity:.88;user-select:none}
@media(prefers-color-scheme:light){.banner-decor{opacity:.42}}
body[data-theme="light"] .banner-decor{opacity:.42}
body[data-theme="balanced"] .banner-decor{opacity:.7}
\`.trim();
}
`;

fs.writeFileSync('supabase/functions/_shared/bannerDecoration.ts', content, 'utf8');
console.log('wrote', fs.statSync('supabase/functions/_shared/bannerDecoration.ts').size, 'bytes');
