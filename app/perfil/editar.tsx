import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Camera, Check } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ProfileAvatar } from '@/components/perfil/ProfileIcons';
import { ProfileMiniPreview } from '@/components/perfil/ProfileMiniPreview';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/states';
import { getProfile, updateProfile, uploadAvatar } from '@/lib/perfil';
import { goToLogin } from '@/lib/navigation';
import { isSessionError, plaquinhasAvailable } from '@/lib/plaquinhas';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { BIO_MAX, DEFAULT_THEME_COLOR, DISPLAY_NAME_MAX, PROFILE_COLORS } from '@/supabase/functions/_shared/profilePage';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

const COLOR_NAMES: Record<string, string> = {
  '#1E40AF': 'Azul marinho (padrão)',
  '#3B82F6': 'Azul',
  '#15803D': 'Verde',
  '#7C3AED': 'Roxo',
  '#DC2626': 'Vermelho',
  '#0F172A': 'Grafite',
  '#B45309': 'Âmbar',
  '#BE185D': 'Rosa',
};

function Label({ children }: { children: string }) {
  const { colors, fs } = useTheme();
  return <Text style={[{ color: colors.textMuted, fontSize: fs(12), letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10 }, inter('bold')]}>{children}</Text>;
}

export default function EditarPerfilScreen() {
  const { colors, fs } = useTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const available = plaquinhasAvailable();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_THEME_COLOR);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null);
  const [fallbackName, setFallbackName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!available) {
      setLoading(false);
      return;
    }
    if (!user) {
      goToLogin();
      return;
    }
    try {
      const profile = await getProfile();
      setName(profile.display_name ?? '');
      setBio(profile.bio ?? '');
      setColor(profile.theme_color || DEFAULT_THEME_COLOR);
      setAvatarUrl(profile.avatar_url);
      setFallbackName(profile.full_name ?? '');
      setError(null);
      setLoading(false);
    } catch (failure) {
      if (isSessionError(failure)) {
        goToLogin();
        return;
      }
      setError(failure instanceof Error ? failure.message : 'Não foi possível carregar o perfil.');
      setLoading(false);
    }
  }, [available, user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function pickPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
      if (!result.canceled && result.assets[0]?.uri) {
        setPendingAvatar(result.assets[0].uri);
      }
    } catch {
      useToastStore.getState().show('Não foi possível abrir a galeria.', 'error');
    }
  }

  async function save() {
    setSaving(true);
    try {
      let nextAvatar: string | null | undefined;
      if (pendingAvatar) {
        nextAvatar = await uploadAvatar(pendingAvatar);
      }
      const saved = await updateProfile({ displayName: name, bio, themeColor: color, avatarUrl: nextAvatar });
      setAvatarUrl(saved.avatar_url);
      setPendingAvatar(null);
      useToastStore.getState().show('Perfil salvo.', 'success');
    } catch (failure) {
      if (isSessionError(failure)) {
        goToLogin();
        return;
      }
      useToastStore.getState().show(failure instanceof Error ? failure.message : 'Não foi possível salvar o perfil.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const shownName = name.trim() || fallbackName;
  const avatarUri = pendingAvatar ?? avatarUrl;

  return (
    <Screen>
      <AppHeader title="Meu Perfil Digital" back />
      {!available ? (
        <View style={{ paddingHorizontal: 20 }}>
          <ErrorState title="Perfil precisa de conta e conexão" message="Este app está em modo local, sem servidor. O perfil digital precisa de uma conta conectada." />
        </View>
      ) : loading ? (
        <View style={{ paddingHorizontal: 20 }} accessibilityLabel="Carregando perfil">
          <Skeleton height={140} />
          <Skeleton height={220} />
        </View>
      ) : error ? (
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <ErrorState title="Perfil indisponível" message={error} />
          <PrimaryButton label="Tentar de novo" variant="secondary" onPress={() => { setLoading(true); void load(); }} />
        </View>
      ) : (
        <ScrollView testID="perfil-editar" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 24) + 8, gap: 14 }}>
          <Card padding={18}>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Trocar foto do perfil" onPress={() => void pickPhoto()} style={{ position: 'relative' }}>
                <ProfileAvatar uri={avatarUri} name={shownName || 'Perfil'} color={color} size={96} />
                <View style={{ position: 'absolute', right: -2, bottom: -2, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                  <Camera color={colors.onPrimary} size={16} />
                </View>
              </Pressable>
              <Text style={[{ color: colors.textSecondary, fontSize: fs(12) }, inter('medium')]}>
                {pendingAvatar ? 'Foto nova: será enviada ao salvar.' : 'Toque na foto para trocar.'}
              </Text>
            </View>
          </Card>

          <Card padding={18}>
            <Input
              label="Nome de exibição"
              value={name}
              onChangeText={(value) => setName(value.slice(0, DISPLAY_NAME_MAX))}
              maxLength={DISPLAY_NAME_MAX}
              placeholder={fallbackName || 'Como você quer aparecer'}
            />
            <Input label="Bio" value={bio} onChangeText={(value) => setBio(value.slice(0, BIO_MAX))} maxLength={BIO_MAX} multiline placeholder="Uma frase curta sobre você ou seu negócio" containerStyle={{ marginBottom: 4 }} />
            <Text style={[{ color: bio.length >= BIO_MAX ? colors.warning : colors.textMuted, fontSize: fs(12), textAlign: 'right' }, inter('medium')]}>
              {bio.length}/{BIO_MAX}
            </Text>
          </Card>

          <Card padding={18}>
            <Label>Cor do perfil</Label>
            <View accessibilityRole="radiogroup" accessibilityLabel="Cor do perfil" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {PROFILE_COLORS.map((value) => {
                const selected = value === color;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="radio"
                    accessibilityLabel={COLOR_NAMES[value] ?? value}
                    accessibilityState={{ selected, checked: selected }}
                    onPress={() => setColor(value)}
                    style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: value, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: selected ? colors.textPrimary : 'transparent' }}
                  >
                    {selected ? <Check color="#FFFFFF" size={20} strokeWidth={3} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <View>
            <Label>Preview</Label>
            <ProfileMiniPreview name={shownName} bio={bio.trim()} color={color} avatarUri={avatarUri} />
          </View>

          <PrimaryButton label="Salvar" fullWidth loading={saving} onPress={() => void save()} />
        </ScrollView>
      )}
    </Screen>
  );
}
