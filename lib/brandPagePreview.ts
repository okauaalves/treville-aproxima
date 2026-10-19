import { Config } from '@/constants/config';
import type { BrandLinkDraft } from '@/lib/brandLinkLogic';
import type { BrandPage, BrandThemeMode } from '@/lib/brandPages';
import { getPublicUrl } from '@/lib/brandPages';
import {
  renderBrandPage,
  sanitizeBrandPage,
  type RawBrandLinkInput,
} from '@/supabase/functions/_shared/brandPageRenderer';

/** Monta HTML de prévia com o mesmo renderBrandPage da Edge Function (Parte 2). */
export function buildBrandPreviewHtml(input: {
  page: Pick<
    BrandPage,
    | 'brand_name'
    | 'tagline'
    | 'logo_url'
    | 'theme_mode'
    | 'primary_color'
    | 'secondary_color'
    | 'accent_color'
    | 'background_color'
    | 'text_color'
    | 'border_color'
  > &
    Partial<Pick<BrandPage, 'plaquinha_id' | 'custom_slug' | 'is_published' | 'banner_image_url' | 'about'>>;
  links: BrandLinkDraft[];
  themeOverride?: BrandThemeMode;
  pageUrl?: string | null;
}): string {
  const links: RawBrandLinkInput[] = input.links
    .filter((link) => link.is_active && link.destination_url.trim())
    .map((link) => ({
      link_type: link.link_type,
      label: link.label,
      description: link.description,
      destination_url: link.destination_url,
      position: link.position,
      is_active: true,
    }));

  const data = sanitizeBrandPage(
    {
      brand_name: input.page.brand_name,
      tagline: input.page.tagline,
      about: input.page.about ?? null,
      logo_url: input.page.logo_url,
      banner_image_url: input.page.banner_image_url ?? null,
      theme_mode: input.themeOverride ?? input.page.theme_mode,
      primary_color: input.page.primary_color,
      secondary_color: input.page.secondary_color,
      accent_color: input.page.accent_color,
      background_color: input.page.background_color,
      text_color: input.page.text_color,
      border_color: input.page.border_color,
      links,
    },
    Config.supabaseUrl,
  );

  const pageUrl =
    input.pageUrl ??
    (input.page.plaquinha_id || input.page.custom_slug
      ? getPublicUrl({
          plaquinha_id: input.page.plaquinha_id ?? null,
          custom_slug: input.page.custom_slug ?? null,
          is_published: input.page.is_published ?? false,
        })
      : null);

  return renderBrandPage(data, { preview: true, pageUrl });
}
