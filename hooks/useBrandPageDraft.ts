import { useEffect, useMemo, useState } from 'react';

import { emptyLinkDrafts, type BrandLinkDraft } from '@/lib/brandLinkLogic';
import { buildBrandPreviewHtml } from '@/lib/brandPagePreview';
import type { BrandPage, BrandThemeMode } from '@/lib/brandPages';

const PREVIEW_DEBOUNCE_MS = 500;

export type BrandDraftState = {
  brand_name: string;
  tagline: string;
  about: string;
  theme_mode: BrandThemeMode;
  links: BrandLinkDraft[];
};

function pageSnapshot(page: BrandPage, draft: BrandDraftState) {
  return {
    brand_name: draft.brand_name || page.brand_name,
    tagline: draft.tagline || page.tagline,
    about: draft.about.trim() || page.about,
    logo_url: page.logo_url,
    banner_image_url: page.banner_image_url,
    theme_mode: draft.theme_mode,
    primary_color: page.primary_color,
    secondary_color: page.secondary_color,
    accent_color: page.accent_color,
    background_color: page.background_color,
    text_color: page.text_color,
    border_color: page.border_color,
    plaquinha_id: page.plaquinha_id,
    custom_slug: page.custom_slug,
    is_published: page.is_published,
  };
}

function buildSeed(page: BrandPage | null, links: BrandLinkDraft[] | undefined): BrandDraftState {
  return {
    brand_name: page?.brand_name ?? '',
    tagline: page?.tagline ?? '',
    about: page?.about ?? '',
    theme_mode: page?.theme_mode ?? 'dark',
    links: links ?? emptyLinkDrafts(),
  };
}

export function useBrandPageDraft(page: BrandPage | null, initialLinks: BrandLinkDraft[] | undefined, seedKey: string) {
  const [draft, setDraft] = useState<BrandDraftState>(() => buildSeed(page, initialLinks));
  const [previewHtml, setPreviewHtml] = useState('');
  const [thumbEpoch, setThumbEpoch] = useState(0);
  const [prevSeedKey, setPrevSeedKey] = useState(seedKey);

  // Ajuste de estado durante render quando a semente muda (padrão React: sync props → state).
  if (seedKey !== prevSeedKey) {
    setPrevSeedKey(seedKey);
    setDraft(buildSeed(page, initialLinks));
  }

  useEffect(() => {
    if (!page) {
      return;
    }
    const timer = setTimeout(() => {
      setPreviewHtml(buildBrandPreviewHtml({ page: pageSnapshot(page, draft), links: draft.links }));
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, page]);

  const themeThumbHtml = useMemo(() => {
    if (!page) {
      return { dark: '', light: '', balanced: '' } as Record<BrandThemeMode, string>;
    }
    void thumbEpoch;
    const base = pageSnapshot(page, draft);
    return {
      dark: buildBrandPreviewHtml({ page: base, links: draft.links, themeOverride: 'dark' }),
      light: buildBrandPreviewHtml({ page: base, links: draft.links, themeOverride: 'light' }),
      balanced: buildBrandPreviewHtml({ page: base, links: draft.links, themeOverride: 'balanced' }),
    };
    // Miniaturas: logo/cores + epoch (ao entrar na etapa de temas), não a cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page?.logo_url,
    page?.primary_color,
    page?.secondary_color,
    page?.accent_color,
    page?.text_color,
    draft.brand_name,
    thumbEpoch,
  ]);

  return {
    draft,
    setDraft,
    previewHtml,
    themeThumbHtml,
    refreshThemeThumbs: () => setThumbEpoch((n) => n + 1),
    setBrandName: (brand_name: string) => setDraft((prev) => ({ ...prev, brand_name })),
    setTagline: (tagline: string) => setDraft((prev) => ({ ...prev, tagline })),
    setAbout: (about: string) => setDraft((prev) => ({ ...prev, about })),
    setThemeMode: (theme_mode: BrandThemeMode) => setDraft((prev) => ({ ...prev, theme_mode })),
    setLinks: (links: BrandLinkDraft[]) => setDraft((prev) => ({ ...prev, links })),
    updateLink: (link_type: BrandLinkDraft['link_type'], patch: Partial<BrandLinkDraft>) =>
      setDraft((prev) => ({
        ...prev,
        links: prev.links.map((link) => (link.link_type === link_type ? { ...link, ...patch } : link)),
      })),
  };
}
