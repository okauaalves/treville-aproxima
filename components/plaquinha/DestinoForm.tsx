import { Pressable, Text, View } from 'react-native';
import { AtSign, Link, Mail, MapPin, MessageCircle, MessageSquare, Phone, type LucideIcon } from 'lucide-react-native';

import { Input } from '@/components/ui/Input';
import { DESTINATION_LABELS, type DestinationForm, type DestinationType } from '@/lib/plaquinhaLogic';
import { ContentTypeColors } from '@/theme/colors';
import { inter } from '@/theme/fonts';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeContext';

const TYPES: DestinationType[] = ['url', 'whatsapp', 'instagram', 'phone', 'sms', 'email', 'location'];

const ICONS: Record<DestinationType, LucideIcon> = {
  url: Link,
  whatsapp: MessageCircle,
  instagram: AtSign,
  phone: Phone,
  sms: MessageSquare,
  email: Mail,
  location: MapPin,
};

const TINTS: Record<DestinationType, { light: string; dark: string }> = {
  url: ContentTypeColors.URL,
  whatsapp: ContentTypeColors.WHATSAPP,
  instagram: ContentTypeColors.LINK_APP,
  phone: ContentTypeColors.PHONE,
  sms: ContentTypeColors.TEXT,
  email: ContentTypeColors.EMAIL,
  location: ContentTypeColors.LOCATION,
};

export function DestinationIcon({ type, size = 36 }: { type: DestinationType; size?: number }) {
  const { isDark } = useTheme();
  const Icon = ICONS[type] ?? Link;
  const tint = (TINTS[type] ?? TINTS.url)[isDark ? 'dark' : 'light'];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `${tint}18`, alignItems: 'center', justifyContent: 'center' }}>
      <Icon color={tint} size={size * 0.46} strokeWidth={2} />
    </View>
  );
}

/** Seletor de tipo + campos do destino. Converte em URL com buildDestination (mesmos builders do NdefEngine). */
export function DestinoForm({ value, onChange, error }: { value: DestinationForm; onChange: (next: DestinationForm) => void; error?: string | null }) {
  const { colors, fs } = useTheme();
  const set = (patch: Partial<DestinationForm>) => onChange({ ...value, ...patch });
  return (
    <View>
      <Text style={[{ color: colors.textPrimary, fontSize: fs(14), marginBottom: 8 }, inter('bold')]}>Tipo de destino</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {TYPES.map((type) => {
          const selected = value.type === type;
          return (
            <Pressable
              key={type}
              accessibilityRole="radio"
              accessibilityLabel={DESTINATION_LABELS[type]}
              accessibilityState={{ selected }}
              onPress={() => set({ type })}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                minHeight: 44,
                paddingLeft: 6,
                paddingRight: 12,
                borderRadius: radius.pill,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: selected ? colors.primaryGlow : colors.surface,
              }}
            >
              <DestinationIcon type={type} size={30} />
              <Text style={[{ color: selected ? colors.primary : colors.textPrimary, fontSize: fs(14) }, inter(selected ? 'bold' : 'medium')]}>{DESTINATION_LABELS[type]}</Text>
            </Pressable>
          );
        })}
      </View>

      {value.type === 'url' ? <Input label="Link" value={value.url} onChangeText={(url) => set({ url })} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://seusite.com.br" /> : null}
      {value.type === 'whatsapp' || value.type === 'phone' || value.type === 'sms' ? (
        <Input label="Número" value={value.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" placeholder="+55 99 99999-9999" />
      ) : null}
      {value.type === 'whatsapp' || value.type === 'sms' ? (
        <Input label="Mensagem (opcional)" value={value.message} onChangeText={(message) => set({ message })} placeholder="Olá! Gostaria de saber mais informações." multiline />
      ) : null}
      {value.type === 'instagram' ? <Input label="Perfil do Instagram" value={value.instagram} onChangeText={(instagram) => set({ instagram })} autoCapitalize="none" autoCorrect={false} placeholder="@seuperfil" /> : null}
      {value.type === 'email' ? (
        <>
          <Input label="E-mail" value={value.email} onChangeText={(email) => set({ email })} autoCapitalize="none" keyboardType="email-address" placeholder="nome@email.com" />
          <Input label="Assunto (opcional)" value={value.subject} onChangeText={(subject) => set({ subject })} />
        </>
      ) : null}
      {value.type === 'location' ? <Input label="Endereço ou coordenadas" value={value.location} onChangeText={(location) => set({ location })} placeholder="Av. Paulista, 1000 - São Paulo" /> : null}
      {error ? (
        <Text accessibilityRole="alert" style={[{ color: colors.error, fontSize: fs(13), marginTop: -4, marginBottom: 8 }, inter('medium')]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
