# E2E Minha Página (Parte 4)

## Fluxo simulado (mesmo path HTTP da tag/QR)
1. Scan/QR abre URL física estável: `https://nfc-manager.expo.app/t/E2E001`
2. Redirect prioriza `brand_page` publicada → `renderBrandPage()`
3. Edita um link e republica — **mesma URL** `/t/E2E001` mostra conteúdo novo

## Hardware
- **NFC físico:** não disponível neste ambiente de agente. A simulação cobre o path HTTP idêntico ao gravado na tag.

## Arquivos
- `01-scan-url-pagina-antes.html` — HTML real de `renderBrandPage` (antes)
- `02-mesma-url-apos-troca-link.html` — mesma URL física, WhatsApp/cardápio atualizados
- Screenshots `*-mobile.png` / `*-desktop.png` gerados via browser MCP
