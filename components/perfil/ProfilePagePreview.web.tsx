import { View } from 'react-native';

/** Web: iframe isolado (sem scripts, sem mesma origem). Links abrem em nova aba. */
export function ProfilePagePreview({ html, height = 640 }: { html: string; height?: number }) {
  return (
    <View testID="profile-page-preview" style={{ height, borderRadius: 20, overflow: 'hidden', backgroundColor: '#0F172A' }}>
      <iframe
        title="Prévia da página de perfil"
        srcDoc={html}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
      />
    </View>
  );
}
