import { View } from 'react-native';

/** Web: iframe isolado com o HTML de renderBrandPage. */
export function BrandPagePreview({ html, height = 520 }: { html: string; height?: number }) {
  return (
    <View testID="brand-page-preview" style={{ height, borderRadius: 20, overflow: 'hidden', backgroundColor: '#07101F' }}>
      <iframe
        title="Prévia da Minha Página"
        srcDoc={html || '<!doctype html><html><body></body></html>'}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
      />
    </View>
  );
}
