import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { ProfileAvatar, ProfileLinkIcon } from '@/components/perfil/ProfileIcons';
import type { ProfileIcon } from '@/supabase/functions/_shared/profilePage';
import { inter } from '@/theme/fonts';

const SAMPLE: { title: string; icon: ProfileIcon }[] = [
  { title: 'WhatsApp', icon: 'whatsapp' },
  { title: 'Instagram', icon: 'instagram' },
];

/** Prévia ao vivo (nativa) do visual da página: atualiza a cada tecla sem recarregar HTML. */
export function ProfileMiniPreview({ name, bio, color, avatarUri, links = SAMPLE }: { name: string; bio: string; color: string; avatarUri: string | null; links?: { title: string; icon: ProfileIcon }[] }) {
  return (
    <LinearGradient
      testID="profile-mini-preview"
      colors={['#0F172A', '#1E3A8A', '#0F172A']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 24, padding: 18, alignItems: 'center' }}
    >
      <View style={{ width: '100%', maxWidth: 420, borderRadius: 28, padding: 22, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' }}>
        <ProfileAvatar uri={avatarUri} name={name || 'Perfil'} color={color} size={80} />
        <Text numberOfLines={2} style={[{ color: '#F8FAFC', fontSize: 22, marginTop: 12, textAlign: 'center' }, inter('bold')]}>
          {name || 'Seu nome'}
        </Text>
        {bio ? <Text style={[{ color: '#CBD5E1', fontSize: 14, marginTop: 6, textAlign: 'center', lineHeight: 20 }, inter('regular')]}>{bio}</Text> : null}
        <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 18 }}>
          {links.slice(0, 3).map((link, index) => (
            <View key={`${link.title}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: color, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}>
              <ProfileLinkIcon icon={link.icon} color="#FFFFFF" />
              <Text numberOfLines={1} style={[{ color: '#FFFFFF', fontSize: 16, flex: 1 }, inter('semibold')]}>
                {link.title}
              </Text>
            </View>
          ))}
        </View>
        <Text style={[{ color: '#94A3B8', fontSize: 12, marginTop: 18 }, inter('regular')]}>
          Feito com <Text style={[{ color: color === '#0F172A' ? '#93C5FD' : color }, inter('bold')]}>Tréville Aproxima</Text>
        </Text>
      </View>
    </LinearGradient>
  );
}
