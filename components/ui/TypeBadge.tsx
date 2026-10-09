import { Calendar, IdCard, Link, Mail, MapPin, MessageCircle, Nfc, Phone, Smartphone, Type, User, Wifi } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { CARD_ICONS } from '@/constants/cardIcons';
import { ContentTypeColors, type ContentType } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeContext';

const ICONS: Record<ContentType, LucideIcon> = {
  WHATSAPP: MessageCircle,
  VCARD: User,
  WIFI: Wifi,
  URL: Link,
  PHONE: Phone,
  EMAIL: Mail,
  LOCATION: MapPin,
  TEXT: Type,
  LINK_APP: Smartphone,
  EVENT: Calendar,
  CUSTOM: IdCard,
};

const NAMED_ICONS: Record<string, LucideIcon> = {};
for (const item of CARD_ICONS) {
  NAMED_ICONS[item.name] = item.icon;
}

function normalize(type: ContentType | string | null | undefined): ContentType | null {
  if (!type) {
    return null;
  }
  const key = type.toUpperCase();
  return key in ICONS ? (key as ContentType) : null;
}

export function TypeBadge({
  type,
  size = 40,
  iconName,
  tint,
}: {
  type: ContentType | string | null | undefined;
  size?: number;
  iconName?: string | null;
  tint?: string | null;
}) {
  const { isDark, colors } = useTheme();
  const contentType = normalize(type);
  const Icon = (iconName ? NAMED_ICONS[iconName] : undefined) ?? (contentType ? ICONS[contentType] : Nfc);
  const color = tint || (contentType ? ContentTypeColors[contentType][isDark ? 'dark' : 'light'] : colors.textSecondary);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}18`, alignItems: 'center', justifyContent: 'center' }}>
      <Icon color={color} size={size * 0.46} strokeWidth={2} />
    </View>
  );
}
