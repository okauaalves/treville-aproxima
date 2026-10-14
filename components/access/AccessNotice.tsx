import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

/** Tela de status de acesso (aguardando / negado): ícone em círculo, título, textos e ações. */
export function AccessNotice({
  icon,
  tint,
  tintBg,
  title,
  lines,
  email,
  children,
  testID,
}: {
  icon: ReactNode;
  tint: string;
  tintBg: string;
  title: string;
  lines: string[];
  email?: string | null;
  children?: ReactNode;
  testID?: string;
}) {
  const { colors, fs } = useTheme();
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 }}>
        <Card padding={24}>
          <View testID={testID} style={{ alignItems: 'center', gap: 12 }}>
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: tintBg, borderWidth: 1, borderColor: tint, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              {icon}
            </View>
            <Text accessibilityRole="header" style={[{ color: colors.textPrimary, fontSize: fs(24), textAlign: 'center' }, inter('extrabold')]}>
              {title}
            </Text>
            {lines.map((line) => (
              <Text key={line} style={[{ color: colors.textSecondary, fontSize: fs(15), textAlign: 'center', lineHeight: fs(22) }, inter('regular')]}>
                {line}
              </Text>
            ))}
            {email ? (
              <Text numberOfLines={1} ellipsizeMode="middle" style={[{ color: colors.textMuted, fontSize: fs(13), textAlign: 'center' }, inter('medium')]}>
                {email}
              </Text>
            ) : null}
            <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 8 }}>{children}</View>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
