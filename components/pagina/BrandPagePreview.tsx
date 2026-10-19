import { Linking, View } from 'react-native';
import { WebView } from 'react-native-webview';

/** Prévia da Minha Página (mesmo HTML de renderBrandPage). Links abrem fora do app. */
export function BrandPagePreview({ html, height = 520 }: { html: string; height?: number }) {
  return (
    <View testID="brand-page-preview" style={{ height, borderRadius: 20, overflow: 'hidden', backgroundColor: '#07101F' }}>
      <WebView
        originWhitelist={['about:*']}
        source={{ html: html || '<!doctype html><html><body></body></html>' }}
        javaScriptEnabled={false}
        domStorageEnabled={false}
        allowFileAccess={false}
        setSupportMultipleWindows={false}
        style={{ backgroundColor: '#07101F' }}
        onShouldStartLoadWithRequest={(request) => {
          if (request.url === 'about:blank' || request.url.startsWith('about:')) {
            return true;
          }
          void Linking.openURL(request.url).catch(() => undefined);
          return false;
        }}
      />
    </View>
  );
}
