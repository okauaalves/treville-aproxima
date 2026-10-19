import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Check, ImagePlus, Upload } from 'lucide-react-native';
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
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/states';
import { borderAccentFromPalette, extractPaletteFromImage } from '@/lib/colorExtraction';
import { getProfile, updateProfile, uploadAvatar } from '@/lib/perfil';
import { goToLogin } from '@/lib/navigation';
import { isSessionError, plaquinhasAvailable } from '@/lib/plaquinhas';
import { useAuthStore } from '@/stores/authStore';
import { useToastStore } from '@/stores/toastStore';
import { ABOUT_MAX, BIO_MAX, DEFAULT_THEME_COLOR, DISPLAY_NAME_MAX, PROFILE_COLORS } from '@/supabase/functions/_shared/profilePage';
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
  const [about, setAbout] = useState('');
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
      setAbout(profile.about ?? '');
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

  async function pickLogo() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        const uri = result.assets[0].uri;
        setPendingAvatar(uri);
        try {
          const palette = await extractPaletteFromImage(uri);
          setColor(borderAccentFromPalette(palette));
        } catch {
          // Mantém a cor atual; fallback azul já vem da extração em falha.
        }
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
      const saved = await updateProfile({ displayName: name, bio, about, themeColor: color, avatarUrl: nextAvatar });
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
            <View style={{ alignItems: 'center', gap: 14 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={avatarUri ? 'Trocar logo' : 'Adicionar logo'} onPress={() => void pickLogo()}>
                <ProfileAvatar uri={avatarUri} name={shownName || 'Perfil'} color={color} size={96} />
              </Pressable>
              <SecondaryButton
                label={avatarUri ? 'Trocar logo' : 'Adicionar logo'}
                icon={avatarUri ? <Upload color={colors.textPrimary} size={16} /> : <ImagePlus color={colors.textPrimary} size={16} />}
                onPress={() => void pickLogo()}
                fullWidth
                accessibilityLabel={avatarUri ? 'Trocar logo' : 'Adicionar logo'}
              />
              <Text style={[{ color: colors.textSecondary, fontSize: fs(12), textAlign: 'center' }, inter('medium')]}>
                {pendingAvatar ? 'Logo nova: será enviada ao salvar.' : 'Galeria no celular; arquivo de imagem no web. Redimensionamos antes do envio.'}
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
            <Input label="Frase de efeito" value={bio} onChangeText={(value) => setBio(value.slice(0, BIO_MAX))} maxLength={BIO_MAX} multiline placeholder="Ex.: Conectando pessoas e oportunidades" containerStyle={{ marginBottom: 4 }} />
            <Text style={[{ color: bio.length >= BIO_MAX ? colors.warning : colors.textMuted, fontSize: fs(12), textAlign: 'right' }, inter('medium')]}>
              {bio.length}/{BIO_MAX}
            </Text>
            <Input
              label="Sobre (opcional)"
              value={about}
              onChangeText={(value) => setAbout(value.slice(0, ABOUT_MAX))}
              maxLength={ABOUT_MAX}
              multiline
              placeholder="Descrição mais longa. Aparece ao tocar no logo da página pública."
              containerStyle={{ marginBottom: 4, marginTop: 10 }}
              style={{ minHeight: 110 }}
            />
            <Text style={[{ color: about.length >= ABOUT_MAX ? colors.warning : colors.textMuted, fontSize: fs(12), textAlign: 'right' }, inter('medium')]}>
              {about.length}/{ABOUT_MAX}
            </Text>
          </Card>

          <Card padding={18}>
            <Label>Cor do perfil</Label>
            <Text style={[{ color: colors.textSecondary, fontSize: fs(12), marginBottom: 12 }, inter('medium')]}>
              Extraímos a cor da logo ao enviar; você pode trocar depois.
            </Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Cor do perfil" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {!PROFILE_COLORS.includes(color as (typeof PROFILE_COLORS)[number]) ? (
                <View
                  accessibilityLabel={`Cor da logo ${color}`}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.textPrimary }}
                >
                  <Check color="#FFFFFF" size={20} strokeWidth={3} />
                </View>
              ) : null}
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
