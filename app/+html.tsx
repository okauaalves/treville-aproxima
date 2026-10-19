import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { APP_NAME, APP_TAGLINE } from '@/constants/config';

const DEFAULT_DESCRIPTION =
  'Tréville Aproxima: plaquinhas NFC e QR dinâmicos, perfil digital e Minha Página para conectar clientes aos seus links.';
const DEFAULT_OG_IMAGE = 'https://nfc-manager.expo.app/favicon.png';
const SITE_URL = 'https://nfc-manager.expo.app';

/**
 * HTML raiz (web / SSR). Roda só em Node — sem DOM nem CSS global aqui.
 * Meta padrão do site; rotas específicas sobrescrevem via `expo-router/head`.
 */
export default function Root({ children }: PropsWithChildren) {
  const { headNodes, bodyNodes, htmlAttributes, bodyAttributes } = useServerDocumentContext();

  return (
    <html lang="pt-BR" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>{APP_NAME}</title>
        <meta name="description" content={DEFAULT_DESCRIPTION} />
        <meta name="robots" content="index, follow" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={APP_NAME} />
        <meta property="og:title" content={APP_NAME} />
        <meta property="og:description" content={DEFAULT_DESCRIPTION} />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:image" content={DEFAULT_OG_IMAGE} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={APP_NAME} />
        <meta name="twitter:description" content={`${APP_NAME} — ${APP_TAGLINE}`} />
        <link rel="canonical" href={SITE_URL} />
        <ScrollViewStyleReset />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
