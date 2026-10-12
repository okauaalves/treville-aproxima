import { Linking, View } from 'react-native';
import { WebView } from 'react-native-webview';

/** Página de perfil renderizada (mesmo HTML da Edge Function). Links abrem fora do app. */
export function ProfilePagePreview({ html, height = 640 }: { html: string; height?: number }) {
  return (
    <View testID="profile-page-preview" style={{ height, borderRadius: 20, overflow: 'hidden', backgroundColor: '#0F172A' }}>
      <WebView
        originWhitelist={['about:*']}
        source={{ html }}
        javaScriptEnabled={false}
        domStorageEnabled={false}
        allowFileAccess={false}
        setSupportMultipleWindows={false}
        style={{ backgroundColor: '#0F172A' }}
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
