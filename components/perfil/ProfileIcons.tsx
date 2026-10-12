import { Image, Text, View } from 'react-native';
import { AtSign, BriefcaseBusiness, Globe, Link, Mail, MapPin, MessageCircle, Music2, Phone, ThumbsUp, UtensilsCrossed, type LucideIcon } from 'lucide-react-native';

import type { ProfileIcon } from '@/supabase/functions/_shared/profilePage';
import { inter } from '@/theme/fonts';

const ICONS: Record<ProfileIcon, LucideIcon> = {
  whatsapp: MessageCircle,
  instagram: AtSign,
  tiktok: Music2,
  facebook: ThumbsUp,
  linkedin: BriefcaseBusiness,
  site: Globe,
  phone: Phone,
  email: Mail,
  menu: UtensilsCrossed,
  location: MapPin,
  link: Link,
};

export function ProfileLinkIcon({ icon, color, size = 18 }: { icon: ProfileIcon; color: string; size?: number }) {
  const Icon = ICONS[icon] ?? Link;
  return <Icon color={color} size={size} />;
}

/** Avatar circular: foto (local ou URL pública) ou a inicial do nome na cor do tema. */
export function ProfileAvatar({ uri, name, color, size = 96 }: { uri: string | null; name: string; color: string; size?: number }) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? 'T';
  if (uri) {
    return (
      <Image
        source={{ uri }}
        accessibilityIgnoresInvertColors
        accessibilityLabel={`Foto de ${name || 'perfil'}`}
        style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: color, backgroundColor: '#1E293B' }}
      />
    );
  }
  return (
    <View accessible accessibilityLabel={`Sem foto. Inicial ${initial}`} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[{ color: '#FFFFFF', fontSize: size * 0.42 }, inter('extrabold')]}>{initial}</Text>
    </View>
  );
}
